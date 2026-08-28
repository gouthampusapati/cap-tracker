#!/usr/bin/env node
/**
 * Find organizations with repeat Single Audit findings.
 *
 * Two uses:
 *   1. Demo data — find a real org whose repeat-finding screen actually
 *      lights up, so the most important view in the product can be shown.
 *   2. Phase 2 — this is the cold-outreach prospect list. An org with a
 *      repeat finding has a named, dated, dollar-relevant problem.
 *
 *   node scripts/find-repeats.mjs
 *   node scripts/find-repeats.mjs --year 2024 --limit 400
 *   node scripts/find-repeats.mjs --entity non-profit
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
    console.error(`${path} -> ${res.status}: ${(await res.text()).slice(0, 300)}`);
    process.exit(1);
  }
  return res.json();
}

/** Minimal flag parsing: node scripts/find-repeats.mjs --year 2024 */
const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : fallback;
};

const year = flag('year', null);
const entity = flag('entity', null);
const limit = flag('limit', '300');

const REQUIREMENTS = {
  A: 'Activities Allowed',
  B: 'Cost Allowability',
  C: 'Cash Management',
  E: 'Eligibility',
  F: 'Equipment & Real Property',
  G: 'Matching/Level of Effort',
  H: 'Period of Performance',
  I: 'Procurement & Susp/Debarment',
  J: 'Program Income',
  L: 'Reporting',
  M: 'Subrecipient Monitoring',
  N: 'Special Tests',
};

const category = (t) =>
  [...new Set((t || '').toUpperCase().replace(/[^A-Z]/g, '').split(''))]
    .map((l) => REQUIREMENTS[l])
    .filter(Boolean)
    .join(' / ') || 'Other';

console.log('Searching FAC for repeat findings…\n');

const findingParams = {
  is_repeat_finding: 'eq.Y',
  limit,
  order: 'audit_year.desc',
};
if (year) findingParams.audit_year = `eq.${year}`;

const repeats = await fac('findings', findingParams);

if (repeats.length === 0) {
  console.log('No repeat findings matched those filters.');
  process.exit(0);
}

// Collapse the per-award duplicate rows, same as the app does.
const byFinding = new Map();
for (const f of repeats) {
  const k = `${f.report_id}::${f.reference_number}`;
  if (!byFinding.has(k)) byFinding.set(k, f);
}

// Group findings by the report they belong to.
const byReport = new Map();
for (const f of byFinding.values()) {
  if (!byReport.has(f.report_id)) byReport.set(f.report_id, []);
  byReport.get(f.report_id).push(f);
}

const reportIds = [...byReport.keys()];
console.log(
  `${byFinding.size} repeat finding(s) across ${reportIds.length} report(s).\n`
);

// Look up the organizations behind those reports, in chunks so the query
// string stays within limits.
const orgs = [];
for (let i = 0; i < reportIds.length; i += 50) {
  const chunk = reportIds.slice(i, i + 50);
  const params = { report_id: `in.(${chunk.join(',')})`, limit: '100' };
  if (entity) params.entity_type = `eq.${entity}`;
  orgs.push(...(await fac('general', params)));
}

// One row per organization, since an org can appear in several years.
const byEin = new Map();
for (const g of orgs) {
  const findings = byReport.get(g.report_id) || [];
  const seen = byEin.get(g.auditee_ein);

  if (!seen) {
    byEin.set(g.auditee_ein, {
      ein: g.auditee_ein,
      name: g.auditee_name,
      state: g.auditee_state,
      entity: g.entity_type,
      expended: g.total_amount_expended,
      years: new Set([g.audit_year]),
      findings: [...findings],
    });
  } else {
    seen.years.add(g.audit_year);
    seen.findings.push(...findings);
    if (Number(g.total_amount_expended) > Number(seen.expended)) {
      seen.expended = g.total_amount_expended;
    }
  }
}

// Best demo candidates first: most repeat findings, then most audit years
// with repeats (an org repeating across multiple years is the strongest
// illustration of the problem).
const ranked = [...byEin.values()].sort(
  (a, b) =>
    b.findings.length - a.findings.length || b.years.size - a.years.size
);

console.log(`${ranked.length} organization(s) with repeat findings:\n`);

for (const o of ranked.slice(0, 25)) {
  const money = Number(o.expended);
  console.log(
    `${o.name}\n` +
      `  EIN ${o.ein}  ·  ${o.state}  ·  ${o.entity}  ·  ` +
      `$${money.toLocaleString('en-US')} expended`
  );
  console.log(
    `  ${o.findings.length} repeat finding(s) in ${[...o.years]
      .sort()
      .join(', ')}`
  );
  for (const f of o.findings.slice(0, 4)) {
    console.log(
      `    ${f.audit_year} ${f.reference_number}  ${category(
        f.type_requirement
      )}  · prior: ${f.prior_finding_ref_numbers}`
    );
  }
  console.log(`  Try it:  node scripts/check-fac.mjs ${o.ein}\n`);
}

if (ranked.length > 0) {
  console.log(
    `Best demo candidate: ${ranked[0].name} (EIN ${ranked[0].ein})`
  );
}
