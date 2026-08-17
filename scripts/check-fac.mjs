#!/usr/bin/env node
/**
 * Standalone FAC API check — no Next.js, no database.
 *
 *   node scripts/check-fac.mjs 742089103
 *   node scripts/check-fac.mjs --name "Atascosa Health"
 *
 * Reads FAC_API_KEY from the environment or .env.local.
 */

import fs from 'node:fs';

function loadKey() {
  if (process.env.FAC_API_KEY) return process.env.FAC_API_KEY;
  try {
    const env = fs.readFileSync('.env.local', 'utf8');
    const m = env.match(/^FAC_API_KEY\s*=\s*(.+)$/m);
    if (m) return m[1].trim().replace(/^["']|["']$/g, '');
  } catch {}
  console.error('FAC_API_KEY not found in environment or .env.local');
  process.exit(1);
}

const KEY = loadKey();

async function fac(path, params) {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`https://api.fac.gov/${path}?${qs}`, {
    headers: { 'X-Api-Key': KEY },
  });
  if (!res.ok) {
    console.error(`${path} -> ${res.status}: ${(await res.text()).slice(0, 200)}`);
    process.exit(1);
  }
  return res.json();
}

const args = process.argv.slice(2);
const byName = args[0] === '--name';
const query = byName ? args.slice(1).join(' ') : args[0];

if (!query) {
  console.error('Usage: node scripts/check-fac.mjs <EIN> | --name "<org name>"');
  process.exit(1);
}

const reports = byName
  ? await fac('general', {
      auditee_name: `ilike.*${query}*`,
      order: 'fy_end_date.desc',
      limit: '25',
    })
  : await fac('general', {
      auditee_ein: `eq.${query}`,
      order: 'fy_end_date.desc',
      limit: '50',
    });

if (reports.length === 0) {
  console.log(`No FAC submissions found for "${query}".`);
  process.exit(0);
}

console.log(`\n${reports[0].auditee_name}`);
console.log(`EIN ${reports[0].auditee_ein}  ·  UEI ${reports[0].auditee_uei}`);
console.log(`${reports.length} audit submission(s):\n`);

for (const r of reports) {
  console.log(
    `  ${r.fy_end_date}  ${r.report_id}  expended $${Number(
      r.total_amount_expended
    ).toLocaleString()}`
  );
}

const ids = reports.map((r) => r.report_id).join(',');
const inList = `in.(${ids})`;

const [findings, texts, caps] = await Promise.all([
  fac('findings', { report_id: inList, limit: '500' }),
  fac('findings_text', { report_id: inList, limit: '500' }),
  fac('corrective_action_plans', { report_id: inList, limit: '500' }),
]);

// /findings returns one row per (finding × federal award). Collapse to
// one row per finding so counts match the narrative and CAP tables.
const byRef = new Map();
for (const f of findings) {
  const k = `${f.report_id}::${f.reference_number}`;
  const seen = byRef.get(k);
  if (!seen) {
    byRef.set(k, { ...f, awards: [f.award_reference] });
  } else {
    seen.awards.push(f.award_reference);
    if (f.is_repeat_finding === 'Y') seen.is_repeat_finding = 'Y';
  }
}
const unique = [...byRef.values()];

console.log(
  `\n${unique.length} finding(s) [${findings.length} raw award rows], ` +
    `${texts.length} narrative(s), ${caps.length} CAP(s)`
);

const repeats = unique.filter((f) => f.is_repeat_finding === 'Y');
console.log(`${repeats.length} flagged as repeat findings\n`);

const textFor = new Map(
  texts.map((t) => [`${t.report_id}::${t.finding_ref_number}`, t.finding_text])
);
const capFor = new Map(
  caps.map((c) => [`${c.report_id}::${c.finding_ref_number}`, c.planned_action])
);

for (const f of unique.slice(0, 10)) {
  const k = `${f.report_id}::${f.reference_number}`;
  const text = (textFor.get(k) || '').replace(/\s+/g, ' ').trim();
  const cap = (capFor.get(k) || '').replace(/\s+/g, ' ').trim();

  console.log(
    `— ${f.audit_year} ${f.reference_number}  [${f.type_requirement}]  ` +
      `awards: ${f.awards.filter(Boolean).join(', ') || 'n/a'}`
  );
  console.log(`  repeat: ${f.is_repeat_finding}   prior: ${f.prior_finding_ref_numbers}`);
  console.log(`  text: ${text ? text.slice(0, 160) + '…' : '(none)'}`);
  console.log(`  cap:  ${cap ? cap.slice(0, 160) + '…' : '(none)'}\n`);
}
