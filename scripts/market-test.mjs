#!/usr/bin/env node
/**
 * Is the pain real, and how many organizations have it?
 *
 * This script exists to try to KILL the thesis, not confirm it. The thesis
 * is: repeat Single Audit findings carry a consequence organizations want
 * to avoid, and enough organizations have them to make a market.
 *
 * Four questions, in order of how badly a "no" hurts:
 *
 *   1. SIZE — how many distinct organizations have repeat findings?
 *      A few hundred nationally is a consulting practice, not a product.
 *
 *   2. CONSEQUENCE — do organizations with repeat findings lose low-risk
 *      auditee status more than clean organizations do? Losing it doubles
 *      required audit coverage (20% -> 40% of federal expenditures), a
 *      real recurring bill. Needs a CONTROL GROUP: if most auditees are
 *      not-low-risk regardless, the flag means nothing.
 *
 *   3. TIMING — do organizations flip Yes -> No, and do repeat-finding
 *      organizations flip MORE than clean ones? A flip rate without a
 *      control is meaningless.
 *
 *   4. CONFOUND — when did those flips happen? The first version of this
 *      script found a 48% flip rate among repeat-finding organizations and
 *      it looked convincing, until the example dates clustered in FY2020
 *      and FY2021. COVID relief funding (SLFRF, ESSER, provider relief)
 *      pushed organizations into brand-new major programs, and first-year
 *      programs generate findings almost mechanically. If both cohorts
 *      spike in the same years, this measures the pandemic, not findings.
 *
 * Caveats that survive no matter what this prints:
 *   - Correlation on observational data. Low-risk status also turns on
 *     going concern, material weaknesses, and timely filing, all of which
 *     travel with repeat findings.
 *   - It samples rather than scanning the whole FAC. Denominators are
 *     printed so no rate gets quoted without one.
 *
 *   node scripts/market-test.mjs
 *   node scripts/market-test.mjs --sample 120
 *   node scripts/market-test.mjs --years 2022,2023,2024,2025
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
    console.error(`\n${path} -> ${res.status}: ${(await res.text()).slice(0, 300)}`);
    process.exit(1);
  }
  return res.json();
}

const argv = process.argv.slice(2);
const flag = (n, d) => {
  const i = argv.indexOf(`--${n}`);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : d;
};

const SAMPLE = Number(flag('sample', '120'));
const YEARS = flag('years', '2022,2023,2024,2025').split(',');

const pct = (n, d) => (d === 0 ? 'n/a' : `${((n / d) * 100).toFixed(1)}%`);

async function fetchAll(path, params, max) {
  const out = [];
  const step = 500;
  for (let offset = 0; offset < max; offset += step) {
    const page = await fac(path, {
      ...params,
      limit: String(Math.min(step, max - offset)),
      offset: String(offset),
    });
    out.push(...page);
    if (page.length < step) break;
  }
  return out;
}

/* ================================================================== */
/* 1. SIZE                                                            */
/* ================================================================== */

console.log('='.repeat(68));
console.log('QUESTION 1 — How many organizations have repeat findings?');
console.log('='.repeat(68));

const repeatRows = await fetchAll(
  'findings',
  { is_repeat_finding: 'eq.Y', audit_year: `in.(${YEARS.join(',')})` },
  4000
);

const repeatFindings = new Map();
for (const f of repeatRows) {
  repeatFindings.set(`${f.report_id}::${f.reference_number}`, f);
}
const repeatReportIds = [
  ...new Set([...repeatFindings.values()].map((f) => f.report_id)),
];

console.log(`\nYears examined: ${YEARS.join(', ')}`);
console.log(`Raw repeat-finding rows:      ${repeatRows.length}`);
console.log(`Distinct repeat findings:     ${repeatFindings.size}`);
console.log(`Distinct reports affected:    ${repeatReportIds.length}`);
if (repeatRows.length >= 4000) {
  console.log('\n  NOTE: hit the 4000-row fetch cap — true totals are higher.');
}

async function generalForReports(ids) {
  const out = [];
  for (let i = 0; i < ids.length; i += 40) {
    const chunk = ids.slice(i, i + 40);
    out.push(
      ...(await fac('general', {
        report_id: `in.(${chunk.join(',')})`,
        select:
          'report_id,auditee_ein,auditee_name,audit_year,fy_end_date,is_low_risk_auditee,total_amount_expended,entity_type',
        limit: '100',
      }))
    );
  }
  return out;
}

const repeatOrgRows = await generalForReports(repeatReportIds);
const repeatEins = [...new Set(repeatOrgRows.map((r) => r.auditee_ein))].filter(Boolean);

console.log(`Distinct ORGANIZATIONS:       ${repeatEins.length}`);

