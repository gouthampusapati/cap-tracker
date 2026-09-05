/**
 * Slices the Subrecipient Monitoring repeat-finding analysis
 * (scripts/analyze-subrecipient-monitoring.mjs) by auditee entity_type
 * (non-profit / local / higher-ed / state / tribal / unknown).
 * Mirror-only, 0 FAC calls.
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

const TYPES = ['non-profit', 'local', 'higher-ed', 'state', 'tribal', 'unknown'];
const pct = (n, d) => (d ? ((n / d) * 100).toFixed(1) + '%' : 'n/a');

// --- M findings, deduped to one row per (report_id, reference_number) ---
const mRows = (
  await db.execute(`
    SELECT f.report_id, f.reference_number, f.audit_year, f.is_repeat_finding,
           g.auditee_ein, g.auditee_name, g.entity_type
    FROM fac_mirror_findings f
    JOIN fac_mirror_general g ON g.report_id = f.report_id
    WHERE f.type_requirement LIKE '%M%'
  `)
).rows;

const mByKey = new Map();
for (const r of mRows) {
  const key = `${r.report_id}::${r.reference_number}`;
  const isRepeat = String(r.is_repeat_finding ?? '').trim().toUpperCase() === 'Y';
  const cur = mByKey.get(key);
  if (!cur) mByKey.set(key, { ...r, isRepeat });
  else if (isRepeat) cur.isRepeat = true;
}
const mFindings = [...mByKey.values()];

// --- baseline: ALL finding types, deduped, WITH entity_type ---
const allRows = (
  await db.execute(`
    SELECT f.report_id, f.reference_number, f.is_repeat_finding, g.entity_type
    FROM fac_mirror_findings f
    JOIN fac_mirror_general g ON g.report_id = f.report_id
  `)
).rows;
const allByKey = new Map();
for (const r of allRows) {
  const key = `${r.report_id}::${r.reference_number}`;
  const isRepeat = String(r.is_repeat_finding ?? '').trim().toUpperCase() === 'Y';
  const cur = allByKey.get(key);
  if (!cur) allByKey.set(key, { entity_type: r.entity_type, isRepeat });
  else if (isRepeat) cur.isRepeat = true;
}
const allFindings = [...allByKey.values()];

console.log('=== Repeat-finding rate by organization type ===\n');
console.log(
  `${'Type'.padEnd(11)} ${'M findings'.padStart(10)} ${'M repeat%'.padStart(10)} ${'All repeat%'.padStart(12)} ${'orgs w/ M'.padStart(10)}`
);

// org-level: assign each org the entity_type of its most-recent report; track years
const orgMeta = new Map(); // ein -> { type, years:Set }
for (const f of mFindings) {
  if (!f.auditee_ein) continue;
  const o = orgMeta.get(f.auditee_ein) ?? { type: f.entity_type, years: new Set() };
  if (f.audit_year) o.years.add(f.audit_year);
  o.type = f.entity_type; // last write wins; good enough, entity_type rarely changes
  orgMeta.set(f.auditee_ein, o);
}

for (const type of TYPES) {
  const mSlice = mFindings.filter((f) => f.entity_type === type);
  const mRepeat = mSlice.filter((f) => f.isRepeat).length;
  const allSlice = allFindings.filter((f) => f.entity_type === type);
  const allRepeat = allSlice.filter((f) => f.isRepeat).length;
  const orgsOfType = [...orgMeta.values()].filter((o) => o.type === type);
  console.log(
    `${type.padEnd(11)} ${String(mSlice.length).padStart(10)} ${pct(mRepeat, mSlice.length).padStart(10)} ` +
      `${pct(allRepeat, allSlice.length).padStart(12)} ${String(orgsOfType.length).padStart(10)}`
  );
}

console.log('\n=== Of orgs with an M finding, % that recur in 2+ distinct audit years ===\n');
for (const type of TYPES) {
  const orgsOfType = [...orgMeta.values()].filter((o) => o.type === type);
  const multi = orgsOfType.filter((o) => o.years.size > 1).length;
  console.log(`  ${type.padEnd(11)} ${pct(multi, orgsOfType.length).padStart(8)}  (${multi}/${orgsOfType.length})`);
}

// --- near-identical text, by type ---
const norm = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/\d+/g, '#')
    .replace(/\s+/g, ' ')
    .trim();

const reportIds = [...new Set(mFindings.map((f) => f.report_id))];
const textByKey = new Map();
for (let i = 0; i < reportIds.length; i += 300) {
  const chunk = reportIds.slice(i, i + 300);
  const rows = (
    await db.execute({
      sql: `SELECT report_id, finding_ref_number, finding_text FROM fac_mirror_findings_text WHERE report_id IN (${chunk.map(() => '?').join(',')})`,
      args: chunk,
    })
  ).rows;
  for (const r of rows) textByKey.set(`${r.report_id}::${r.finding_ref_number}`, r.finding_text);
}

const byOrg = new Map(); // ein -> {type, items:[{year, norm}]}
for (const f of mFindings) {
  if (!f.auditee_ein) continue;
  const text = textByKey.get(`${f.report_id}::${f.reference_number}`);
  if (!text || text.length < 40) continue;
  const o = byOrg.get(f.auditee_ein) ?? { type: f.entity_type, items: [] };
  o.items.push({ year: f.audit_year, norm: norm(text) });
  byOrg.set(f.auditee_ein, o);
}

const dupeOrgsByType = Object.fromEntries(TYPES.map((t) => [t, 0]));
const eligibleByType = Object.fromEntries(TYPES.map((t) => [t, 0]));
for (const { type, items } of byOrg.values()) {
  if (items.length < 2) continue;
  eligibleByType[type] = (eligibleByType[type] ?? 0) + 1;
  let matched = false;
  outer: for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      if (items[i].year === items[j].year) continue;
      if (items[i].norm === items[j].norm) {
        matched = true;
        break outer;
      }
    }
  }
  if (matched) dupeOrgsByType[type] = (dupeOrgsByType[type] ?? 0) + 1;
}

console.log('\n=== Of orgs with M findings in 2+ years, % with near-identical finding text ===\n');
for (const type of TYPES) {
  const e = eligibleByType[type] ?? 0;
  const d = dupeOrgsByType[type] ?? 0;
  console.log(`  ${type.padEnd(11)} ${pct(d, e).padStart(8)}  (${d}/${e})`);
}
