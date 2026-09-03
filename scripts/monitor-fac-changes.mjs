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

const generalSelect = (chunk) => ({
  sql: `SELECT report_id, auditee_ein, auditee_name, audit_year, fy_end_date, fac_accepted_date
        FROM fac_mirror_general WHERE auditee_ein IN (${chunk.map(() => '?').join(',')})`,
  args: chunk,
});

/**
 * Resolve component EINs (in fac_mirror_additional_eins but with no
 * filing of their own) to the covering filing's EIN — same fallback the
 * org page and /portfolio use, so a subrecipient EIN a customer adds is
 * actually monitored via its parent's audit. Returns enteredEin ->
 * coveringEin for the ones that resolve.
 */
async function resolveCovering(missing) {
  if (missing.length === 0) return new Map();
  const links = await chunked(missing, async (chunk) =>
    (
      await client.execute({
        sql: `SELECT a.additional_ein, g.auditee_ein, g.fy_end_date
              FROM fac_mirror_additional_eins a
              JOIN fac_mirror_general g ON g.report_id = a.report_id
              WHERE a.additional_ein IN (${chunk.map(() => '?').join(',')})`,
        args: chunk,
      })
    ).rows
  );
  const cand = new Map();
  for (const l of links) {
    if (!cand.has(l.additional_ein)) cand.set(l.additional_ein, []);
    cand.get(l.additional_ein).push({ parent: l.auditee_ein, fy: l.fy_end_date });
  }
  const out = new Map();
  for (const [entered, list] of cand) {
    if (/^(\d)\1{8}$/.test(entered) || entered === '123456789') continue; // FAC junk placeholders
    const best = list
      .filter((x) => x.parent && x.parent !== entered)
      .sort((a, b) => String(b.fy ?? '').localeCompare(String(a.fy ?? '')))[0];
    if (best) out.set(entered, best.parent);
  }
  return out;
}

