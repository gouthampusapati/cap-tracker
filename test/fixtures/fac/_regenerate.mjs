/**
 * (Re)generates the synthetic FAC CSV fixture used by
 * test/mirror-sync-equivalence.test.ts.
 *
 * The data is synthetic but the column HEADERS are FAC's real ones (so
 * the sync's header check and schema-drift guard are exercised for real).
 * Deterministic — a fixed seed, so the committed CSVs are stable. Shape
 * is chosen to exercise every branch of the incremental diff: reports
 * with/without findings, findings-text-only reports, multi-award
 * findings, additional EIN/UEI rows.
 *
 *   node test/fixtures/fac/_regenerate.mjs
 *
 * Re-run and commit if you change the shape knobs or FAC changes a header.
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const N_REPORTS = 120;

// FAC's real headers (app.fac.gov/dissemination/public-data/gsa/full), 2026-09.
const HEADERS = {
  general:
    'report_id,auditee_uei,audit_year,auditee_certify_name,auditee_certify_title,auditee_contact_name,auditee_email,auditee_name,auditee_phone,auditee_contact_title,auditee_address_line_1,auditee_city,auditee_state,auditee_ein,auditee_zip,auditor_certify_name,auditor_certify_title,auditor_phone,auditor_state,auditor_city,auditor_contact_title,auditor_address_line_1,auditor_zip,auditor_country,auditor_contact_name,auditor_email,auditor_firm_name,auditor_foreign_address,auditor_ein,cognizant_agency,oversight_agency,date_created,ready_for_certification_date,auditor_certified_date,auditee_certified_date,submitted_date,fac_accepted_date,fy_end_date,fy_start_date,audit_type,gaap_results,sp_framework_basis,is_sp_framework_required,sp_framework_opinions,is_going_concern_included,is_internal_control_deficiency_disclosed,is_internal_control_material_weakness_disclosed,is_material_noncompliance_disclosed,dollar_threshold,is_low_risk_auditee,agencies_with_prior_findings,entity_type,number_months,audit_period_covered,total_amount_expended,type_audit_code,is_public,data_source,is_aicpa_audit_guide_included,is_additional_ueis,resubmission_version,resubmission_status,is_multiple_eins,is_secondary_auditors'.split(
      ','
    ),
  findings:
    'report_id,auditee_uei,audit_year,fac_accepted_date,award_reference,reference_number,is_material_weakness,is_modified_opinion,is_other_findings,is_other_matters,prior_finding_ref_numbers,is_questioned_costs,is_repeat_finding,is_significant_deficiency,type_requirement'.split(
      ','
    ),
  findings_text:
    'report_id,auditee_uei,audit_year,fac_accepted_date,finding_ref_number,contains_chart_or_table,finding_text'.split(
      ','
    ),
  corrective_action_plans:
    'report_id,auditee_uei,audit_year,fac_accepted_date,finding_ref_number,contains_chart_or_table,planned_action'.split(
      ','
    ),
  additional_eins: 'report_id,auditee_uei,audit_year,fac_accepted_date,additional_ein'.split(','),
  additional_ueis: 'report_id,auditee_uei,audit_year,fac_accepted_date,additional_uei'.split(','),
};

// tiny deterministic PRNG (mulberry32)
function rng(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const r = rng(20260902);
const pick = (arr) => arr[Math.floor(r() * arr.length)];
const int = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
const yn = (p) => (r() < p ? 'Yes' : 'No');
const YN = (p) => (r() < p ? 'Y' : 'N');

function csvCell(v) {
  const s = v == null ? '' : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
const toCsv = (header, objs) =>
  [header.join(','), ...objs.map((o) => header.map((h) => csvCell(o[h] ?? '')).join(','))].join('\n') + '\n';

const STATES = ['CA', 'TX', 'NY', 'WA', 'OH', 'FL', 'IL', 'GA', 'PA', 'MA'];
const REQS = ['A', 'B', 'E', 'F', 'L', 'M', 'N'];
const rows = { general: [], findings: [], findings_text: [], corrective_action_plans: [], additional_eins: [], additional_ueis: [] };

for (let i = 0; i < N_REPORTS; i++) {
  const year = 2018 + (i % 8);
  const reportId = `${year}-06-GSAFAC-${String(1000000 + i).padStart(10, '0')}`;
  const uei = `UEI${String(i).padStart(9, '0')}`;
  const ein = String(100000000 + i * 7);
  const accepted = `${year + 1}-03-${String(1 + (i % 28)).padStart(2, '0')}`;
  const auditorEin = String(200000000 + (i % 25)); // ~25 firms so auditor_firms has multi-client rows

  const g = Object.fromEntries(HEADERS.general.map((h) => [h, '']));
  Object.assign(g, {
    report_id: reportId,
    auditee_uei: uei,
    audit_year: String(year),
    auditee_contact_name: `Contact ${i}`,
    auditee_email: `org${i}@example.org`,
    auditee_name: `Org ${i} ${pick(['Inc', 'Authority', 'District', 'Council'])}`,
    auditee_phone: `555${String(1000000 + i).slice(-7)}`,
    auditee_contact_title: 'CFO',
    auditee_address_line_1: `${int(1, 999)} Main St`,
    auditee_city: pick(['Springfield', 'Franklin', 'Clinton', 'Georgetown', 'Madison']),
    auditee_state: pick(STATES),
    auditee_ein: ein,
    auditee_zip: String(10000 + i),
    auditor_state: pick(STATES),
    auditor_city: pick(['Denver', 'Austin', 'Boston', 'Chicago', 'Atlanta']),
    auditor_address_line_1: `${int(1, 999)} Auditor Ave`,
    auditor_zip: String(60000 + (i % 25)),
    auditor_contact_name: `Auditor ${i % 25}`,
    auditor_email: `firm${i % 25}@cpa.example`,
    auditor_firm_name: `Firm ${i % 25} LLP`,
    auditor_ein: auditorEin,
    auditor_phone: `555${String(2000000 + (i % 25)).slice(-7)}`,
    cognizant_agency: r() < 0.3 ? pick(['20', '93', '84']) : '',
    oversight_agency: r() < 0.7 ? pick(['20', '93', '84', '10']) : '',
    fac_accepted_date: accepted,
    fy_end_date: `${year}-06-30`,
    fy_start_date: `${year - 1}-07-01`,
    audit_type: 'single-audit',
    gaap_results: pick(['["U"]', '["U"]', '["Q"]']),
    is_going_concern_included: yn(0.08),
    is_material_noncompliance_disclosed: yn(0.12),
    dollar_threshold: '750000',
    is_low_risk_auditee: yn(0.35),
    entity_type: pick(['non-profit', 'local government', 'higher-ed', 'tribal']),
    number_months: '12',
    audit_period_covered: 'annual',
    total_amount_expended: String(int(800, 90000) * 1000),
    type_audit_code: 'UG',
    is_public: 'true',
    data_source: 'GSAFAC',
    is_additional_ueis: 'No',
    is_multiple_eins: 'No',
    is_secondary_auditors: 'No',
  });
  rows.general.push(g);

  const child = { report_id: reportId, auditee_uei: uei, audit_year: String(year), fac_accepted_date: accepted };

  // ~65% of reports have findings
  if (r() < 0.65) {
    const nFindings = int(1, 6);
    for (let k = 0; k < nFindings; k++) {
      const ref = `${year}-${String(k + 1).padStart(3, '0')}`;
      const nAwards = int(1, 3); // findings.csv is one row per (finding × award)
      for (let a = 0; a < nAwards; a++) {
        rows.findings.push({
          ...child,
          award_reference: `AWARD-${k}-${a}`,
          reference_number: ref,
          is_material_weakness: YN(0.3),
          is_modified_opinion: YN(0.1),
          is_other_findings: YN(0.2),
          is_other_matters: YN(0.15),
          prior_finding_ref_numbers: r() < 0.25 ? `${year - 1}-001` : '',
          is_questioned_costs: YN(0.2),
          is_repeat_finding: YN(0.25),
          is_significant_deficiency: YN(0.4),
          type_requirement: pick(REQS),
        });
      }
      // ~85% of findings have a text + CAP row
      if (r() < 0.85) {
        rows.findings_text.push({ ...child, finding_ref_number: ref, contains_chart_or_table: YN(0.1), finding_text: `Finding ${ref} narrative for ${reportId}. ${'lorem '.repeat(int(3, 20))}`.trim() });
        rows.corrective_action_plans.push({ ...child, finding_ref_number: ref, contains_chart_or_table: YN(0.05), planned_action: `Management will remediate ${ref}. ${'action '.repeat(int(2, 12))}`.trim() });
      }
    }
  }

  // ~25% additional EINs, ~15% additional UEIs
  if (r() < 0.25) for (let e = 0; e < int(1, 2); e++) rows.additional_eins.push({ ...child, additional_ein: String(300000000 + i * 3 + e) });
  if (r() < 0.15) rows.additional_ueis.push({ ...child, additional_uei: `UEIX${String(i).padStart(8, '0')}` });
}

for (const [name, header] of Object.entries(HEADERS)) {
  writeFileSync(join(HERE, `${name}.csv`), toCsv(header, rows[name]));
  console.log(`${name}.csv: ${rows[name].length} rows`);
}
console.log(`\n${N_REPORTS} reports · synthetic fixture regenerated`);
