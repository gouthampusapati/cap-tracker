/**
 * One-off analysis: repeat-finding rate specifically for Subrecipient
 * Monitoring findings (compliance requirement type 'M'), for a Reddit
 * post. Reads the local FAC bulk mirror only — 0 FAC calls.
 *
 * Usage: node scripts/analyze-subrecipient-monitoring.mjs
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

// --- de-duplicated M findings: one row per (report_id, reference_number) ---
const rows = (
  await db.execute(`
    SELECT f.report_id, f.reference_number, f.audit_year, f.is_repeat_finding,
           g.auditee_ein, g.auditee_name, g.fy_end_date
    FROM fac_mirror_findings f
    JOIN fac_mirror_general g ON g.report_id = f.report_id
    WHERE f.type_requirement LIKE '%M%'
  `)
).rows;

const byKey = new Map();
for (const r of rows) {
  const key = `${r.report_id}::${r.reference_number}`;
  const cur = byKey.get(key);
  const isRepeat = String(r.is_repeat_finding ?? '').trim().toUpperCase() === 'Y';
  if (!cur) byKey.set(key, { ...r, isRepeat });
  else if (isRepeat) cur.isRepeat = true;
}
const findings = [...byKey.values()];
console.log(`Distinct Subrecipient Monitoring findings: ${findings.length}`);

const years = findings.map((f) => f.audit_year).filter(Boolean).sort();
console.log(`Audit years covered: ${years[0]}–${years[years.length - 1]}`);

const repeatCount = findings.filter((f) => f.isRepeat).length;
console.log(
  `Flagged as a repeat finding (is_repeat_finding = Y): ${repeatCount} / ${findings.length} ` +
    `= ${((repeatCount / findings.length) * 100).toFixed(1)}%`
);

// --- how that compares to findings overall (any category) ---
const allDedup = new Map();
const allRows = (
  await db.execute(`SELECT report_id, reference_number, is_repeat_finding FROM fac_mirror_findings`)
).rows;
for (const r of allRows) {
  const key = `${r.report_id}::${r.reference_number}`;
  const isRepeat = String(r.is_repeat_finding ?? '').trim().toUpperCase() === 'Y';
  const cur = allDedup.get(key);
  if (!cur) allDedup.set(key, isRepeat);
  else if (isRepeat) allDedup.set(key, true);
}
const allVals = [...allDedup.values()];
const allRepeat = allVals.filter(Boolean).length;
console.log(
  `\nFor comparison, ALL finding categories: ${allRepeat} / ${allVals.length} ` +
    `= ${((allRepeat / allVals.length) * 100).toFixed(1)}% flagged repeat`
);

// --- orgs with an M finding in more than one audit year ---
const yearsByOrg = new Map();
for (const f of findings) {
  if (!f.auditee_ein || !f.audit_year) continue;
  (yearsByOrg.get(f.auditee_ein) ?? yearsByOrg.set(f.auditee_ein, new Set()).get(f.auditee_ein)).add(
    f.audit_year
  );
}
const orgsWithMultiYear = [...yearsByOrg.values()].filter((s) => s.size > 1).length;
console.log(
  `\nDistinct organizations with an M finding: ${yearsByOrg.size}\n` +
    `  ...in more than one audit year: ${orgsWithMultiYear} ` +
    `(${((orgsWithMultiYear / yearsByOrg.size) * 100).toFixed(1)}%)`
);

// --- near-identical finding text across different years, same org ---
const norm = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/\d+/g, '#') // dates/dollar amounts/EINs differ year to year; ignore digits
    .replace(/\s+/g, ' ')
    .trim();

const textRows = (
  await db.execute(`SELECT report_id, finding_ref_number, finding_text FROM fac_mirror_findings_text`)
).rows;
const textByKey = new Map(textRows.map((r) => [`${r.report_id}::${r.finding_ref_number}`, r.finding_text]));

const byOrg = new Map();
for (const f of findings) {
  if (!f.auditee_ein) continue;
  const text = textByKey.get(`${f.report_id}::${f.reference_number}`);
  if (!text || text.length < 40) continue; // skip boilerplate-too-short to compare meaningfully
  (byOrg.get(f.auditee_ein) ?? byOrg.set(f.auditee_ein, []).get(f.auditee_ein)).push({
    year: f.audit_year,
    name: f.auditee_name,
    norm: norm(text),
    raw: text,
  });
}

let orgsWithNearDupe = 0;
let pairsChecked = 0;
let pairsMatched = 0;
const examples = [];
for (const [ein, list] of byOrg) {
  if (list.length < 2) continue;
  let matchedHere = false;
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      if (list[i].year === list[j].year) continue;
      pairsChecked++;
      // crude but effective for boilerplate CAP-narrative-style findings:
      // identical after stripping digits, or one contains >85% of the other's length as a substring window
      const a = list[i].norm;
      const b = list[j].norm;
      const same = a === b;
      if (same) {
        pairsMatched++;
        matchedHere = true;
        if (examples.length < 5) {
          examples.push({ ein, name: list[i].name, yearA: list[i].year, yearB: list[j].year, sample: list[i].raw.slice(0, 160) });
        }
      }
    }
  }
  if (matchedHere) orgsWithNearDupe++;
}
console.log(
  `\nExact-after-normalizing-digits text match, different years, same org:\n` +
    `  ${pairsMatched} matching year-pairs across ${orgsWithNearDupe} organizations ` +
    `(of ${[...byOrg.values()].filter((l) => l.length > 1).length} orgs with M findings in 2+ years)`
);
console.log('\nExamples:');
for (const e of examples) {
  console.log(`  ${e.ein}  ${e.name}  (${e.yearA} & ${e.yearB}): "${e.sample}..."`);
}
