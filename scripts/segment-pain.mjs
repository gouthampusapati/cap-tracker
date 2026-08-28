#!/usr/bin/env node
/**
 * Where is the pain concentrated? Segmented analysis of Segments B and C.
 *
 * BACKGROUND — why this script exists
 *
 * The pooled analysis (market-test.mjs) found almost nothing: a 6-point
 * flip-rate gap between repeat-finding and clean organizations, which is
 * noise at n=120. But pooling averages together populations whose federal
 * overseers behave nothing alike:
 *
 *   Segment A — essential services (HUD public housing). Funding cannot
 *     stop; the money is attached to households. DEAD, excluded here.
 *
 *   Segment B — discretionary / competitive awards (research universities,
 *     NIH/NSF/ED-discretionary nonprofits). The agency has real leverage:
 *     2 CFR 200.208 specific conditions can move an organization from
 *     advance payment to cost reimbursement, which is a direct cash-flow
 *     hit, and future awards are competitive.
 *
 *   Segment C — formula / pass-through subrecipients. The pass-through
 *     entity, not the federal agency, does the enforcing. Different buyer,
 *     different lever, and subrecipient-monitoring findings are their own
 *     category.
 *
 * If B shows a wide gap and A shows none, the pooled number was mush and
 * we have found an ICP. If every segment is flat, the consequence story is
 * dead everywhere and only the operational pitch survives.
 *
 * METHOD
 *
 * For each segment, compare organizations WITH findings against
 * organizations with NO findings *drawn from the same segment*. A global
 * control is what made the earlier numbers uninterpretable.
 *
 * Reported per segment:
 *   - population size and federal expenditure distribution (ability to pay)
 *   - not-low-risk rate, findings vs clean, WITHIN segment
 *   - flip rate (Yes -> No), findings vs clean, WITHIN segment
 *   - chronicity: findings in consecutive years
 *   - dominant compliance requirement categories
 *
 * CAVEATS THAT DO NOT GO AWAY
 *   - Correlational. Low-risk status also turns on going concern, material
 *     weaknesses, and timely filing, all of which travel with findings.
 *   - Sampled, not a full scan. Denominators are printed everywhere.
 *   - Small segments produce unstable rates. Anything under n=40 is
 *     labelled directional and should not be quoted.
 *
 *   node scripts/segment-pain.mjs
 *   node scripts/segment-pain.mjs --sample 500 --history 80
 *   node scripts/segment-pain.mjs --probe        (dump raw schema and exit)
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
let apiCalls = 0;

async function fac(path, params) {
  apiCalls++;
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`https://api.fac.gov/${path}?${qs}`, {
    headers: { 'X-Api-Key': KEY },
  });
  if (!res.ok) {
    console.error(`\n${path} -> ${res.status}: ${(await res.text()).slice(0, 200)}`);
    process.exit(1);
  }
  return res.json();
}

const argv = process.argv.slice(2);
const flag = (nm, d) => {
  const i = argv.indexOf(`--${nm}`);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : d;
};
const has = (nm) => argv.includes(`--${nm}`);

const YEARS = flag('years', '2023,2024,2025').split(',');
const SAMPLE = Number(flag('sample', '600'));
const HISTORY = Number(flag('history', '60'));

const pct = (a, b) => (b ? `${((a / b) * 100).toFixed(1)}%` : '  n/a');
const money = (v) => `$${Math.round(Number(v) || 0).toLocaleString('en-US')}`;

/* ------------------------------------------------------------------ */
/* Schema probe — federal_awards field names are not documented here,  */
/* so confirm them rather than assuming.                               */
/* ------------------------------------------------------------------ */

if (has('probe')) {
  console.log('federal_awards, one row:\n');
  const rows = await fac('federal_awards', { limit: '1' });
  console.log(JSON.stringify(rows[0], null, 2));
  console.log('\nfield names:', Object.keys(rows[0] || {}).join(', '));
  process.exit(0);
}

/* ------------------------------------------------------------------ */
/* Federal agency prefixes                                             */
/* ------------------------------------------------------------------ */

const AGENCY = {
  '10': 'USDA',
  '11': 'Commerce',
  '12': 'Defense',
  '14': 'HUD',
  '15': 'Interior',
  '16': 'Justice',
  '17': 'Labor',
  '20': 'Transportation',
  '21': 'Treasury',
  '43': 'NASA',
  '45': 'NEA/NEH/IMLS',
  '47': 'NSF',
  '59': 'SBA',
  '64': 'Veterans Affairs',
  '66': 'EPA',
  '81': 'Energy',
  '84': 'Education',
  '93': 'HHS',
  '94': 'CNCS/AmeriCorps',
  '97': 'Homeland Security',
};

