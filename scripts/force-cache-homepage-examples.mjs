#!/usr/bin/env node
/**
 * One-off maintenance script: force-populates public_org_cache for a
 * given list of EINs by calling api.fac.gov directly, bypassing the
 * app's own shared fetch budget (lib/fac-budget.ts) — that budget exists
 * to protect *live user traffic* from a contended quota; this script is
 * a deliberate, human-triggered, one-time admin action to seed specific
 * known-good example EINs (e.g. the homepage's "try these examples"
 * links), which is a different thing from a page load racing a crawler.
 *
 * Mirrors lib/fac-api.ts's importOrgByEin()/getFindingsForReports()
 * logic in plain JS so this can run standalone with node, no Next.js
 * build step required.
 *
 * Usage:
 *   node scripts/force-cache-homepage-examples.mjs 916001236 742089103 421079767
 */

import { readFileSync } from 'node:fs';
import { createClient } from '@libsql/client';

function loadEnvLocal() {
  try {
    for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
      const m = line.match(/^([A-Z_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch {
    // assume env vars are already set
  }
}
loadEnvLocal();

const FAC_KEY = process.env.FAC_API_KEY;
if (!FAC_KEY) {
  console.error('FAC_API_KEY not set.');
  process.exit(1);
}

const eins = process.argv.slice(2);
if (eins.length === 0) {
  console.error('Usage: node scripts/force-cache-homepage-examples.mjs <ein> [ein...]');
  process.exit(1);
}

const client = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

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

function isYes(v) {
  return v === 'Y';
}

function parsePriorRefs(raw) {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s && !/^0+$/.test(s));
}

function mapCategory(typeRequirement) {
  const map = {
    A: 'Activities Allowed/Unallowed',
    B: 'Allowable Costs/Cost Principles',
    C: 'Cash Management',
    E: 'Eligibility',
    F: 'Equipment/Real Property',
    G: 'Matching, Level of Effort, Earmarking',
    H: 'Period of Performance',
    I: 'Procurement/Suspension & Debarment',
    J: 'Program Income',
    L: 'Reporting',
    M: 'Subrecipient Monitoring',
    N: 'Special Tests and Provisions',
    P: 'Other',
  };
  const letters = (typeRequirement || '').toUpperCase().replace(/[^A-Z]/g, '').split('');
  return letters.map((l) => map[l]).filter(Boolean).join(', ') || 'Other';
}

function dedupeFindingRows(rows) {
  const merged = new Map();
  for (const row of rows) {
    const k = `${row.report_id}::${row.reference_number}`;
    const seen = merged.get(k);
    if (!seen) {
      merged.set(k, { ...row, _awards: row.award_reference ? [row.award_reference] : [] });
      continue;
    }
    if (row.award_reference && !seen._awards.includes(row.award_reference)) {
      seen._awards.push(row.award_reference);
    }
    const orFlag = (a, b) => (isYes(a) || isYes(b) ? 'Y' : 'N');
    seen.is_repeat_finding = orFlag(seen.is_repeat_finding, row.is_repeat_finding);
    seen.is_material_weakness = orFlag(seen.is_material_weakness, row.is_material_weakness);
    seen.is_significant_deficiency = orFlag(seen.is_significant_deficiency, row.is_significant_deficiency);
    seen.is_questioned_costs = orFlag(seen.is_questioned_costs, row.is_questioned_costs);
    if (parsePriorRefs(seen.prior_finding_ref_numbers).length === 0 && parsePriorRefs(row.prior_finding_ref_numbers).length > 0) {
      seen.prior_finding_ref_numbers = row.prior_finding_ref_numbers;
    }
    const letters = new Set(
      `${seen.type_requirement || ''}${row.type_requirement || ''}`.toUpperCase().replace(/[^A-Z]/g, '').split('')
    );
    seen.type_requirement = Array.from(letters).sort().join('');
  }
  return Array.from(merged.values()).map(({ _awards, ...row }) => ({ ...row, award_reference: _awards.join(', ') }));
}

async function getFindingsForReports(reportIds) {
  if (reportIds.length === 0) return [];
  const inList = `in.(${reportIds.join(',')})`;
  const [rawFindings, texts, caps] = await Promise.all([
    facGet('findings', { report_id: inList, limit: '1000' }),
    facGet('findings_text', { report_id: inList, limit: '1000' }),
    facGet('corrective_action_plans', { report_id: inList, limit: '1000' }),
  ]);
  const findings = dedupeFindingRows(rawFindings);
  const key = (reportId, ref) => `${reportId}::${ref}`;
  const textByRef = new Map(texts.map((t) => [key(t.report_id, t.finding_ref_number), t.finding_text]));
  const capByRef = new Map(caps.map((c) => [key(c.report_id, c.finding_ref_number), c.planned_action]));
  return findings.map((f) => {
    const k = key(f.report_id, f.reference_number);
    return {
      reportId: f.report_id,
      auditYear: f.audit_year,
      fiscalYearEnd: '',
      facFindingId: f.reference_number,
      category: mapCategory(f.type_requirement),
      typeRequirement: f.type_requirement || '',
      description: (textByRef.get(k) || '').trim(),
      plannedAction: (capByRef.get(k) || '').trim(),
      isRepeatFinding: isYes(f.is_repeat_finding),
      priorRefs: parsePriorRefs(f.prior_finding_ref_numbers),
      isMaterialWeakness: isYes(f.is_material_weakness),
      isSignificantDeficiency: isYes(f.is_significant_deficiency),
      hasQuestionedCosts: isYes(f.is_questioned_costs),
      awardReferences: f.award_reference ? f.award_reference.split(', ') : [],
    };
  });
}

async function importOrgByEin(ein) {
  const reports = await facGet('general', { auditee_ein: `eq.${ein}`, order: 'fy_end_date.desc', limit: '50' });
  if (reports.length === 0) return null;

  const fyByReport = new Map(reports.map((r) => [r.report_id, r.fy_end_date]));
  const findings = await getFindingsForReports(reports.map((r) => r.report_id));
  for (const f of findings) f.fiscalYearEnd = fyByReport.get(f.reportId) || '';
  findings.sort((a, b) => {
    if (a.fiscalYearEnd !== b.fiscalYearEnd) return b.fiscalYearEnd.localeCompare(a.fiscalYearEnd);
    return a.facFindingId.localeCompare(b.facFindingId);
  });

  const newest = reports[0];
  return { ein, uei: newest.auditee_uei, name: newest.auditee_name, reports, findings };
}

async function main() {
  const results = [];
  for (const ein of eins) {
    try {
      console.log(`Fetching ${ein}...`);
      const org = await importOrgByEin(ein);
      const now = Math.floor(Date.now() / 1000);
      await client.execute({
        sql: `INSERT INTO public_org_cache (ein, found, snapshot, synced_at) VALUES (?, ?, ?, ?)
              ON CONFLICT(ein) DO UPDATE SET found = excluded.found, snapshot = excluded.snapshot, synced_at = excluded.synced_at`,
        args: [ein, org !== null ? 1 : 0, org ? JSON.stringify(org) : null, now],
      });
      if (org) {
        console.log(`  ✓ cached: ${org.name} — ${org.reports.length} reports, ${org.findings.length} findings`);
        results.push({ ein, ok: true, name: org.name, findings: org.findings.length });
      } else {
        console.log(`  ✗ not found in FAC`);
        results.push({ ein, ok: false, reason: 'not-found' });
      }
    } catch (err) {
      console.error(`  ✗ failed: ${err.message}`);
      results.push({ ein, ok: false, reason: err.message });
    }
  }
  console.log('\nSummary:', JSON.stringify(results, null, 2));
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
