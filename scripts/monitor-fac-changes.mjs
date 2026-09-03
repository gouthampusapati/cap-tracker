#!/usr/bin/env node
/**
 * Continuous-monitoring job (Founding Customer Validation Plan) — runs
 * weekly, after the FAC mirror sync. For every EIN on a customer's
 * watchlist:
 *   1. read its current state from the local mirror (0 FAC calls),
 *   2. diff against the last-seen snapshot in monitor_state,
 *   3. write monitor_alert rows for new audits / findings / repeat
 *      findings / management-decision deadlines,
 *   4. update monitor_state.
 * Then send each customer one digest email of their unsent alerts.
 *
 * Standalone Node (a GitHub Actions job, not the Next app) — talks to
 * Turso and Resend directly, does NOT import the app's server-only libs.
 * Needs DATABASE_URL + TURSO_AUTH_TOKEN; RESEND_API_KEY + RESEND_FROM_EMAIL
 * for digests (no-ops with a log line if unset); WAITLIST_NOTIFY_EMAIL
 * for the on-failure alert to the owner.
 *
 * A snapshot with no prior monitor_state row is BASELINED (recorded, no
 * alerts) — monitoring tells you what changes from the moment you start.
 */
import { createClient } from '@libsql/client';
import { randomUUID, createHmac } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { buildSnapshot, diffSnapshot } from './lib/monitor-snapshot.mjs';