const REQUIREMENTS = {
  A: 'Activities Allowed',
  B: 'Cost Allowability',
  C: 'Cash Management',
  E: 'Eligibility',
  F: 'Equipment/Property',
  G: 'Matching/Earmarking',
  H: 'Period of Performance',
  I: 'Procurement/Debarment',
  J: 'Program Income',
  L: 'Reporting',
  M: 'Subrecipient Monitoring',
  N: 'Special Tests',
};

/* ------------------------------------------------------------------ */
/* Segment definitions                                                 */
/*                                                                     */
/* Segment A (HUD-overseen local government) is excluded: HUD cannot   */
/* defund public housing without evicting households, so no financial  */
/* consequence exists to sell against.                                 */
/* ------------------------------------------------------------------ */

const SEGMENTS = [
  {
    key: 'B-higher-ed',
    label: 'B · Research universities',
    why: 'Competitive awards; 200.208 conditions bite directly',
    match: (r) => r.entity_type === 'higher-ed',
  },
  {
    key: 'B-hhs-nonprofit',
    label: 'B · Non-profits, HHS-overseen',
    why: 'Largest discretionary funder; grants staff is a real role',
    match: (r) => r.entity_type === 'non-profit' && agencyOf(r) === '93',
  },
  {
    key: 'B-other-nonprofit',
    label: 'B · Non-profits, other discretionary',
    why: 'NSF, ED, DOL, CNCS — competitive renewal pressure',
    match: (r) =>
      r.entity_type === 'non-profit' &&
      ['47', '84', '17', '94', '16', '66'].includes(agencyOf(r)),
  },
  {
    key: 'C-passthrough-nonprofit',
    label: 'C · Non-profit subrecipients',
    why: 'Pass-through entity enforces; state agency is the real overseer',
    match: (r) => r.entity_type === 'non-profit' && r._passthroughHeavy,
  },
  {
    key: 'C-passthrough-local',
    label: 'C · Local govt subrecipients (non-HUD)',
    why: 'State pass-through monitoring, excludes housing authorities',
    match: (r) =>
      r.entity_type === 'local' && agencyOf(r) !== '14' && r._passthroughHeavy,
  },
  {
    key: 'D-passes-money-down',
    label: 'D · Pass-through ENTITIES (redistribute federal money)',
    why: '200.332 monitoring duties for every subrecipient — heaviest burden',
    match: (r) => r._passesMoneyDown,
  },
  {
    key: 'A-hud-local',
    label: 'A · HUD local govt  [reference only]',
    why: 'Known dead — included as a floor to compare against',
    match: (r) => r.entity_type === 'local' && agencyOf(r) === '14',
  },
];

/**
 * Which agency's money dominates this organization?
 *
 * Prefer the agency funding the most dollars, derived from the awards
 * table, because oversight/cognizant assignment is a formal designation
 * that can lag reality. Fall back to the designated agency when award
 * detail is unavailable.
 *
 * Cognizant agency applies above $50M expended; oversight below it.
 */
function agencyOf(r) {
  if (r._topAgency) return r._topAgency;
  const a = String(r.cognizant_agency || '').trim();
  const b = String(r.oversight_agency || '').trim();
  return a || b || '';
}

/* ================================================================== */
/* Gather                                                             */
/* ================================================================== */

console.log('='.repeat(72));
console.log('SEGMENTED PAIN ANALYSIS — Segments B and C');
console.log('='.repeat(72));
console.log(`\nYears: ${YEARS.join(', ')}   ·   target sample: ${SAMPLE} audits`);

process.stdout.write('\nSampling audits');

const reports = [];
for (let offset = 0; offset < SAMPLE; offset += 500) {
  const page = await fac('general', {
    audit_year: `in.(${YEARS.join(',')})`,
    select:
      'report_id,auditee_ein,auditee_name,auditee_state,audit_year,fy_end_date,' +
      'entity_type,oversight_agency,cognizant_agency,is_low_risk_auditee,' +
      'total_amount_expended,auditee_contact_name,auditee_email,auditor_firm_name',
    order: 'fac_accepted_date.desc',
    limit: String(Math.min(500, SAMPLE - offset)),
    offset: String(offset),
  });
  reports.push(...page);
  process.stdout.write('.');
  if (page.length < 500) break;
}
console.log(` ${reports.length} audits`);