async function readWatchedOrgs(enteredEins) {
  // Which entered EINs have a filing of their own?
  const directRows = await chunked(enteredEins, async (chunk) =>
    (await client.execute(generalSelect(chunk))).rows
  );
  const haveDirect = new Set(directRows.map((r) => r.auditee_ein));
  const missing = enteredEins.filter((e) => !haveDirect.has(e));
  const coveringByEntered = await resolveCovering(missing);

  const fetchEins = [
    ...new Set([...enteredEins.filter((e) => haveDirect.has(e)), ...coveringByEntered.values()]),
  ];
  const coveringNew = [...coveringByEntered.values()].filter((e) => !haveDirect.has(e));
  const extraRows = coveringNew.length
    ? await chunked(coveringNew, async (chunk) => (await client.execute(generalSelect(chunk))).rows)
    : [];

  const generalRows = [...directRows, ...extraRows];

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

  const orgByFetchEin = new Map();
  for (const fetchEin of fetchEins) {
    const reports = reportsByEin.get(fetchEin);
    if (!reports) continue;
    reports.sort((a, b) => String(b.fy_end_date ?? '').localeCompare(String(a.fy_end_date ?? '')));
    orgByFetchEin.set(fetchEin, {
      name: reports[0].auditee_name ?? fetchEin,
      reports: reports.map((r) => ({
        report_id: r.report_id,
        audit_year: r.audit_year,
        fy_end_date: r.fy_end_date,
        fac_accepted_date: r.fac_accepted_date,
      })),
      findings: findingsByEin.get(fetchEin) ?? [],
    });
  }

  // Key results under the EIN the customer actually added.
  const orgs = new Map();
  for (const entered of enteredEins) {
    const org = orgByFetchEin.get(coveringByEntered.get(entered) ?? entered);
    if (org) orgs.set(entered, org);
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
  // Every item in a MONITORED portfolio whose owner has an unexpired
  // monitor_access grant — a hand-managed allowlist during validation
  // (monitor_access / scripts/grant-monitor-access.mjs). An EIN in
  // portfolios owned only by lapsed users is simply not monitored (and
  // re-baselines cleanly if they're re-granted).
  const rawRows = (
    await client.execute(
      `SELECT pi.id, p.user_id, pi.ein, pi.label, p.id AS portfolio_id, p.name AS portfolio_name,
              lower(u.email) AS email
       FROM portfolio_item pi
       JOIN portfolio p ON p.id = pi.portfolio_id AND p.monitored = 1
       JOIN users u ON u.id = p.user_id`
    )
  ).rows;
  if (rawRows.length === 0) {
    log('no monitored portfolios — nothing to monitor');
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
    log(`no monitored portfolio items with active monitor_access (${rawRows.length} skipped) — nothing to monitor`);
    return { watched: 0, alerts: 0 };
  }

  // ein -> watchers. One watcher per (user, portfolio) that contains the
  // EIN; alerts fan out to each, tagged with the portfolio for digest
  // grouping.
  const watchersByEin = new Map();
  for (const w of watchRows) {
    if (!watchersByEin.has(w.ein)) watchersByEin.set(w.ein, []);
    watchersByEin.get(w.ein).push({
      userId: w.user_id,
      itemId: w.id,
      label: w.label,
      portfolioId: w.portfolio_id,
      portfolioName: w.portfolio_name,
    });
  }
  const eins = [...watchersByEin.keys()];
  log(
    `${watchRows.length} monitored items${skipped ? ` (${skipped} skipped — no access)` : ''} · ${eins.length} distinct EINs`
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

    // keep the portfolio_item label current
    for (const w of watchersByEin.get(ein)) {
      if (w.label !== snap.orgName) {
        labelFixes.push({
          sql: 'UPDATE portfolio_item SET label = ? WHERE id = ?',
          args: [snap.orgName, w.itemId],
        });
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
      // One alert per (user, portfolio) watching this EIN — an EIN in two
      // of a user's monitored groups shows under both in the digest.
      const seen = new Set();
      for (const w of watchersByEin.get(ein)) {
        const dedupe = `${w.userId}::${w.portfolioId}`;
        if (seen.has(dedupe)) continue;
        seen.add(dedupe);
        writes.push({
          sql: `INSERT INTO monitor_alert (id, user_id, ein, type, payload_json, portfolio_id, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)`,
          args: [
            randomUUID(),
            w.userId,
            ein,
            a.type,
            JSON.stringify({ ...a.payload, ein, orgName: snap.orgName, portfolioName: w.portfolioName }),
            w.portfolioId,
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

const WATCHLIST_URL = `${SITE_URL}/portfolio`;

/** alerts (rows: {type, payload_json}) -> { [groupName]: Map<ein, alerts[]> } */
function groupAlerts(alerts) {
  const groups = new Map();
  for (const a of alerts) {
    const p = JSON.parse(a.payload_json);
    const g = p.portfolioName || 'Monitored organizations';
    if (!groups.has(g)) groups.set(g, new Map());
    const byEin = groups.get(g);
    if (!byEin.has(p.ein)) byEin.set(p.ein, []);
    byEin.get(p.ein).push(a);
  }
  return groups;
}

function alertDetail(a) {
  const p = JSON.parse(a.payload_json);
  let s = TYPE_LABEL[a.type] ?? a.type;
  if (a.type === 'new_audit' && p.auditYear) s += ` — FY ${p.auditYear}`;
  if ((a.type === 'new_finding' || a.type === 'repeat_finding') && p.referenceNumber)
    s += ` — ${p.referenceNumber}`;
  if (a.type === 'deadline' && p.deadline)
    s += ` — due ${p.deadline}${p.state === 'past' ? ' (past due)' : ''}`;
  return s;
}

function renderDigest(alerts, unsubUrl) {
  const groups = groupAlerts(alerts);
  const multiGroup = groups.size > 1;
  const lines = [];
  const html = [];

  for (const [groupName, byEin] of groups) {
    if (multiGroup) {
      lines.push(`\n### ${groupName}`);
      html.push(`<h2 style="margin:24px 0 4px;font-size:16px">${groupName}</h2>`);
    }
    for (const [ein, list] of byEin) {
      const orgName = JSON.parse(list[0].payload_json).orgName || ein;
      lines.push(`\n${orgName}  (EIN ${ein})`);
      html.push(
        `<h3 style="margin:14px 0 4px;font-size:15px">${orgName}</h3>` +
          `<div style="color:#666;font-size:13px;margin-bottom:6px">EIN ${ein} · <a href="${SITE_URL}/single-audit/${ein}">audit history</a></div><ul>`
      );
      for (const a of list) {
        lines.push(`  • ${alertDetail(a)}`);
        html.push(`<li>${alertDetail(a)}</li>`);
      }
      html.push('</ul>');
    }
  }

  const text =
    `Changes to the organizations you monitor on Single Audit Intelligence:\n${lines.join('\n')}\n\n` +
    `Manage: ${WATCHLIST_URL}\n` +
    `Stop these emails: ${unsubUrl}\n`;
  const body =
    `<div style="font-family:system-ui,sans-serif;max-width:560px">` +
    `<p>Changes to the organizations you monitor on <a href="${WATCHLIST_URL}">Single Audit Intelligence</a>:</p>` +
    html.join('') +
    `<p style="color:#888;font-size:12px;margin-top:24px">` +
    `<a href="${WATCHLIST_URL}">Manage</a> · <a href="${unsubUrl}">Unsubscribe from these emails</a></p></div>`;
  return { text, body, groupCount: groups.size };
}

async function sendDigests() {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL || 'Single Audit Intelligence <onboarding@resend.dev>';

  const userIds = (
    await client.execute('SELECT DISTINCT user_id FROM monitor_alert WHERE digest_sent_at IS NULL')
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
      log('RESEND_API_KEY not set — leaving alerts unsent for a later run');
      break;
    }

    const alerts = (
      await client.execute({
        sql: `SELECT type, payload_json FROM monitor_alert
              WHERE user_id = ? AND digest_sent_at IS NULL ORDER BY portfolio_id, ein, created_at`,
        args: [userId],
      })
    ).rows;
    const distinctEins = new Set(alerts.map((a) => JSON.parse(a.payload_json).ein));

    const unsubUrl = `${SITE_URL}/api/monitor/unsubscribe?u=${encodeURIComponent(userId)}&t=${unsubscribeToken(userId)}`;
    const { text, body } = renderDigest(alerts, unsubUrl);
    const subject =
      distinctEins.size === 1
        ? `Watchlist update: ${JSON.parse(alerts[0].payload_json).orgName || 'an organization'}`
        : `Watchlist update: ${distinctEins.size} organizations`;

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
      log(`digest sent to ${email} (${distinctEins.size} orgs, ${alerts.length} changes)`);
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
