/**
 * Federal Audit Clearinghouse (FAC) API client
 *
 * Schema confirmed against live API 2026-08. Four tables, joined on
 * report_id + finding reference number. NOTE the join key is named
 * `reference_number` in /findings but `finding_ref_number` in
 * /findings_text and /corrective_action_plans.
 *
 * Docs: https://www.fac.gov/data/
 * Key:  https://api.data.gov/signup
 */

const FAC_BASE = 'https://api.fac.gov';

function apiKey(): string {
  const key = process.env.FAC_API_KEY;
  if (!key) throw new Error('FAC_API_KEY is not set in the environment');
  return key;
}

async function facGet<T>(path: string, params: Record<string, string>): Promise<T[]> {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${FAC_BASE}/${path}?${qs}`, {
    headers: { 'X-Api-Key': apiKey() },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`FAC ${path} returned ${res.status}: ${body.slice(0, 300)}`);
  }

  return (await res.json()) as T[];
}

/* ------------------------------------------------------------------ */
/* Raw row shapes (subset of fields we use)                            */
/* ------------------------------------------------------------------ */

export interface FacGeneral {
  report_id: string;
  auditee_ein: string;
  auditee_uei: string;
  auditee_name: string;
  audit_year: string;
  fy_end_date: string;
  fy_start_date: string;
  total_amount_expended: number;
  entity_type: string;
  // NOTE: every boolean field on `general` uses "Yes"/"No" — confirmed
  // live against the API 2026-08, sampled across 300+ rows for each
  // field below. This is a DIFFERENT convention from `findings`' "Y"/"N"
  // fields (see isYes below) — use isYesNo for these, not isYes; mixing
  // them up silently always evaluates false; caught live while adding
  // this batch (is_low_risk_auditee was already wired up with the wrong
  // comparison — see the fix in app/single-audit/[ein]/page.tsx).
  is_low_risk_auditee: string;
  is_going_concern_included: string;
  is_material_noncompliance_disclosed: string;
  // Comma-separated when a report has multiple opinion units — e.g.
  // "unmodified_opinion,qualified_opinion" is a real, non-rare value
  // (confirmed live), not a single enum. See parseGaapResults.
  gaap_results: string;
  auditor_firm_name: string;
  auditor_ein: string;
  // An entity has either a cognizant OR an oversight agency, not both —
  // confirmed live: one of these two is consistently empty-string.
  cognizant_agency: string;
  oversight_agency: string;
  // Date the FAC accepted this submission — the event that starts the
  // § 200.521(d) six-month management-decision clock. ISO date string
  // ("YYYY-MM-DD"), confirmed against the live API 2026-08. Can be null
  // on very recent/in-progress submissions the FAC hasn't accepted yet.
  fac_accepted_date: string | null;
}

export interface FacFinding {
  report_id: string;
  audit_year: string;
  reference_number: string;
  award_reference: string;
  type_requirement: string;
  is_material_weakness: string;
  is_significant_deficiency: string;
  is_modified_opinion: string;
  is_other_matters: string;
  is_other_findings: string;
  is_questioned_costs: string;
  is_repeat_finding: string;
  prior_finding_ref_numbers: string;
}

export interface FacFindingText {
  report_id: string;
  finding_ref_number: string;
  finding_text: string;
  contains_chart_or_table: string;
}

export interface FacCap {
  report_id: string;
  finding_ref_number: string;
  planned_action: string;
  contains_chart_or_table: string;
}

/* ------------------------------------------------------------------ */
/* Compliance requirement letter -> category                           */
/* 2 CFR 200 Subpart F, Part 6 compliance requirements.                */
/* ------------------------------------------------------------------ */

const REQUIREMENT_CATEGORIES: Record<string, string> = {
  A: 'Activities Allowed or Unallowed',
  B: 'Cost Allowability',
  C: 'Cash Management',
  E: 'Eligibility',
  F: 'Equipment & Real Property',
  G: 'Matching, Level of Effort, Earmarking',
  H: 'Period of Performance',
  I: 'Procurement & Suspension/Debarment',
  J: 'Program Income',
  L: 'Reporting',
  M: 'Subrecipient Monitoring',
  N: 'Special Tests & Provisions',
  P: 'Other',
};

/**
 * type_requirement can hold multiple letters ("IL", "B,C"). Map each and
 * join, so a finding tagged against two requirements reads correctly.
 */
export function mapCategory(typeRequirement: string | null | undefined): string {
  if (!typeRequirement) return 'Other';

  const letters = typeRequirement
    .toUpperCase()
    .split(/[^A-Z]/)
    .join('')
    .split('');

  const names = Array.from(new Set(letters))
    .map((l) => REQUIREMENT_CATEGORIES[l])
    .filter(Boolean);

  return names.length ? names.join(' / ') : 'Other';
}

/**
 * FAC stores booleans as "Y"/"N" strings on the `findings` table.
 * Anything else is treated false.
 */
export function isYes(v: string | null | undefined): boolean {
  return typeof v === 'string' && v.trim().toUpperCase() === 'Y';
}

/**
 * The `general` table's boolean fields use "Yes"/"No" instead — a
 * genuinely different convention, confirmed live against 300+ rows per
 * field. Do not use isYes for these; it silently evaluates false for
 * every row regardless of the real value (caught live: this exact
 * mistake was already shipped for is_low_risk_auditee before this
 * batch).
 */
export function isYesNo(v: string | null | undefined): boolean {
  return typeof v === 'string' && v.trim().toLowerCase() === 'yes';
}

/**
 * Human labels for entity_type — confirmed live, exactly six values
 * exist on the API today. 'unknown' deliberately has no label; the page
 * just doesn't render a badge for it rather than showing "Unknown".
 */
const ENTITY_TYPE_LABELS: Record<string, string> = {
  state: 'State Government',
  local: 'Local Government',
  'higher-ed': 'Higher Education',
  'non-profit': 'Non-Profit',
  tribal: 'Tribal Government',
};

export function entityTypeLabel(entityType: string | null | undefined): string | null {
  if (!entityType) return null;
  return ENTITY_TYPE_LABELS[entityType] ?? null;
}

/**
 * gaap_results is NOT a single enum value — confirmed live, a report
 * with multiple opinion units (e.g. one on the financial statements,
 * another on a major program) comes back comma-separated, e.g.
 * "unmodified_opinion,qualified_opinion". Returns every distinct
 * opinion type present plus the single worst one, for callers that want
 * one color/label to headline (worst-first: a report that's anything
 * less than clean across every opinion unit should read as such, not
 * default to whichever happened to sort first).
 */
const GAAP_OPINION_LABELS: Record<string, string> = {
  unmodified_opinion: 'Unmodified Opinion',
  qualified_opinion: 'Qualified Opinion',
  adverse_opinion: 'Adverse Opinion',
  disclaimer_of_opinion: 'Disclaimer of Opinion',
  not_gaap: 'Non-GAAP Basis',
};

// Worst-to-best — disclaimer means the auditor couldn't form an opinion
// at all, which is worse than an opinion that's merely adverse.
const GAAP_SEVERITY_ORDER = [
  'disclaimer_of_opinion',
  'adverse_opinion',
  'qualified_opinion',
  'not_gaap',
  'unmodified_opinion',
];

export interface GaapResult {
  types: string[];
  labels: string[];
  worst: string | null;
  worstLabel: string | null;
}

export function parseGaapResults(raw: string | null | undefined): GaapResult {
  const types = (raw || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const worst =
    GAAP_SEVERITY_ORDER.find((severity) => types.includes(severity)) ?? types[0] ?? null;

  return {
    types,
    labels: types.map((t) => GAAP_OPINION_LABELS[t] ?? t),
    worst,
    worstLabel: worst ? (GAAP_OPINION_LABELS[worst] ?? worst) : null,
  };
}

/**
 * `prior_finding_ref_numbers` is free text and uses "N/A" for none.
 * Split on common separators and drop the placeholders.
 */
export function parsePriorRefs(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[,;]+/)
    .map((s) => s.trim())
    .filter((s) => s && !/^n\/?a$/i.test(s) && !/^none$/i.test(s));
}

/* ------------------------------------------------------------------ */
/* Normalized shape the app consumes                                   */
/* ------------------------------------------------------------------ */

export interface NormalizedFinding {
  reportId: string;
  auditYear: string;
  fiscalYearEnd: string;
  facFindingId: string;
  category: string;
  typeRequirement: string;
  description: string;
  plannedAction: string;
  isRepeatFinding: boolean;
  priorRefs: string[];
  isMaterialWeakness: boolean;
  isSignificantDeficiency: boolean;
  isModifiedOpinion: boolean;
  isOtherMatters: boolean;
  isOtherFindings: boolean;
  hasQuestionedCosts: boolean;
  awardReferences: string[];
}

export interface ImportedOrg {
  ein: string;
  uei: string;
  name: string;
  reports: FacGeneral[];
  findings: NormalizedFinding[];
}

/* ------------------------------------------------------------------ */
/* Queries                                                             */
/* ------------------------------------------------------------------ */

/** All audit submissions for an EIN, newest fiscal year first. */
export async function getReportsByEin(ein: string): Promise<FacGeneral[]> {
  const rows = await facGet<FacGeneral>('general', {
    auditee_ein: `eq.${ein}`,
    order: 'fy_end_date.desc',
    limit: '50',
  });
  return rows;
}

/** All audit submissions for a UEI. */
export async function getReportsByUei(uei: string): Promise<FacGeneral[]> {
  return facGet<FacGeneral>('general', {
    auditee_uei: `eq.${uei}`,
    order: 'fy_end_date.desc',
    limit: '50',
  });
}

/** Fuzzy name search, for when the user doesn't know their EIN. */
export async function searchByName(name: string): Promise<FacGeneral[]> {
  return facGet<FacGeneral>('general', {
    auditee_name: `ilike.*${name}*`,
    order: 'fy_end_date.desc',
    limit: '25',
  });
}

/**
 * Collapse the per-award rows FAC returns into one row per finding.
 *
 * IMPORTANT: /findings is keyed on (report_id, reference_number,
 * award_reference) — a single finding cited against three federal awards
 * comes back as three rows sharing one reference_number. /findings_text
 * and /corrective_action_plans have exactly one row per finding, so
 * joining naively fans the narrative out across the duplicates and
 * inflates every count in the UI.
 *
 * Merge on (report_id, reference_number): collect the award references,
 * and OR the severity flags so a finding stays flagged if any of its
 * award rows carries the flag.
 */
export function dedupeFindingRows(rows: FacFinding[]): FacFinding[] {
  const merged = new Map<string, FacFinding & { _awards: string[] }>();

  for (const row of rows) {
    const k = `${row.report_id}::${row.reference_number}`;
    const seen = merged.get(k);

    if (!seen) {
      merged.set(k, {
        ...row,
        _awards: row.award_reference ? [row.award_reference] : [],
      });
      continue;
    }

    if (row.award_reference && !seen._awards.includes(row.award_reference)) {
      seen._awards.push(row.award_reference);
    }

    // A finding is a repeat / material weakness / etc. if any award row
    // says so. Prefer "Y" over "N" rather than letting row order decide.
    const orFlag = (a: string, b: string) => (isYes(a) || isYes(b) ? 'Y' : 'N');
    seen.is_repeat_finding = orFlag(seen.is_repeat_finding, row.is_repeat_finding);
    seen.is_material_weakness = orFlag(
      seen.is_material_weakness,
      row.is_material_weakness
    );
    seen.is_significant_deficiency = orFlag(
      seen.is_significant_deficiency,
      row.is_significant_deficiency
    );
    seen.is_questioned_costs = orFlag(
      seen.is_questioned_costs,
      row.is_questioned_costs
    );
    seen.is_modified_opinion = orFlag(seen.is_modified_opinion, row.is_modified_opinion);
    seen.is_other_matters = orFlag(seen.is_other_matters, row.is_other_matters);
    seen.is_other_findings = orFlag(seen.is_other_findings, row.is_other_findings);

    // Keep whichever prior-reference value is not a placeholder.
    if (
      parsePriorRefs(seen.prior_finding_ref_numbers).length === 0 &&
      parsePriorRefs(row.prior_finding_ref_numbers).length > 0
    ) {
      seen.prior_finding_ref_numbers = row.prior_finding_ref_numbers;
    }

    // Union the compliance requirement letters across award rows.
    const letters = new Set(
      `${seen.type_requirement || ''}${row.type_requirement || ''}`
        .toUpperCase()
        .replace(/[^A-Z]/g, '')
        .split('')
    );
    seen.type_requirement = Array.from(letters).sort().join('');
  }

  return Array.from(merged.values()).map(({ _awards, ...row }) => ({
    ...row,
    award_reference: _awards.join(', '),
  }));
}

/**
 * Pull findings, finding text and CAPs for a set of reports and stitch
 * them into one row per finding.
 *
 * PostgREST supports `in.(a,b,c)` so all three tables are fetched in one
 * request each rather than per-report.
 */
export async function getFindingsForReports(
  reportIds: string[]
): Promise<NormalizedFinding[]> {
  if (reportIds.length === 0) return [];

  const inList = `in.(${reportIds.join(',')})`;

  const [rawFindings, texts, caps] = await Promise.all([
    facGet<FacFinding>('findings', { report_id: inList, limit: '1000' }),
    facGet<FacFindingText>('findings_text', { report_id: inList, limit: '1000' }),
    facGet<FacCap>('corrective_action_plans', { report_id: inList, limit: '1000' }),
  ]);

  const findings = dedupeFindingRows(rawFindings);

  const key = (reportId: string, ref: string) => `${reportId}::${ref}`;

  const textByRef = new Map(
    texts.map((t) => [key(t.report_id, t.finding_ref_number), t.finding_text])
  );
  const capByRef = new Map(
    caps.map((c) => [key(c.report_id, c.finding_ref_number), c.planned_action])
  );

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
      isModifiedOpinion: isYes(f.is_modified_opinion),
      isOtherMatters: isYes(f.is_other_matters),
      isOtherFindings: isYes(f.is_other_findings),
      hasQuestionedCosts: isYes(f.is_questioned_costs),
      awardReferences: f.award_reference ? f.award_reference.split(', ') : [],
    };
  });
}

/**
 * One call for the whole import: look up the org, then fetch and stitch
 * every finding across all its audit years.
 */
export async function importOrgByEin(ein: string): Promise<ImportedOrg | null> {
  const reports = await getReportsByEin(ein);
  if (reports.length === 0) return null;

  const fyByReport = new Map(reports.map((r) => [r.report_id, r.fy_end_date]));
  const findings = await getFindingsForReports(reports.map((r) => r.report_id));

  for (const f of findings) {
    f.fiscalYearEnd = fyByReport.get(f.reportId) || '';
  }

  // Newest fiscal year first, then by finding reference.
  findings.sort((a, b) => {
    if (a.fiscalYearEnd !== b.fiscalYearEnd) {
      return b.fiscalYearEnd.localeCompare(a.fiscalYearEnd);
    }
    return a.facFindingId.localeCompare(b.facFindingId);
  });

  const newest = reports[0];

  return {
    ein,
    uei: newest.auditee_uei,
    name: newest.auditee_name,
    reports,
    findings,
  };
}