/* ---- which reports have findings, and of what category ---- */

process.stdout.write('Loading findings');

const findingsByReport = new Map();
const ids = reports.map((r) => r.report_id);

for (let i = 0; i < ids.length; i += 40) {
  const chunk = ids.slice(i, i + 40);
  const rows = await fac('findings', {
    report_id: `in.(${chunk.join(',')})`,
    select: 'report_id,reference_number,type_requirement,is_repeat_finding',
    limit: '3000',
  });

  // Collapse the per-award duplicate rows first.
  const seen = new Set();
  for (const r of rows) {
    const k = `${r.report_id}::${r.reference_number}`;
    if (seen.has(k)) continue;
    seen.add(k);
    if (!findingsByReport.has(r.report_id)) findingsByReport.set(r.report_id, []);
    findingsByReport.get(r.report_id).push(r);
  }
  if (i % 400 === 0) process.stdout.write('.');
}
console.log(` ${findingsByReport.size} audits with findings`);

/* ---- pass-through exposure, for Segment C ---- */

process.stdout.write('Loading award structure');

let passthroughFieldFound = true;
const awardStats = new Map(); // report_id -> {total, passthrough}

for (let i = 0; i < ids.length; i += 40) {
  const chunk = ids.slice(i, i + 40);
  let rows;
  try {
    rows = await fac('federal_awards', {
      report_id: `in.(${chunk.join(',')})`,
      select:
        'report_id,is_direct,is_passthrough_award,amount_expended,federal_agency_prefix',
      limit: '5000',
    });
  } catch {
    passthroughFieldFound = false;
    break;
  }

  for (const r of rows) {
    if (!awardStats.has(r.report_id)) {
      awardStats.set(r.report_id, {
        total: 0,
        passthrough: 0,
        passesDown: false,
        byAgency: {},
      });
    }
    const s = awardStats.get(r.report_id);
    const amt = Number(r.amount_expended) || 0;
    s.total += amt;

    // is_direct = "N": the money arrived VIA a pass-through entity, so this
    // organization is a subrecipient. Segment C.
    if (String(r.is_direct).toUpperCase() === 'N') s.passthrough += amt;

    // is_passthrough_award = "Y": this organization passes money DOWN to
    // its own subrecipients, which triggers 200.332 monitoring duties.
    // Opposite direction, heavier obligation. Segment D.
    if (String(r.is_passthrough_award).toUpperCase() === 'Y') s.passesDown = true;

    const prefix = String(r.federal_agency_prefix || '').trim();
    if (prefix) s.byAgency[prefix] = (s.byAgency[prefix] || 0) + amt;
  }
  if (i % 400 === 0) process.stdout.write('.');
}
console.log(passthroughFieldFound ? ' done' : ' unavailable');

for (const r of reports) {
  const s = awardStats.get(r.report_id);

  // "Pass-through heavy": most federal money spent arrived through another
  // entity rather than direct from an agency.
  r._passthroughHeavy = s && s.total > 0 ? s.passthrough / s.total >= 0.5 : false;
  r._passesMoneyDown = s ? s.passesDown : false;

  // Dominant funder by dollars, not by formal designation.
  if (s) {
    const top = Object.entries(s.byAgency).sort((a, b) => b[1] - a[1])[0];
    r._topAgency = top ? top[0] : '';
  }
}

/* ================================================================== */
/* Per-segment analysis                                               */
/* ================================================================== */

/** Pull full audit history for a set of EINs and classify low-risk sequence. */
async function flipRate(eins) {
  if (eins.length === 0) return { n: 0, flipped: 0, alwaysYes: 0, alwaysNo: 0 };

  const histories = new Map();
  for (let i = 0; i < eins.length; i += 20) {
    const chunk = eins.slice(i, i + 20);
    const rows = await fac('general', {
      auditee_ein: `in.(${chunk.join(',')})`,
      select: 'auditee_ein,fy_end_date,is_low_risk_auditee',
      order: 'fy_end_date.asc',
      limit: '1000',
    });
    for (const r of rows) {
      if (!histories.has(r.auditee_ein)) histories.set(r.auditee_ein, []);
      histories.get(r.auditee_ein).push(r);
    }
  }

  let flipped = 0;
  let alwaysYes = 0;
  let alwaysNo = 0;
  let analysable = 0;

  for (const raw of histories.values()) {
    const seq = raw
      .slice()
      .sort((a, b) => String(a.fy_end_date).localeCompare(String(b.fy_end_date)))
      .map((r) => String(r.is_low_risk_auditee).toLowerCase());

    if (seq.length < 2) continue;
    analysable++;

    if (seq.every((s) => s === 'yes')) alwaysYes++;
    else if (seq.every((s) => s === 'no')) alwaysNo++;
    else if (seq.some((s, i) => i > 0 && seq[i - 1] === 'yes' && s === 'no')) flipped++;
  }

  return { n: analysable, flipped, alwaysYes, alwaysNo };
}

