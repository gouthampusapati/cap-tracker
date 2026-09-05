/**
 * One-off: find EINs whose monitoring should fire on the next weekly run.
 *
 * Strategy A (strongest) — a report FAC has ALREADY accepted that our
 * mirror doesn't have yet. The Monday sync ingests it → the monitor job
 * sees a new report on an EIN it's already tracking → `new_audit`
 * (+ any `new_finding` / `repeat_finding`). Near-certain to fire.
 *
 * Strategy B (deterministic, mirror-only) — an org whose management-
 * decision deadline (fac_accepted_date + 6 months) crosses INTO the
 * 30-day "due soon" window between today and the next run → `deadline`.
 *
 * Usage: node scripts/find-monitoring-test-eins.mjs
 * Needs DATABASE_URL + TURSO_AUTH_TOKEN + FAC_API_KEY (.env.local).
 */
import { createClient } from '@libsql/client';
import { readFileSync, existsSync } from 'node:fs';

if (existsSync('.env.local')) {
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const db = createClient({ url: process.env.DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });
const FAC_KEYS = [process.env.FAC_API_KEY, process.env.FAC_API_KEY_FALLBACK].filter(Boolean);
const FAC = 'https://api.fac.gov';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const iso = (d) => d.toISOString().slice(0, 10);
const addMonths = (dateStr, n) => {
  const d = new Date(dateStr + 'T00:00:00Z');
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + n);
  const dim = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, dim));
  return iso(d);
};

async function facGet(path, params) {
  const qs = new URLSearchParams(params).toString();
  const url = `${FAC}/${path}?${qs}`;
  let lastText = '';
  for (let attempt = 0; attempt < 4; attempt++) {
    for (const key of FAC_KEYS) {
      const res = await fetch(url, { headers: { 'X-Api-Key': key } });
      if (res.ok) return res.json();
      lastText = `${res.status} ${await res.text()}`;
      if (res.status !== 429 && res.status !== 403) throw new Error(`FAC ${path}: ${lastText}`);
    }
    await sleep(3000 * (attempt + 1));
  }
  throw new Error(`FAC ${path} exhausted: ${lastText}`);
}

// --- mirror context ---
const mirrorMax = (
  await db.execute(
    "SELECT max(fac_accepted_date) mx FROM fac_mirror_general WHERE fac_accepted_date != ''"
  )
).rows[0].mx;
console.log(`Mirror's latest fac_accepted_date: ${mirrorMax}\n`);

/* ============ Strategy A ============ */
console.log('=== A · new report FAC already accepted, not yet mirrored ===\n');

// Reports accepted after the mirror cutoff. Keep the window tight to the
// days most likely to be in the next bulk export (accepted >= a couple
// days before "now" tend to have propagated).
const since = mirrorMax; // everything the mirror is missing
const fresh = await facGet('general', {
  fac_accepted_date: `gte.${since}`,
  select: 'report_id,auditee_ein,auditee_name,fy_end_date,fac_accepted_date,audit_year',
  order: 'fac_accepted_date.desc',
  limit: '600',
});
console.log(`FAC has ${fresh.length} reports accepted >= ${since} (mirror-missing candidates)\n`);

// Which of those EINs are already in our mirror with an EARLIER latest report?
const einList = [...new Set(fresh.map((r) => r.auditee_ein).filter(Boolean))];
const known = new Map();
for (let i = 0; i < einList.length; i += 200) {
  const chunk = einList.slice(i, i + 200);
  const rows = (
    await db.execute({
      sql: `SELECT auditee_ein ein, auditee_name name, max(fy_end_date) latest_fye, count(*) n
            FROM fac_mirror_general WHERE auditee_ein IN (${chunk.map(() => '?').join(',')})
            GROUP BY auditee_ein`,
      args: chunk,
    })
  ).rows;
  for (const r of rows) known.set(r.ein, r);
}

const candidates = [];
for (const r of fresh) {
  const k = known.get(r.auditee_ein);
  if (!k) continue; // brand-new filer — monitor only fires for EINs already watched, fine to skip
  if (String(r.fy_end_date) <= String(k.latest_fye)) continue; // not actually newer than what we have
  candidates.push({
    ein: r.auditee_ein,
    name: r.auditee_name || k.name,
    newFy: r.fy_end_date,
    mirrorLatestFy: k.latest_fye,
    accepted: r.fac_accepted_date,
    reportId: r.report_id,
    priorReports: k.n,
  });
}