const byEntity = {};
for (const r of repeatOrgRows) byEntity[r.entity_type] = (byEntity[r.entity_type] || 0) + 1;
console.log('\nBy entity type:');
for (const [k, v] of Object.entries(byEntity).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(k || 'unknown').padEnd(14)} ${v}`);
}

/* ================================================================== */
/* 2. CONSEQUENCE                                                     */
/* ================================================================== */

console.log(`\n${'='.repeat(68)}`);
console.log('QUESTION 2 — Do repeat findings correlate with lost low-risk status?');
console.log('='.repeat(68));

const allReportsSample = await fetchAll(
  'general',
  {
    audit_year: `in.(${YEARS.join(',')})`,
    select:
      'report_id,auditee_ein,auditee_name,audit_year,is_low_risk_auditee,total_amount_expended,entity_type',
    order: 'fac_accepted_date.desc',
  },
  Math.max(SAMPLE * 6, 1200)
);

const sampledIds = allReportsSample.map((r) => r.report_id);
const withAnyFinding = new Set();
for (let i = 0; i < sampledIds.length; i += 40) {
  const chunk = sampledIds.slice(i, i + 40);
  const rows = await fac('findings', {
    report_id: `in.(${chunk.join(',')})`,
    select: 'report_id',
    limit: '2000',
  });
  for (const r of rows) withAnyFinding.add(r.report_id);
}

const cleanReports = allReportsSample.filter((r) => !withAnyFinding.has(r.report_id));
const notLowRisk = (rows) =>
  rows.filter((r) => String(r.is_low_risk_auditee).toLowerCase() === 'no').length;

const repeatNotLow = notLowRisk(repeatOrgRows);
const cleanNotLow = notLowRisk(cleanReports);

console.log('\n  Group                          n      not low-risk');
console.log('  ' + '-'.repeat(52));
console.log(
  `  Reports WITH repeat findings   ${String(repeatOrgRows.length).padEnd(6)} ${pct(
    repeatNotLow,
    repeatOrgRows.length
  )}`
);
console.log(
  `  Reports with NO findings       ${String(cleanReports.length).padEnd(6)} ${pct(
    cleanNotLow,
    cleanReports.length
  )}`
);

const treatRate = repeatOrgRows.length ? repeatNotLow / repeatOrgRows.length : 0;
const ctrlRate = cleanReports.length ? cleanNotLow / cleanReports.length : 0;
console.log(
  `\n  Difference: ${((treatRate - ctrlRate) * 100).toFixed(1)} percentage points`
);

/* ================================================================== */
/* 3 + 4. TIMING, WITH A CONTROL COHORT                               */
/* ================================================================== */

console.log(`\n${'='.repeat(68)}`);
console.log('QUESTION 3 — Flip rate, repeat-finding vs clean organizations');
console.log('='.repeat(68));

const repeatEinSet = new Set(repeatEins);

// Control: organizations whose sampled report had NO findings at all, and
// which never appear in the repeat-finding set.
const controlEins = [
  ...new Set(cleanReports.map((r) => r.auditee_ein).filter(Boolean)),
].filter((ein) => !repeatEinSet.has(ein));

/** Pull full audit history for a list of EINs, grouped by EIN. */
async function fetchHistories(eins, label) {
  const histories = new Map();
  process.stdout.write(`\n${label}: `);
  for (let i = 0; i < eins.length; i += 20) {
    const chunk = eins.slice(i, i + 20);
    const rows = await fac('general', {
      auditee_ein: `in.(${chunk.join(',')})`,
      select:
        'auditee_ein,auditee_name,audit_year,fy_end_date,is_low_risk_auditee,total_amount_expended',
      order: 'fy_end_date.asc',
      limit: '1000',
    });
    for (const r of rows) {
      if (!histories.has(r.auditee_ein)) histories.set(r.auditee_ein, []);
      histories.get(r.auditee_ein).push(r);
    }
    process.stdout.write('.');
  }
  process.stdout.write('\n');
  return histories;
}

/** Classify each organization's low-risk sequence over time. */
function analyze(histories) {
  const out = {
    total: histories.size,
    singleYear: 0,
    alwaysNo: 0,
    alwaysYes: 0,
    flipped: 0,
    mixedOther: 0,
    flipsByFy: {},
    examples: [],
  };

  for (const [ein, raw] of histories) {
    const rows = raw
      .slice()
      .sort((a, b) => String(a.fy_end_date).localeCompare(String(b.fy_end_date)));

    if (rows.length < 2) {
      out.singleYear++;
      continue;
    }

    const seq = rows.map((r) => String(r.is_low_risk_auditee).toLowerCase());

    if (seq.every((s) => s === 'no')) {
      out.alwaysNo++;
    } else if (seq.every((s) => s === 'yes')) {
      out.alwaysYes++;
    } else {
      const idx = seq.findIndex((s, i) => i > 0 && seq[i - 1] === 'yes' && s === 'no');
      if (idx > 0) {
        out.flipped++;
        // Bucket by the fiscal year in which low-risk status was lost.
        const fy = String(rows[idx].fy_end_date).slice(0, 4);
        out.flipsByFy[fy] = (out.flipsByFy[fy] || 0) + 1;
        if (out.examples.length < 6) {
          out.examples.push({
            name: rows[idx].auditee_name,
            ein,
            before: rows[idx - 1].fy_end_date,
            when: rows[idx].fy_end_date,
            years: rows.length,
          });
        }
      } else {
        out.mixedOther++;
      }
    }
  }

  out.multiYear = out.total - out.singleYear;
  return out;
}

const treatHist = await fetchHistories(
  repeatEins.slice(0, SAMPLE),
  `Repeat-finding cohort (${Math.min(SAMPLE, repeatEins.length)} orgs)`
);
const ctrlHist = await fetchHistories(
  controlEins.slice(0, SAMPLE),
  `Control cohort, no findings (${Math.min(SAMPLE, controlEins.length)} orgs)`
);

const T = analyze(treatHist);
const C = analyze(ctrlHist);

const row = (label, t, c) =>
  console.log(
    `  ${label.padEnd(26)} ${String(t).padStart(5)}  ${String(
      pct(t, T.multiYear)
    ).padStart(7)}   ${String(c).padStart(5)}  ${String(pct(c, C.multiYear)).padStart(7)}`
  );

console.log('\n                              REPEAT-FINDING        CONTROL');
console.log('                                 n      rate         n      rate');
console.log('  ' + '-'.repeat(60));
console.log(
  `  ${'analyzable (2+ years)'.padEnd(26)} ${String(T.multiYear).padStart(5)}` +
    `           ${String(C.multiYear).padStart(5)}`
);
row('never low-risk', T.alwaysNo, C.alwaysNo);
row('always low-risk', T.alwaysYes, C.alwaysYes);
row('FLIPPED Yes -> No', T.flipped, C.flipped);
row('other mixed', T.mixedOther, C.mixedOther);

const flipGap =
  (T.multiYear ? T.flipped / T.multiYear : 0) -
  (C.multiYear ? C.flipped / C.multiYear : 0);

console.log(
  `\n  Flip-rate difference: ${(flipGap * 100).toFixed(1)} percentage points`
);

if (C.multiYear < 30) {
  console.log('  WARNING: control cohort is small — directional only.');
}

/* ---- Question 4: when did the flips happen? ---- */

console.log(`\n${'='.repeat(68)}`);
console.log('QUESTION 4 — Are the flips just COVID?');
console.log('='.repeat(68));

const allFy = [
  ...new Set([...Object.keys(T.flipsByFy), ...Object.keys(C.flipsByFy)]),
].sort();

console.log('\n  Fiscal year low-risk status was lost:\n');
console.log('  FY      repeat-finding    control');
console.log('  ' + '-'.repeat(38));
for (const fy of allFy) {
  const t = T.flipsByFy[fy] || 0;
  const c = C.flipsByFy[fy] || 0;
  const bar = '#'.repeat(Math.min(t, 30));
  console.log(
    `  ${fy}    ${String(t).padStart(6)}       ${String(c).padStart(6)}   ${bar}`
  );
}

const covid = ['2020', '2021'];
const covidT = covid.reduce((s, y) => s + (T.flipsByFy[y] || 0), 0);
const covidC = covid.reduce((s, y) => s + (C.flipsByFy[y] || 0), 0);

console.log(
  `\n  Flips in FY2020-21:  repeat ${covidT}/${T.flipped} (${pct(
    covidT,
    T.flipped
  )})   control ${covidC}/${C.flipped} (${pct(covidC, C.flipped)})`
);

if (T.examples.length) {
  console.log('\n  Repeat-finding organizations that lost low-risk status:');
  for (const e of T.examples) {
    console.log(
      `    ${e.name}\n      EIN ${e.ein} · low-risk through ${e.before}, lost by ${e.when}`
    );
  }
}

/* ================================================================== */
/* Verdict                                                            */
/* ================================================================== */

console.log(`\n${'='.repeat(68)}`);
console.log('READ THIS BEFORE QUOTING ANY NUMBER ABOVE');
console.log('='.repeat(68));

const covidShareT = T.flipped ? covidT / T.flipped : 0;

console.log(`
Market size   ${repeatEins.length} organizations with repeat findings in ${YEARS.join(', ')}.
              A floor, not a total — the finding query hit its fetch cap.

