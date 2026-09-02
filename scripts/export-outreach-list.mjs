#!/usr/bin/env node
/**
 * Build a cold-outreach list of audited organizations (pass-throughs /
 * recipients — the ICP for the monitoring product) from the local FAC
 * bulk mirror. ZERO FAC API calls — reads Turso only.
 *
 * What it does:
 *   1. Pulls every fac_mirror_general filing that matches the coarse
 *      filter (recent enough, right entity type, has an @-email).
 *   2. Dedupes to ONE row per organization (auditee_ein), keeping the
 *      most-recent filing's contact — the freshest email/name/phone.
 *   3. Joins fac_mirror_org_summary for targeting signals
 *      (findings_count, going-concern, total_expended, audit_count).
 *   4. Flags multi-EIN orgs (appear in fac_mirror_additional_eins) —
 *      complex entities, disproportionately pass-throughs.
 *   5. Suppresses anyone already in founding_signups.
 *   6. Dedupes shared emails (a fiscal agent listed for several orgs),
 *      keeping the highest-scoring org.
 *   7. Scores each org by likely monitoring pain and writes a CSV,
 *      highest score first.
 *
 * The CSV is a starting point, NOT a send list — every address still
 * needs bounce verification (MillionVerifier / ZeroBounce) before it
 * goes anywhere near a sending tool. "Present in a 2022 filing" is not
 * "deliverable in 2026".
 *
 * Usage:
 *   node --env-file=.env.local scripts/export-outreach-list.mjs
 *   node --env-file=.env.local scripts/export-outreach-list.mjs \
 *     --min-year 2023 --entity-types non-profit,higher-ed \
 *     --min-findings 1 --title "finance|cfo|controller|treasurer|director" \
 *     --limit 20000 --out ./outreach-nonprofits.csv
 *
 * Needs DATABASE_URL + TURSO_AUTH_TOKEN in the environment.
 */

import { createClient } from '@libsql/client';
import { writeFile } from 'node:fs/promises';

// ---- args -----------------------------------------------------------------

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 2) {
    const k = argv[i]?.replace(/^--/, '');
    if (k) out[k] = argv[i + 1];
  }
  return out;
}
const a = parseArgs(process.argv.slice(2));

const MIN_YEAR = a['min-year'] ?? '2022';
const ENTITY_TYPES = (a['entity-types'] ?? 'non-profit,local,higher-ed')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const MIN_FINDINGS = Number(a['min-findings'] ?? 0);
const TITLE_RE = a['title'] ? new RegExp(a['title'], 'i') : null;
const LIMIT = a['limit'] ? Number(a['limit']) : Infinity;
const OUT_PATH = a['out'] ?? './outreach-list.csv';

// ---- db -----------------------------------------------------------------

const { DATABASE_URL, TURSO_AUTH_TOKEN } = process.env;
if (!DATABASE_URL) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}
const db = createClient(
  TURSO_AUTH_TOKEN ? { url: DATABASE_URL, authToken: TURSO_AUTH_TOKEN } : { url: DATABASE_URL }
);

const log = (m) => console.log(`[export-outreach] ${m}`);

// ---- helpers ----------------------------------------------------------------

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function normEmail(v) {
  const e = String(v ?? '').trim().toLowerCase();
  return EMAIL_RE.test(e) && !e.includes('gsa_migration') ? e : null;
}

function normPhone(v) {
  const d = String(v ?? '').replace(/\D/g, '');
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  if (d.length === 11 && d[0] === '1') return `${d.slice(1, 4)}-${d.slice(4, 7)}-${d.slice(7)}`;
  return String(v ?? '').trim() || null;
}