// dedupe by EIN, keep the newest
const byEin = new Map();
for (const c of candidates.sort((a, b) => b.newFy.localeCompare(a.newFy))) {
  if (!byEin.has(c.ein)) byEin.set(c.ein, c);
}
const aList = [...byEin.values()];

// Findings on those new reports → which will ALSO fire finding alerts
const newReportIds = aList.map((c) => c.reportId);
const findingsByReport = new Map();
for (let i = 0; i < newReportIds.length; i += 100) {
  const chunk = newReportIds.slice(i, i + 100);
  const fr = await facGet('findings', {
    report_id: `in.(${chunk.join(',')})`,
    select: 'report_id,reference_number,is_repeat_finding',
    limit: '2000',
  });
  for (const f of fr) {
    const cur = findingsByReport.get(f.report_id) || { total: 0, repeat: 0 };
    cur.total++;
    if (String(f.is_repeat_finding).toUpperCase() === 'Y' || f.is_repeat_finding === true) cur.repeat++;
    findingsByReport.set(f.report_id, cur);
  }
}

aList.sort((a, b) => {
  const fa = findingsByReport.get(a.reportId)?.total || 0;
  const fb = findingsByReport.get(b.reportId)?.total || 0;
  if (fb !== fa) return fb - fa;
  return b.accepted.localeCompare(a.accepted);
});

console.log(`${aList.length} EINs already in the mirror with a newer report FAC has accepted:\n`);
for (const c of aList.slice(0, 20)) {
  const f = findingsByReport.get(c.reportId) || { total: 0, repeat: 0 };
  console.log(
    `  ${c.ein}  ${String(c.name).slice(0, 42).padEnd(43)} ` +
      `new FY ${c.newFy} (had ${c.mirrorLatestFy}, ${c.priorReports} prior) ` +
      `accepted ${c.accepted}  → new_audit` +
      (f.total ? ` + ${f.total} finding${f.total > 1 ? 's' : ''}${f.repeat ? ` (${f.repeat} repeat)` : ''}` : ' (no findings)')
  );
}

/* ============ Strategy B ============ */
console.log('\n\n=== B · management-decision deadline crosses into the 30-day window ===\n');

const today = new Date();
const nextRun = new Date(today);
nextRun.setUTCDate(nextRun.getUTCDate() + ((8 - nextRun.getUTCDay()) % 7 || 7)); // next Monday
const dlMinAcc = addMonths(iso(new Date(today.getTime() + 31 * 864e5)), -6); // deadline just past 30d today
const dlMaxAcc = addMonths(iso(new Date(nextRun.getTime() + 30 * 864e5)), -6); // deadline within 30d by next run
console.log(`Next monitor run ~ ${iso(nextRun)}`);
console.log(`Target fac_accepted_date window: ${dlMinAcc} .. ${dlMaxAcc}\n`);

const bRows = (
  await db.execute({
    sql: `SELECT auditee_ein ein, auditee_name name, fy_end_date fye, fac_accepted_date acc
          FROM fac_mirror_general
          WHERE fac_accepted_date >= ? AND fac_accepted_date <= ?
          AND auditee_ein NOT IN (
            SELECT auditee_ein FROM fac_mirror_general WHERE fac_accepted_date != '' AND fac_accepted_date < ?
          )
          ORDER BY fac_accepted_date
          LIMIT 25`,
    args: [dlMinAcc, dlMaxAcc, dlMinAcc],
  })
).rows;

console.log(`${bRows.length} orgs whose soonest MD deadline enters the 30-day window between now and the run:\n`);
for (const r of bRows.slice(0, 15)) {
  console.log(
    `  ${r.ein}  ${String(r.name).slice(0, 42).padEnd(43)} accepted ${r.acc} → deadline ~${addMonths(r.acc, 6)}  → deadline alert`
  );
}

console.log('\n\nPick from A first (most reliable). Seed with scripts/seed-watchlist.mjs or the /portfolio UI, then check after the Monday run.');
