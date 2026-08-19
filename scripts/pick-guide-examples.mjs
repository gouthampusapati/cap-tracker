#!/usr/bin/env node
/**
 * Picks real example orgs for the compliance guides — "chosen
 * programmatically, not hand-picked" per the Phase 2B spec.
 *
 * Queries live FAC findings filtered by type_requirement letter, resolves
 * each match's report_id to an EIN + org name, and prints a small JSON
 * block ready to paste into the relevant guide page(s). This is a
 * maintenance script, not part of the app build or runtime — re-run it
 * occasionally to refresh which examples a guide shows; it doesn't run
 * automatically.
 *
 * Usage:
 *   node scripts/pick-guide-examples.mjs M   # Subrecipient Monitoring examples
 *   node scripts/pick-guide-examples.mjs I   # Procurement examples
 */

import { readFileSync } from 'node:fs';

function loadEnvLocal() {
  try {
    for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
      const m = line.match(/^([A-Z_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch {
    // no .env.local — assume FAC_API_KEY is already in the environment
  }
}

loadEnvLocal();

const FAC_KEY = process.env.FAC_API_KEY;
if (!FAC_KEY) {
  console.error('FAC_API_KEY not set (checked .env.local and the environment).');
  process.exit(1);
}

const letter = process.argv[2];
if (!letter || letter.length !== 1) {
  console.error('Usage: node scripts/pick-guide-examples.mjs <letter>   (e.g. M, I)');
  process.exit(1);
}

const HOW_MANY = 3;

async function facGet(path, params) {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`https://api.fac.gov/${path}?${qs}`, {
    headers: { 'X-Api-Key': FAC_KEY },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`FAC ${path} returned ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json();
}

async function main() {
  console.log(`Finding candidate findings tagged "${letter}"...`);

  // Prefer non-repeat findings with a single clean letter, not a
  // multi-letter combination, so the linked finding is unambiguously
  // "about" this category when someone clicks through.
  const findings = await facGet('findings', {
    type_requirement: `eq.${letter}`,
    is_repeat_finding: 'eq.N',
    limit: '30',
    select: 'report_id,reference_number',
  });

  if (findings.length === 0) {
    console.error(`No clean single-letter "${letter}" findings found. Try without is_repeat_finding filter.`);
    process.exit(1);
  }

  const picked = [];
  const seenEins = new Set();

  for (const f of findings) {
    if (picked.length >= HOW_MANY) break;

    const [general] = await facGet('general', {
      report_id: `eq.${f.report_id}`,
      select: 'auditee_ein,auditee_name',
    });
    if (!general || seenEins.has(general.auditee_ein)) continue;

    seenEins.add(general.auditee_ein);
    picked.push({ ein: general.auditee_ein, name: general.auditee_name, reportId: f.report_id });
  }

  console.log(`\nPicked ${picked.length} example(s) for "${letter}":\n`);
  console.log(JSON.stringify(picked, null, 2));
}

main().catch((err) => {
  console.error('Failed:', err.message);
  process.exit(1);
});