// FAC stores many names/titles in ALL CAPS. Down-case those to title
// case so a mail-merge {{firstName}} reads "Julio" not "JULIO"; leave
// already-mixed-case values untouched (don't mangle "McKinsey" etc).
function titleCase(s) {
  const v = String(s ?? '').trim().replace(/\s+/g, ' ');
  if (!v || /[a-z]/.test(v)) return v;
  return v.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

// Rough "how much would continuous monitoring help this org" score.
// Heuristic — re-sort in your sending tool if you disagree with it.
function painScore({ findingsCount, goingConcern, totalExpended, auditCount, multiEin }) {
  let s = Math.min(findingsCount, 20) * 3;
  if (goingConcern) s += 40;
  const exp = totalExpended || 0;
  s += exp >= 250e6 ? 20 : exp >= 50e6 ? 15 : exp >= 10e6 ? 10 : exp >= 1e6 ? 5 : 0;
  if (multiEin) s += 15;
  s += Math.min(auditCount, 8);
  return s;
}

function csvCell(v) {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function pageAll(sql, args = []) {
  // Keyset pagination on auditee_ein so a big result never has to come
  // back in one HTTP response (Turso free tier is happier this way).
  const PAGE = 20000;
  let after = '';
  const rows = [];
  for (;;) {
    const res = await db.execute({
      sql: `${sql} AND auditee_ein > ? ORDER BY auditee_ein LIMIT ${PAGE}`,
      args: [...args, after],
    });
    rows.push(...res.rows);
    if (res.rows.length < PAGE) break;
    after = res.rows[res.rows.length - 1].auditee_ein;
  }
  return rows;
}

// ---- main -----------------------------------------------------------------

(async () => {
  log(
    `filters: audit_year >= ${MIN_YEAR} · entity_type in (${ENTITY_TYPES.join(', ')}) · ` +
      `min findings ${MIN_FINDINGS}${TITLE_RE ? ` · title ~ /${TITLE_RE.source}/i` : ''}`
  );

  const etPlaceholders = ENTITY_TYPES.map(() => '?').join(', ');
  const generalRows = await pageAll(
    `SELECT auditee_ein, audit_year, fac_accepted_date, report_id, entity_type,
            auditee_name, auditee_city, auditee_state,
            auditee_contact_name, auditee_contact_title, auditee_email, auditee_phone
       FROM fac_mirror_general
      WHERE audit_year >= ?
        AND entity_type IN (${etPlaceholders})
        AND auditee_email LIKE '%_@_%._%'`,
    [MIN_YEAR, ...ENTITY_TYPES]
  );
  log(`${generalRows.length} filings match the coarse filter`);

  // 2. dedupe to one row per org — most recent filing wins
  const byEin = new Map();
  for (const r of generalRows) {
    const cur = byEin.get(r.auditee_ein);
    const key = `${r.audit_year ?? ''}|${r.fac_accepted_date ?? ''}`;
    if (!cur || key > cur._key) byEin.set(r.auditee_ein, { ...r, _key: key });
  }
  log(`${byEin.size} distinct organizations`);

  // 3. targeting signals — whole org_summary table into a Map (~68K, small)
  const summary = new Map();
  for (const r of (await db.execute(
    `SELECT auditee_ein, audit_count, findings_count, is_going_concern, total_expended
       FROM fac_mirror_org_summary`
  )).rows) {
    summary.set(r.auditee_ein, r);
  }

  // 4. multi-EIN flag — an org whose winning report has additional EINs,
  //    or whose EIN itself is listed as an additional_ein somewhere.
  const reportsWithExtras = new Set();
  const einsAsAdditional = new Set();
  for (const r of (await db.execute(
    `SELECT report_id, additional_ein FROM fac_mirror_additional_eins`
  )).rows) {
    reportsWithExtras.add(r.report_id);
    if (r.additional_ein) einsAsAdditional.add(r.additional_ein);
  }

  // 5. suppression — founding_signups emails
  const suppressed = new Set(
    (await db.execute(`SELECT email FROM founding_signups`)).rows
      .map((r) => String(r.email ?? '').trim().toLowerCase())
      .filter(Boolean)
  );
  log(`${suppressed.size} suppressed email(s) from founding_signups`);

  // 6. build rows
  const drop = { badEmail: 0, suppressed: 0, minFindings: 0, title: 0, noSummary: 0, sharedEmail: 0 };
  const byEmail = new Map();

  for (const r of byEin.values()) {
    const email = normEmail(r.auditee_email);
    if (!email) {
      drop.badEmail++;
      continue;
    }
    if (suppressed.has(email)) {
      drop.suppressed++;
      continue;
    }
    if (TITLE_RE && !TITLE_RE.test(r.auditee_contact_title ?? '')) {
      drop.title++;
      continue;
    }
    const s = summary.get(r.auditee_ein);
    if (!s) {
      drop.noSummary++;
      continue;
    }
    const findingsCount = Number(s.findings_count ?? 0);
    if (findingsCount < MIN_FINDINGS) {
      drop.minFindings++;
      continue;
    }

    const multiEin = reportsWithExtras.has(r.report_id) || einsAsAdditional.has(r.auditee_ein);
    const goingConcern = Number(s.is_going_concern ?? 0) === 1;
    const totalExpended = Number(s.total_expended ?? 0);
    const auditCount = Number(s.audit_count ?? 0);

    const row = {
      ein: r.auditee_ein,
      org_name: titleCase(r.auditee_name),
      entity_type: r.entity_type,
      state: r.auditee_state,
      city: titleCase(r.auditee_city),
      contact_name: titleCase(r.auditee_contact_name),
      contact_title: titleCase(r.auditee_contact_title),
      email,
      phone: normPhone(r.auditee_phone),
      most_recent_audit_year: r.audit_year,
      audit_count: auditCount,
      findings_count: findingsCount,
      is_going_concern: goingConcern ? 1 : 0,
      total_expended_usd: Math.round(totalExpended),
      multi_ein: multiEin ? 1 : 0,
      pain_score: painScore({ findingsCount, goingConcern, totalExpended, auditCount, multiEin }),
    };

    // shared-email dedupe — keep the higher-scoring org
    const existing = byEmail.get(email);
    if (!existing) byEmail.set(email, row);
    else {
      drop.sharedEmail++;
      if (row.pain_score > existing.pain_score) byEmail.set(email, row);
    }
  }

  let rows = [...byEmail.values()].sort((x, y) => y.pain_score - x.pain_score);
  if (Number.isFinite(LIMIT)) rows = rows.slice(0, LIMIT);

  // 7. write
  const cols = Object.keys(rows[0] ?? { ein: '' });
  const csv = [cols.join(','), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(','))].join('\n');
  await writeFile(OUT_PATH, csv + '\n');

  // ---- report ----
  const et = {};
  for (const r of rows) et[r.entity_type] = (et[r.entity_type] ?? 0) + 1;
  log('');
  log(`dropped:  ${drop.badEmail} bad email · ${drop.suppressed} suppressed · ` +
      `${drop.minFindings} < min findings · ${drop.title} title mismatch · ` +
      `${drop.noSummary} no summary row · ${drop.sharedEmail} shared email`);
  log(`by entity_type: ${Object.entries(et).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
  log(`multi-EIN: ${rows.filter((r) => r.multi_ein).length} · ` +
      `going-concern: ${rows.filter((r) => r.is_going_concern).length}`);
  log('');
  log(`top 10 by pain_score:`);
  for (const r of rows.slice(0, 10)) {
    log(`  ${String(r.pain_score).padStart(3)}  ${r.org_name} (${r.state}) — ` +
        `${r.findings_count}f${r.is_going_concern ? ' GC' : ''}${r.multi_ein ? ' multi-EIN' : ''} — ${r.email}`);
  }
  log('');
  log(`✓ wrote ${rows.length} rows -> ${OUT_PATH}`);
  log(`  NEXT: verify every address (MillionVerifier/ZeroBounce) before loading into a sender.`);

  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