/** Do these organizations have findings in consecutive years? */
async function chronicity(eins) {
  if (eins.length === 0) return { n: 0, consecutive: 0 };

  const orgReports = new Map();
  for (let i = 0; i < eins.length; i += 20) {
    const chunk = eins.slice(i, i + 20);
    const rows = await fac('general', {
      auditee_ein: `in.(${chunk.join(',')})`,
      select: 'report_id,auditee_ein,audit_year',
      order: 'audit_year.asc',
      limit: '1000',
    });
    for (const r of rows) {
      if (!orgReports.has(r.auditee_ein)) orgReports.set(r.auditee_ein, []);
      orgReports.get(r.auditee_ein).push(r);
    }
  }

  const allIds = [...orgReports.values()].flat().map((r) => r.report_id);
  const hasFinding = new Set();
  for (let i = 0; i < allIds.length; i += 40) {
    const chunk = allIds.slice(i, i + 40);
    const rows = await fac('findings', {
      report_id: `in.(${chunk.join(',')})`,
      select: 'report_id',
      limit: '3000',
    });
    for (const r of rows) hasFinding.add(r.report_id);
  }

  let consecutive = 0;
  let analysable = 0;

  for (const rows of orgReports.values()) {
    if (rows.length < 2) continue;
    analysable++;
    const years = rows
      .filter((r) => hasFinding.has(r.report_id))
      .map((r) => Number(r.audit_year))
      .sort((a, b) => a - b);
    if (years.some((y, i) => i > 0 && y - years[i - 1] === 1)) consecutive++;
  }

  return { n: analysable, consecutive };
}

const results = [];

for (const seg of SEGMENTS) {
  const rows = reports.filter(seg.match);
  if (rows.length === 0) continue;

  const withF = rows.filter((r) => findingsByReport.has(r.report_id));
  const clean = rows.filter((r) => !findingsByReport.has(r.report_id));

  const notLow = (xs) =>
    xs.filter((r) => String(r.is_low_risk_auditee).toLowerCase() === 'no').length;

  const einsWith = [...new Set(withF.map((r) => r.auditee_ein).filter(Boolean))].slice(
    0,
    HISTORY
  );
  const einsClean = [...new Set(clean.map((r) => r.auditee_ein).filter(Boolean))].slice(
    0,
    HISTORY
  );

  process.stdout.write(`\nAnalysing ${seg.key} `);
  const [flipWith, flipClean, chronic] = [
    await flipRate(einsWith),
    await flipRate(einsClean),
    await chronicity(einsWith),
  ];
  process.stdout.write('done');

  // Which compliance requirements dominate this segment's findings?
  const catCount = {};
  for (const r of withF) {
    for (const f of findingsByReport.get(r.report_id) || []) {
      for (const letter of new Set(
        String(f.type_requirement || '').toUpperCase().replace(/[^A-Z]/g, '').split('')
      )) {
        if (REQUIREMENTS[letter]) {
          catCount[REQUIREMENTS[letter]] = (catCount[REQUIREMENTS[letter]] || 0) + 1;
        }
      }
    }
  }

  const spend = withF
    .map((r) => Number(r.total_amount_expended) || 0)
    .sort((a, b) => a - b);
  const median = spend.length ? spend[Math.floor(spend.length / 2)] : 0;

  results.push({
    seg,
    total: rows.length,
    withF: withF.length,
    clean: clean.length,
    findingRate: withF.length / rows.length,
    notLowWith: notLow(withF),
    notLowClean: notLow(clean),
    gap:
      (withF.length ? notLow(withF) / withF.length : 0) -
      (clean.length ? notLow(clean) / clean.length : 0),
    flipWith,
    flipClean,
    flipGap:
      (flipWith.n ? flipWith.flipped / flipWith.n : 0) -
      (flipClean.n ? flipClean.flipped / flipClean.n : 0),
    chronic,
    median,
    cats: Object.entries(catCount).sort((a, b) => b[1] - a[1]).slice(0, 4),
  });
}