if (existsSync('.env.local')) {
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL is not set — refusing to run.');
  process.exit(1);
}
const client = createClient({
  url: DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const SITE_URL = (
  process.env.NEXT_PUBLIC_URL ||
  process.env.NEXTAUTH_URL ||
  'https://www.singleauditintel.com'
).replace(/\/+$/, '');
const BATCH = 500;
const IN_CHUNK = 400;
const now = new Date();
const nowSec = Math.floor(now.getTime() / 1000);

const log = (m) => console.log(`[monitor] ${new Date().toISOString()} ${m}`);

/** Unsubscribe token — keep in lockstep with lib/monitor-token.ts. */
function unsubscribeToken(userId) {
  return createHmac('sha256', process.env.NEXTAUTH_SECRET || 'dev-secret')
    .update(`monitor-unsub:${userId}`)
    .digest('base64url')
    .slice(0, 24);
}

async function chunked(ids, fn) {
  const out = [];
  for (let i = 0; i < ids.length; i += IN_CHUNK) out.push(...(await fn(ids.slice(i, i + IN_CHUNK))));
  return out;
}

/* --- read every watched org from the mirror ------------------------- */

async function readWatchedOrgs(eins) {
  const generalRows = await chunked(eins, async (chunk) =>
    (
      await client.execute({
        sql: `SELECT report_id, auditee_ein, auditee_name, audit_year, fy_end_date, fac_accepted_date
              FROM fac_mirror_general WHERE auditee_ein IN (${chunk.map(() => '?').join(',')})`,
        args: chunk,
      })
    ).rows
  );

  const reportsByEin = new Map();
  const einByReport = new Map();
  for (const r of generalRows) {
    einByReport.set(r.report_id, r.auditee_ein);
    if (!reportsByEin.has(r.auditee_ein)) reportsByEin.set(r.auditee_ein, []);
    reportsByEin.get(r.auditee_ein).push(r);
  }

  const reportIds = [...einByReport.keys()];
  const findingRows = reportIds.length
    ? await chunked(reportIds, async (chunk) =>
        (
          await client.execute({
            sql: `SELECT report_id, reference_number, is_repeat_finding
                  FROM fac_mirror_findings WHERE report_id IN (${chunk.map(() => '?').join(',')})`,
            args: chunk,
          })
        ).rows
      )
    : [];

  // Collapse multi-award finding rows to one per (report_id, reference_number).
  const findingsByEin = new Map();
  const seen = new Map();
  for (const f of findingRows) {
    const ein = einByReport.get(f.report_id);
    if (!ein) continue;
    const key = `${f.report_id}::${f.reference_number}`;
    const isRepeat = String(f.is_repeat_finding ?? '').trim().toUpperCase() === 'Y';
    if (seen.has(key)) {
      if (isRepeat) seen.get(key).isRepeatFinding = true;
      continue;
    }
    const row = { reportId: f.report_id, facFindingId: f.reference_number, isRepeatFinding: isRepeat };
    seen.set(key, row);
    if (!findingsByEin.has(ein)) findingsByEin.set(ein, []);
    findingsByEin.get(ein).push(row);
  }

  const orgs = new Map();
  for (const ein of eins) {
    const reports = reportsByEin.get(ein);
    if (!reports) continue; // not in the mirror
    reports.sort((a, b) => String(b.fy_end_date ?? '').localeCompare(String(a.fy_end_date ?? '')));
    orgs.set(ein, {
      name: reports[0].auditee_name ?? ein,
      reports: reports.map((r) => ({
        report_id: r.report_id,
        audit_year: r.audit_year,
        fy_end_date: r.fy_end_date,
        fac_accepted_date: r.fac_accepted_date,
      })),
      findings: findingsByEin.get(ein) ?? [],
    });
  }
  return orgs;
}

/* --- monitor_state I/O -------------------------------------------- */

const parseArr = (s) => {
  try {
    const v = JSON.parse(s ?? '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
};

async function loadState(eins) {
  const rows = await chunked(eins, async (chunk) =>
    (
      await client.execute({
        sql: `SELECT * FROM monitor_state WHERE ein IN (${chunk.map(() => '?').join(',')})`,
        args: chunk,
      })
    ).rows
  );
  const map = new Map();
  for (const r of rows) {
    map.set(r.ein, {
      latestReportId: r.latest_report_id ?? null,
      latestAuditYear: r.latest_audit_year ?? null,
      latestFacAcceptedDate: r.latest_fac_accepted_date ?? null,
      findingRefs: parseArr(r.finding_refs),
      repeatFindingRefs: parseArr(r.repeat_finding_refs),
      soonestMdDeadline: r.soonest_md_deadline ?? null,
      mdDeadlineAlerted: r.md_deadline_alerted ?? null,
    });
  }
  return map;
}

function stateUpsert(ein, snap, mdDeadlineAlerted) {
  return {
    sql: `INSERT INTO monitor_state
            (ein, org_name, latest_report_id, latest_audit_year, latest_fac_accepted_date,
             finding_refs, repeat_finding_refs, soonest_md_deadline, md_deadline_alerted, checked_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(ein) DO UPDATE SET
            org_name = excluded.org_name,
            latest_report_id = excluded.latest_report_id,
            latest_audit_year = excluded.latest_audit_year,
            latest_fac_accepted_date = excluded.latest_fac_accepted_date,
            finding_refs = excluded.finding_refs,
            repeat_finding_refs = excluded.repeat_finding_refs,
            soonest_md_deadline = excluded.soonest_md_deadline,
            md_deadline_alerted = excluded.md_deadline_alerted,
            checked_at = excluded.checked_at`,
    args: [
      ein,
      snap.orgName ?? null,
      snap.latestReportId,
      snap.latestAuditYear,
      snap.latestFacAcceptedDate,
      JSON.stringify(snap.findingRefs ?? []),
      JSON.stringify(snap.repeatFindingRefs ?? []),
      snap.soonestMdDeadline,
      mdDeadlineAlerted,
      nowSec,
    ],
  };
}

/* --- the diff pass ------------------------------------------------- */

async function runDiff() {
  // Only watchlist rows whose user has an unexpired monitor_access grant
  // are monitored — during validation that's a hand-managed allowlist
  // (monitor_access, or scripts/grant-monitor-access.mjs). Filter up
  // front: an EIN watched only by lapsed users is simply not monitored
  // (and re-baselines cleanly if they're re-granted).
  const rawRows = (
    await client.execute(
      `SELECT w.id, w.user_id, w.ein, w.label, lower(u.email) AS email
       FROM watchlist w JOIN users u ON u.id = w.user_id`
    )
  ).rows;
  if (rawRows.length === 0) {
    log('watchlist is empty — nothing to monitor');
    return { watched: 0, alerts: 0 };
  }

  const activeEmails = new Set(
    (
      await client.execute({
        sql: 'SELECT lower(email) AS email FROM monitor_access WHERE expires_at > ?',
        args: [nowSec],
      })
    ).rows.map((r) => r.email)
  );
  const watchRows = rawRows.filter((w) => w.email && activeEmails.has(w.email));
  const skipped = rawRows.length - watchRows.length;
  if (watchRows.length === 0) {
    log(`no watchlist rows with active monitor_access (${rawRows.length} rows skipped) — nothing to monitor`);
    return { watched: 0, alerts: 0 };
  }

  const watchersByEin = new Map();
  for (const w of watchRows) {
    if (!watchersByEin.has(w.ein)) watchersByEin.set(w.ein, []);
    watchersByEin.get(w.ein).push({ userId: w.user_id, watchId: w.id, label: w.label });
  }
  const eins = [...watchersByEin.keys()];
  log(
    `${watchRows.length} active watchlist rows${skipped ? ` (${skipped} skipped — no access)` : ''} · ${eins.length} distinct EINs`
  );

  const [orgs, states] = await Promise.all([readWatchedOrgs(eins), loadState(eins)]);

  const writes = [];
  const labelFixes = [];
  let alertCount = 0;
  let baselined = 0;

  for (const ein of eins) {
    const org = orgs.get(ein);
    const prev = states.get(ein);

    // Watched EIN with no mirror record: baseline an empty state so a
    // first-ever filing later trips new_audit.
    if (!org) {
      if (!prev) {
        writes.push(
          stateUpsert(
            ein,
            {
              orgName: null,
              latestReportId: null,
              latestAuditYear: null,
              latestFacAcceptedDate: null,
              findingRefs: [],
              repeatFindingRefs: [],
              soonestMdDeadline: null,
            },
            null
          )
        );
        baselined++;
      }
      continue;
    }

    const snap = buildSnapshot(org, now);

    // keep the watchlist label current
    for (const w of watchersByEin.get(ein)) {
      if (w.label !== snap.orgName) {
        labelFixes.push({ sql: 'UPDATE watchlist SET label = ? WHERE id = ?', args: [snap.orgName, w.watchId] });
      }
    }

    if (!prev) {
      // Baseline is silent. If a management-decision deadline is already
      // in the warning window the moment monitoring starts, record it as
      // "already alerted" so it doesn't fire on the next run — a
      // pre-existing deadline isn't a change.
      const alreadyInWindow =
        snap.soonestMdDeadlineState === 'due-soon' || snap.soonestMdDeadlineState === 'past';
      writes.push(stateUpsert(ein, snap, alreadyInWindow ? snap.soonestMdDeadline : null));
      baselined++;
      continue;
    }

    const alerts = diffSnapshot(prev, snap);
    let mdAlerted = prev.mdDeadlineAlerted;
    for (const a of alerts) {
      if (a.type === 'deadline') mdAlerted = snap.soonestMdDeadline;
      for (const w of watchersByEin.get(ein)) {
        writes.push({
          sql: `INSERT INTO monitor_alert (id, user_id, ein, type, payload_json, created_at)
                VALUES (?, ?, ?, ?, ?, ?)`,
          args: [
            randomUUID(),
            w.userId,
            ein,
            a.type,
            JSON.stringify({ ...a.payload, ein, orgName: snap.orgName }),
            nowSec,
          ],
        });
        alertCount++;
      }
    }
    writes.push(stateUpsert(ein, snap, mdAlerted));
  }

  const all = [...writes, ...labelFixes];
  for (let i = 0; i < all.length; i += BATCH) await client.batch(all.slice(i, i + BATCH), 'write');

  log(`diff: ${alertCount} alert rows, ${baselined} EINs baselined`);
  return { watched: eins.length, alerts: alertCount };
}

/* --- digest phase ----------------------------------------------------- */

const TYPE_LABEL = {
  new_audit: 'New Single Audit filed',
  new_finding: 'New audit finding',
  repeat_finding: 'Repeat finding',
  deadline: 'Management-decision deadline approaching',
};

function renderDigest(email, byEin, unsubUrl) {
  const lines = [];
  const html = [];
  for (const [ein, alerts] of byEin) {
    const orgName = JSON.parse(alerts[0].payload_json).orgName || ein;
    lines.push(`\n${orgName}  (EIN ${ein})`);
    html.push(
      `<h3 style="margin:18px 0 4px">${orgName}</h3><div style="color:#666;font-size:13px;margin-bottom:6px">EIN ${ein} · <a href="${SITE_URL}/single-audit/${ein}">audit history</a></div><ul>`
    );
    for (const a of alerts) {
      const p = JSON.parse(a.payload_json);
      let detail = TYPE_LABEL[a.type] ?? a.type;
      if (a.type === 'new_audit' && p.auditYear) detail += ` — FY ${p.auditYear}`;
      if ((a.type === 'new_finding' || a.type === 'repeat_finding') && p.referenceNumber)
        detail += ` — ${p.referenceNumber}`;
      if (a.type === 'deadline' && p.deadline)
        detail += ` — due ${p.deadline}${p.state === 'past' ? ' (past due)' : ''}`;
      lines.push(`  • ${detail}`);
      html.push(`<li>${detail}</li>`);
    }
    html.push('</ul>');
  }

  const text =
    `Changes to the organizations on your Single Audit Intelligence watchlist:\n${lines.join('\n')}\n\n` +
    `View your watchlist: ${SITE_URL}/watchlist\n` +
    `Stop these emails: ${unsubUrl}\n`;
  const body =
    `<div style="font-family:system-ui,sans-serif;max-width:560px">` +
    `<p>Changes to the organizations on your <a href="${SITE_URL}/watchlist">Single Audit Intelligence watchlist</a>:</p>` +
    html.join('') +
    `<p style="color:#888;font-size:12px;margin-top:24px">` +
    `<a href="${SITE_URL}/watchlist">Manage watchlist</a> · <a href="${unsubUrl}">Unsubscribe from these emails</a></p></div>`;
  return { text, body };
}

async function sendDigests() {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL || 'Single Audit Intelligence <onboarding@resend.dev>';

  const userIds = (
    await client.execute(
      'SELECT DISTINCT user_id FROM monitor_alert WHERE digest_sent_at IS NULL ORDER BY user_id'
    )
  ).rows.map((r) => r.user_id);
  if (userIds.length === 0) {
    log('no unsent alerts — no digests');
    return { digests: 0 };
  }

  const users = new Map(
    (
      await chunked(userIds, async (chunk) =>
        (
          await client.execute({
            sql: `SELECT id, email FROM users WHERE id IN (${chunk.map(() => '?').join(',')})`,
            args: chunk,
          })
        ).rows
      )
    ).map((r) => [r.id, r.email])
  );
  const optedOut = new Set(
    (
      await chunked(userIds, async (chunk) =>
        (
          await client.execute({
            sql: `SELECT user_id FROM monitor_prefs WHERE digest_opt_out = 1 AND user_id IN (${chunk
              .map(() => '?')
              .join(',')})`,
            args: chunk,
          })
        ).rows
      )
    ).map((r) => r.user_id)
  );

  let sent = 0;
  let warnedNoKey = false;
  for (const userId of userIds) {
    const markSent = () =>
      client.execute({
        sql: 'UPDATE monitor_alert SET digest_sent_at = ? WHERE user_id = ? AND digest_sent_at IS NULL',
        args: [nowSec, userId],
      });

    const email = users.get(userId);
    // No deliverable email or an explicit opt-out: mark the alerts sent
    // (they still show on /watchlist) so they don't pile up forever —
    // regardless of whether Resend is configured.
    if (!email || String(email).endsWith('@sai.guest')) {
      log(`user ${userId}: no real email — marking alerts sent, skipping`);
      await markSent();
      continue;
    }
    if (optedOut.has(userId)) {
      log(`user ${userId}: opted out of digests — marking alerts sent, skipping email`);
      await markSent();
      continue;
    }
    if (!apiKey) {
      // Can't email this user now — but DON'T break: users later in the
      // list may be opted-out or guest-email and still need markSent()
      // (row order here is unspecified — SELECT DISTINCT with no ORDER
      // BY). Skip just this one; their alerts wait for a run with a key.
      if (!warnedNoKey) {
        log('RESEND_API_KEY not set — leaving real-email digests unsent for a later run');
        warnedNoKey = true;
      }
      continue;
    }

    const alerts = (
      await client.execute({
        sql: `SELECT type, payload_json FROM monitor_alert
              WHERE user_id = ? AND digest_sent_at IS NULL ORDER BY ein, created_at`,
        args: [userId],
      })
    ).rows;
    const byEin = new Map();
    for (const a of alerts) {
      const ein = JSON.parse(a.payload_json).ein;
      if (!byEin.has(ein)) byEin.set(ein, []);
      byEin.get(ein).push(a);
    }

    const unsubUrl = `${SITE_URL}/api/monitor/unsubscribe?u=${encodeURIComponent(userId)}&t=${unsubscribeToken(userId)}`;
    const { text, body } = renderDigest(email, byEin, unsubUrl);
    const subject =
      byEin.size === 1
        ? `Watchlist update: ${JSON.parse(alerts[0].payload_json).orgName || 'an organization'}`
        : `Watchlist update: ${byEin.size} organizations`;

    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from,
          to: email,
          subject,
          text,
          html: body,
          headers: { 'List-Unsubscribe': `<${unsubUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
        }),
      });
      if (!res.ok) {
        log(`digest to ${email} failed: HTTP ${res.status} — leaving unsent`);
        continue;
      }
      await markSent();
      sent++;
      log(`digest sent to ${email} (${byEin.size} orgs, ${alerts.length} changes)`);
    } catch (err) {
      log(`digest to ${email} threw: ${err instanceof Error ? err.message : String(err)} — leaving unsent`);
    }
  }
  return { digests: sent };
}

/* --- on-failure alert to the owner --------------------------------- */

async function notifyOnFailure(message) {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.WAITLIST_NOTIFY_EMAIL;
  if (!apiKey || !to) {
    log('RESEND_API_KEY or WAITLIST_NOTIFY_EMAIL not set — skipping failure email');
    return;
  }
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev',
        to,
        subject: 'Monitor job failed',
        text: `The weekly continuous-monitoring job failed:\n\n${message}\n\nCheck the GitHub Actions run log. monitor_state / monitor_alert were left as-is; the diff is idempotent so the next run re-applies.`,
      }),
    });
  } catch (err) {
    log(`failure email itself threw: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/* --- main --------------------------------------------------------- */

async function main() {
  try {
    const diff = await runDiff();
    const digest = await sendDigests();
    log(`done: ${JSON.stringify({ ...diff, ...digest })}`);
  } catch (err) {
    const message = err instanceof Error ? (err.stack ?? err.message) : String(err);
    log(`MONITOR JOB FAILED: ${message}`);
    await notifyOnFailure(message);
    process.exitCode = 1;
  } finally {
    client.close();
  }
}

main();