Consequence   ${pct(repeatNotLow, repeatOrgRows.length)} of repeat-finding reports are not low-risk vs
              ${pct(cleanNotLow, cleanReports.length)} of clean reports. Controlled, but still
              correlational: material weaknesses and late filing
              independently cost low-risk status and travel with repeats.

Timing        Flip rate ${pct(T.flipped, T.multiYear)} vs ${pct(C.flipped, C.multiYear)} control.
              ${
                flipGap > 0.15
                  ? 'Gap is wide enough to take seriously.'
                  : flipGap > 0.05
                    ? 'Gap is modest — weak support at best.'
                    : 'No meaningful gap. The timing story does not hold.'
              }

Confound      ${pct(covidT, T.flipped)} of repeat-cohort flips landed in FY2020-21.
              ${
                covidShareT > 0.5
                  ? 'Most flips are pandemic-era. Treat the timing result as\n              largely COVID until it is shown outside those years.'
                  : 'Flips are spread across years, so this is not purely a\n              pandemic artifact.'
              }

If the flip gap is small or the flips are overwhelmingly FY2020-21, the
consequence framing is not supported and the honest pitch is operational:
nobody has a system for tracking commitments across audit cycles. Smaller
claim, defensible, different price point.

API calls made: ${apiCalls}
`);