console.log('\n');

/* ================================================================== */
/* Report                                                             */
/* ================================================================== */

for (const r of results.sort((a, b) => b.gap - a.gap)) {
  const thin = r.withF < 40;

  console.log('='.repeat(72));
  console.log(`${r.seg.label}${thin ? '   [THIN SAMPLE — directional only]' : ''}`);
  console.log(`${r.seg.why}`);
  console.log('='.repeat(72));

  console.log(
    `\n  Audits in sample: ${r.total}   with findings: ${r.withF} (${pct(
      r.withF,
      r.total
    )})   clean: ${r.clean}`
  );
  console.log(`  Median federal expenditure (orgs with findings): ${money(r.median)}`);

  console.log('\n  NOT LOW-RISK        with findings    clean (same segment)');
  console.log(
    `                      ${pct(r.notLowWith, r.withF).padStart(6)} (n=${String(
      r.withF
    ).padEnd(4)})  ${pct(r.notLowClean, r.clean).padStart(6)} (n=${r.clean})`
  );
  console.log(
    `    gap: ${(r.gap * 100 >= 0 ? '+' : '') + (r.gap * 100).toFixed(1)} points`
  );

  console.log('\n  LOST LOW-RISK       with findings    clean (same segment)');
  console.log(
    `                      ${pct(r.flipWith.flipped, r.flipWith.n).padStart(
      6
    )} (n=${String(r.flipWith.n).padEnd(4)})  ${pct(
      r.flipClean.flipped,
      r.flipClean.n
    ).padStart(6)} (n=${r.flipClean.n})`
  );
  console.log(
    `    gap: ${(r.flipGap * 100 >= 0 ? '+' : '') + (r.flipGap * 100).toFixed(1)} points`
  );
  console.log(
    `    never low-risk: ${pct(r.flipWith.alwaysNo, r.flipWith.n)} vs ${pct(
      r.flipClean.alwaysNo,
      r.flipClean.n
    )} clean`
  );

  console.log(
    `\n  Findings in consecutive years: ${pct(
      r.chronic.consecutive,
      r.chronic.n
    )} (n=${r.chronic.n})`
  );

  if (r.cats.length) {
    console.log('\n  Dominant compliance requirements:');
    for (const [name, c] of r.cats) console.log(`    ${name.padEnd(24)} ${c}`);
  }
  console.log('');
}

/* ---- Verdict ---- */

const live = results.filter(
  (r) => r.withF >= 40 && r.gap > 0.2 && r.seg.key !== 'A-hud-local'
);
const ranked = results
  .filter((r) => r.seg.key !== 'A-hud-local' && r.withF >= 40)
  .sort((a, b) => b.gap - a.gap);
const best = ranked[0];
const hud = results.find((r) => r.seg.key === 'A-hud-local');

console.log('='.repeat(72));
console.log('VERDICT');
console.log('='.repeat(72));

console.log(`
Reference floor   Segment A (HUD local govt) gap: ${
  hud ? ((hud.gap * 100).toFixed(1) + ' points') : 'not sampled'
}
                  This is the known-dead segment. Any segment near it is
                  also dead.

Segments clearing the 20-point gate: ${live.length}
${
  live.length
    ? live.map((r) => `  · ${r.seg.label} — ${(r.gap * 100).toFixed(1)} points, ${r.withF} audits, median ${money(r.median)}`).join('\n')
    : '  none'
}

${
  live.length
    ? `Best candidate    ${best.seg.label}
                  ${(best.gap * 100).toFixed(1)}-point gap, ${pct(best.chronic.consecutive, best.chronic.n)} chronic,
                  median ${money(best.median)} federal expenditure.
                  Take this segment into interviews first.`
    : `No segment clears the gate. Per the plan, gate G1 fails: the
consequence framing is not supported anywhere we looked. Proceed on the
operational pitch only, and let interviews decide.`
}

WHAT THIS STILL CANNOT TELL YOU
A gap means organizations with findings are more often not-low-risk than
their own segment peers. It does not mean the findings caused it, and it
does not mean anyone will pay to avoid it. Interviews decide that.

API calls made: ${apiCalls}
`);
