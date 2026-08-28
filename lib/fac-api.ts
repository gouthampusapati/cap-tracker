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

import { logFacCall } from '@/lib/fac-usage';

const FAC_BASE = 'https://api.fac.gov';

type KeyLabel = 'primary' | 'fallback';

/**
 * The FAC key(s) to try, in order. `FAC_API_KEY` is required;
 * `FAC_API_KEY_FALLBACK` is optional — when set (and distinct), facGet
 * automatically retries a rate-limited call on it. api.data.gov's
 * ~1,000/hour ceiling is per-key, so a second key genuinely doubles
 * headroom during a crawl spike; the shared budget in lib/fac-budget.ts
 * still throttles overall volume regardless.
 */
function facKeys(): { label: KeyLabel; key: string }[] {
  const primary = process.env.FAC_API_KEY;
  if (!primary) throw new Error('FAC_API_KEY is not set in the environment');
  const keys: { label: KeyLabel; key: string }[] = [{ label: 'primary', key: primary }];
  const fallback = process.env.FAC_API_KEY_FALLBACK;
  if (fallback && fallback !== primary) keys.push({ label: 'fallback', key: fallback });
  return keys;
}

function parseRateHeaders(res: Response): { remaining: number | null; limit: number | null } {
  const num = (v: string | null) =>
    v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v);
  return {
    remaining: num(res.headers.get('x-ratelimit-remaining')),
    limit: num(res.headers.get('x-ratelimit-limit')),
  };
}

async function facGet<T>(path: string, params: Record<string, string>): Promise<T[]> {
  const qs = new URLSearchParams(params).toString();
  const url = `${FAC_BASE}/${path}?${qs}`;
  const keys = facKeys();

  let lastError: unknown;

  for (let i = 0; i < keys.length; i++) {
    const { label, key } = keys[i];
    const isLastKey = i === keys.length - 1;

    let res: Response;
    try {
      res = await fetch(url, { headers: { 'X-Api-Key': key } });
    } catch (err) {
      // Network-level failure — record it (status 0) and try the next
      // key if there is one, otherwise rethrow.
      lastError = err;
      await logFacCall({ path, status: 0, keyLabel: label, rateRemaining: null, rateLimit: null });
      if (isLastKey) throw err;
      continue;
    }

    // api.data.gov's rate-limit headers come back on every response.
    // Logged (console + fac_api_call_log via logFacCall) for every call,
    // not just failures — the useful signal is the trend as remaining
    // approaches 0, and it's what backs both /admin/fac-usage and an
    // eventual "please raise our limit" request to api.data.gov.
    const { remaining, limit } = parseRateHeaders(res);
    if (remaining !== null || limit !== null) {
      console.log(
        `[fac-api] ${path} rate limit (${label} key): ${remaining ?? '?'}/${limit ?? '?'} remaining`
      );
    }
    await logFacCall({
      path,
      status: res.status,
      keyLabel: label,
      rateRemaining: remaining,
      rateLimit: limit,
    });

    // api.data.gov signals over-rate as 429, or occasionally 403 with
    // remaining pinned at 0. Either way, fall through to the next key.
    const rateLimited = res.status === 429 || (res.status === 403 && remaining === 0);
    if (rateLimited && !isLastKey) {
      console.warn(`[fac-api] ${path} rate-limited on ${label} key (${res.status}); trying next key`);
      lastError = new Error(`FAC ${path} rate-limited on ${label} key: ${res.status}`);
      continue;
    }

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`FAC ${path} returned ${res.status}: ${body.slice(0, 300)}`);
    }

    return (await res.json()) as T[];
  }

  throw lastError ?? new Error(`FAC ${path}: all API keys exhausted`);
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

/**
 * `federal_awards` row — the SEFA (Schedule of Expenditures of Federal
 * Awards) detail for one award line. Field names/encodings confirmed
 * live against api.fac.gov 2026-08, sampled across the 2023 audit year
 * and City of Cheney's real 2024 report:
 *   - is_major / is_loan / is_direct / is_passthrough_award use "Y"/"N"
 *     (the `findings` convention — use isYes, NOT isYesNo).
 *   - audit_report_type is the major-program opinion letter, domain is
 *     exactly U/Q/A/D and it is ONLY populated when is_major = "Y"
 *     (blank string for every non-major award — verified: a 2000-row
 *     sample had non-empty audit_report_type on exactly the is_major=Y
 *     rows and no others).
 *   - is_direct and is_passthrough_award are INDEPENDENT, not a binary —
 *     a single award row can carry both (received directly from the
 *     federal agency AND itself passed through to subrecipients).
 *   - cluster_name is the literal string "N/A" when unclustered, and
 *     "GSA_MIGRATION" on legacy records; the real name for the two
 *     catch-all cluster values lives in a sibling column:
 *     "OTHER CLUSTER NOT LISTED ABOVE" -> other_cluster_name,
 *     "STATE CLUSTER" -> state_cluster_name.
 *   - loan_balance is a numeric STRING (may be empty); passthrough_amount
 *     is a number or null.
 *   - cluster_total / federal_program_total are FAC-computed rollups
 *     across every award row sharing that cluster / ALN in the report.
 */
export interface FacFederalAward {
  report_id: string;
  audit_year: string;
  award_reference: string;
  federal_agency_prefix: string;
  federal_award_extension: string;
  additional_award_identification: string;
  federal_program_name: string;
  amount_expended: number;
  cluster_name: string;
  other_cluster_name: string;
  state_cluster_name: string;
  cluster_total: number;
  federal_program_total: number;
  is_major: string;
  audit_report_type: string;
  is_loan: string;
  loan_balance: string;
  is_direct: string;
  is_passthrough_award: string;
  passthrough_amount: number | null;
  findings_count: number;
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
 * Human labels for cognizant_agency/oversight_agency two-digit prefix
 * codes. NOT guessed from memory — every entry here was checked live
 * against api.fac.gov, either against federal_awards.federal_program_name
 * for that exact federal_agency_prefix (literal department name in the
 * program name, or an unambiguous flagship program only that agency
 * runs), confirmed 2026-08.
 *
 * Deliberately incomplete. A live query surfaced ~40 distinct codes
 * actually in use; several of them return mixed, contradictory, or
 * empty evidence and are NOT in this table on purpose rather than
 * guessed — same principle as PR #9's original "show the raw code"
 * decision, just narrowed now that most codes are verifiable:
 *   - 05 vs 95: both returned ONLY "HIGH INTENSITY DRUG TRAFFICKING
 *     AREAS PROGRAM (HIDTA)" as their sole example, with no
 *     differentiating evidence between the two codes. Rather than
 *     guess which one is the "real" HIDTA prefix, neither is mapped.
 *   - 06: zero federal_awards rows found under this prefix in any
 *     sample — nothing to verify against.
 *   - 70, 90, 92: each returned several unrelated program names
 *     spanning what look like multiple different agencies/commissions
 *     (e.g. 90 mixes Help America Vote Act, the Delta Regional
 *     Authority, and the Japan-US Friendship Commission) — reads as a
 *     shared/miscellaneous bucket, not one agency.
 *   - 99: returned "OTHER FEDERAL ASSISTANCE - ..." and a bare "N/A"
 *     program name — this is FAC's own catch-all, not a real agency.
 * All of these fall back to showing the raw code, same as before.
 */
const AGENCY_PREFIX_LABELS: Record<string, string> = {
  '03': 'Institute of Museum and Library Services',
  '09': 'Legal Services Corporation',
  '10': 'Department of Agriculture',
  '11': 'Department of Commerce',
  '12': 'Department of Defense',
  '14': 'Department of Housing and Urban Development',
  '15': 'Department of the Interior',
  '16': 'Department of Justice',
  '17': 'Department of Labor',
  '19': 'Department of State',
  '20': 'Department of Transportation',
  '21': 'Department of the Treasury',
  '22': 'United States Postal Service',
  '23': 'Appalachian Regional Commission',
  '27': 'Office of Personnel Management',
  '32': 'Federal Communications Commission',
  '39': 'General Services Administration',
  '43': 'National Aeronautics and Space Administration',
  '45': 'National Endowment for the Arts / National Endowment for the Humanities',
  '47': 'National Science Foundation',
  '59': 'Small Business Administration',
  '62': 'Tennessee Valley Authority',
  '64': 'Department of Veterans Affairs',
  '66': 'Environmental Protection Agency',
  '77': 'Nuclear Regulatory Commission',
  '81': 'Department of Energy',
  '84': 'Department of Education',
  '85': 'Woodrow Wilson International Center for Scholars',
  '93': 'Department of Health and Human Services',
  '94': 'AmeriCorps (Corporation for National and Community Service)',
  '96': 'Social Security Administration',
  '97': 'Department of Homeland Security',
  '98': 'U.S. Agency for International Development',
};

/**
 * Returns "<code> [<Agency Name>]" for a verified prefix, or just the
 * raw code when we deliberately don't have a confident mapping (see
 * AGENCY_PREFIX_LABELS' comment) — never a guess.
 */
export function agencyPrefixLabel(code: string | null | undefined): string | null {
  if (!code) return null;
  const trimmed = code.trim();
  if (!trimmed) return null;
  const name = AGENCY_PREFIX_LABELS[trimmed];
  return name ? `${trimmed} [${name}]` : trimmed;
}

/**
 * Just the department/agency name for a two-digit prefix, or null when
 * it isn't one of the verified mappings (see AGENCY_PREFIX_LABELS' note
 * on why several real codes are deliberately unmapped). Unlike
 * agencyPrefixLabel this omits the "NN [ ... ]" wrapper — used where the
 * ALN already shows the number and only the name adds anything.
 */
export function agencyName(code: string | null | undefined): string | null {
  if (!code) return null;
  return AGENCY_PREFIX_LABELS[code.trim()] ?? null;
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

/**
 * `federal_awards.audit_report_type` — the auditor's opinion on that
 * major program, as a single letter. Domain confirmed live: exactly
 * U/Q/A/D exist (S, GC, UM etc. return zero rows). Only set when
 * is_major = "Y".
 */
const AWARD_OPINION_LABELS: Record<string, string> = {
  U: 'Unmodified Opinion',
  Q: 'Qualified Opinion',
  A: 'Adverse Opinion',
  D: 'Disclaimer of Opinion',
};

export function awardOpinionLabel(letter: string | null | undefined): string | null {
  if (!letter) return null;
  const key = letter.trim().toUpperCase();
  return AWARD_OPINION_LABELS[key] ?? null;
}

/**
 * The effective cluster name for an award, or null when it isn't
 * clustered. "N/A" (unclustered) and "GSA_MIGRATION" (legacy record,
 * value not trustworthy) both mean "no cluster". The two catch-all
 * cluster values carry the real name in a sibling column — verified
 * live: "OTHER CLUSTER NOT LISTED ABOVE" -> other_cluster_name,
 * "STATE CLUSTER" -> state_cluster_name.
 */
export function resolveClusterName(row: {
  cluster_name: string;
  other_cluster_name: string;
  state_cluster_name: string;
}): string | null {
  const raw = (row.cluster_name || '').trim();
  if (!raw || raw === 'N/A' || raw === 'GSA_MIGRATION') return null;
  if (raw === 'OTHER CLUSTER NOT LISTED ABOVE') return (row.other_cluster_name || '').trim() || raw;
  if (raw === 'STATE CLUSTER') return (row.state_cluster_name || '').trim() || raw;
  return raw;
}

/**
 * ALN (Assistance Listing Number, formerly CFDA) from its two parts —
 * "<prefix>.<extension>", e.g. "21.027". Extension can be alphanumeric
 * ("U01", "RD"). Prefix alone if the extension is missing.
 */
export function formatAln(prefix: string | null | undefined, ext: string | null | undefined): string {
  const p = (prefix || '').trim();
  const e = (ext || '').trim();
  if (!p) return e;
  return e ? `${p}.${e}` : p;
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

export interface NormalizedAward {
  reportId: string;
  auditYear: string;
  awardReference: string;
  aln: string;
  agencyPrefix: string;
  additionalIdentification: string;
  programName: string;
  amountExpended: number;
  clusterName: string | null;
  clusterTotal: number;
  federalProgramTotal: number;
  isMajor: boolean;
  /** Spelled-out major-program opinion — only non-null when isMajor. */
  majorProgramOpinion: string | null;
  isLoan: boolean;
  loanBalance: number | null;
  isDirect: boolean;
  isPassthrough: boolean;
  passthroughAmount: number | null;
  findingsCount: number;
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

/**
 * All audit submissions for MANY EINs, in one call — PostgREST's
 * `in.(...)` filter, same technique getFindingsForReports already uses
 * for report_id. `limit` is sized per-EIN (same ceiling getReportsByEin
 * uses for one) times the batch size, since PostgREST's limit applies
 * to the total row count across every EIN in the filter, not per EIN.
 * Caller batch sizes come from PORTFOLIO_MAX_EINS (10) today, so this
 * stays small in practice even at limit=500.
 */
export async function getReportsByEins(eins: string[]): Promise<FacGeneral[]> {
  if (eins.length === 0) return [];
  return facGet<FacGeneral>('general', {
    auditee_ein: `in.(${eins.join(',')})`,
    order: 'fy_end_date.desc',
    limit: String(eins.length * 50),
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
 * Dedupes/stitches already-fetched findings + finding text + CAP rows
 * into one NormalizedFinding per finding. Pure — no FAC calls of its
 * own — so it's shared between getFindingsForReports (live API rows)
 * and lib/fac-mirror-read.ts (mirror-table rows, Sprint 4): both
 * sources produce rows in the exact same FacFinding/FacFindingText/
 * FacCap shape (confirmed live against real CSV data — same column
 * names and value encodings as the JSON API), so this stitching logic
 * only needs to exist once.
 */
export function normalizeFindings(
  rawFindings: FacFinding[],
  texts: FacFindingText[],
  caps: FacCap[]
): NormalizedFinding[] {
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

  return normalizeFindings(rawFindings, texts, caps);
}

/**
 * Parse raw `federal_awards` rows into the shape the risk-assessment
 * page consumes. Pure — no FAC calls — so it can be unit-tested and
 * (later, if the mirror ever grows a federal_awards table) shared with
 * a mirror-read path the same way normalizeFindings is.
 *
 * One row in == one row out; FAC already emits one row per award line,
 * and cluster_total / federal_program_total are FAC-computed rollups, so
 * there's nothing to dedupe or merge here (unlike findings, which fan
 * out per-award).
 */
export function normalizeAwards(rows: FacFederalAward[]): NormalizedAward[] {
  return rows.map((r) => {
    const isMajor = isYes(r.is_major);
    // Numeric string, may be "" — Number("") is 0, so guard explicitly.
    const loanBalanceRaw = (r.loan_balance || '').trim();
    return {
      reportId: r.report_id,
      auditYear: r.audit_year,
      awardReference: r.award_reference || '',
      aln: formatAln(r.federal_agency_prefix, r.federal_award_extension),
      agencyPrefix: (r.federal_agency_prefix || '').trim(),
      additionalIdentification: (r.additional_award_identification || '').trim(),
      programName: (r.federal_program_name || '').trim(),
      amountExpended: r.amount_expended ?? 0,
      clusterName: resolveClusterName(r),
      clusterTotal: r.cluster_total ?? 0,
      federalProgramTotal: r.federal_program_total ?? 0,
      isMajor,
      majorProgramOpinion: isMajor ? awardOpinionLabel(r.audit_report_type) : null,
      isLoan: isYes(r.is_loan),
      loanBalance: loanBalanceRaw ? Number(loanBalanceRaw) : null,
      isDirect: isYes(r.is_direct),
      isPassthrough: isYes(r.is_passthrough_award),
      passthroughAmount: r.passthrough_amount ?? null,
      findingsCount: r.findings_count ?? 0,
    };
  });
}

/**
 * Every SEFA award line for a set of reports, one live REST call —
 * `report_id=in.(...)`, same batching PostgREST technique as
 * getFindingsForReports. Deliberately NOT part of the bulk mirror
 * (federal_awards is a 1.33GB CSV; mirroring it would blow the storage
 * and write-quota budget) — this is fetched on demand only when someone
 * navigates to the risk-assessment page, so its cost tracks actual
 * demand for award-level detail rather than the whole mirrored corpus.
 * Budget-gate the CALLER (see lib/federal-awards.ts), not this function,
 * so the pure fetch stays reusable.
 *
 * limit 5000: an org page covers one EIN across a handful of audit
 * years; even a large state agency's multi-year SEFA stays well under
 * this. (The whole 2023 federal_awards table is ~927K rows — this is a
 * per-report slice of it.)
 */
export async function getFederalAwardsForReports(
  reportIds: string[]
): Promise<NormalizedAward[]> {
  if (reportIds.length === 0) return [];
  const rows = await facGet<FacFederalAward>('federal_awards', {
    report_id: `in.(${reportIds.join(',')})`,
    order: 'amount_expended.desc',
    limit: '5000',
  });
  return normalizeAwards(rows);
}

/**
 * `notes_to_sefa.is_minimis_rate_used` — whether the auditee used the
 * 10% de minimis indirect cost rate (2 CFR 200.414(f)) instead of a
 * negotiated rate. Confirmed live 2026-08: values are "Y" / "N" /
 * "Both" (some awards each way), plus "GSA_MIGRATION" on legacy
 * records. One logical value per report, though notes_to_sefa has
 * several rows per report (one per note) — take the first meaningful
 * one. Not mirrored (the notes CSV is ~700K rows / 718MB); fetched
 * live only on the risk-assessment page.
 */
export type DeMinimisRate = 'used' | 'not-used' | 'partial';

interface FacSefaNote {
  report_id: string;
  is_minimis_rate_used: string;
}

export function parseDeMinimis(raw: string | null | undefined): DeMinimisRate | null {
  switch ((raw || '').trim().toLowerCase()) {
    case 'y':
      return 'used';
    case 'n':
      return 'not-used';
    case 'both':
      return 'partial';
    default:
      return null; // "", "GSA_MIGRATION", anything unexpected
  }
}

export async function getDeMinimisRateForReports(
  reportIds: string[]
): Promise<Map<string, DeMinimisRate>> {
  const out = new Map<string, DeMinimisRate>();
  if (reportIds.length === 0) return out;

  const rows = await facGet<FacSefaNote>('notes_to_sefa', {
    report_id: `in.(${reportIds.join(',')})`,
    select: 'report_id,is_minimis_rate_used',
    limit: '2000',
  });

  for (const row of rows) {
    if (out.has(row.report_id)) continue;
    const parsed = parseDeMinimis(row.is_minimis_rate_used);
    if (parsed) out.set(row.report_id, parsed);
  }
  return out;
}

/**
 * Stitches one org's already-fetched reports + already-fetched findings
 * pool into an ImportedOrg — pure assembly, no FAC calls of its own.
 * Shared by importOrgByEin (one org, its own findings fetch),
 * importOrgsByEins (many orgs, one shared findings fetch across all of
 * them), and lib/fac-mirror-read.ts (Sprint 4, rows read from the local
 * mirror instead of a live FAC call) — the fiscal-year-fill-in + sort
 * logic only lives once regardless of where the raw rows came from.
 * `reports` must already be this org's reports only, newest-first.
 */
export function assembleImportedOrg(
  ein: string,
  reports: FacGeneral[],
  findingsPool: NormalizedFinding[]
): ImportedOrg {
  const reportIds = new Set(reports.map((r) => r.report_id));
  const fyByReport = new Map(reports.map((r) => [r.report_id, r.fy_end_date]));

  const findings = findingsPool
    .filter((f) => reportIds.has(f.reportId))
    .map((f) => ({ ...f, fiscalYearEnd: fyByReport.get(f.reportId) || '' }));

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

/**
 * One call for the whole import: look up the org, then fetch and stitch
 * every finding across all its audit years. 4 FAC calls total (1
 * general + 3 from getFindingsForReports) — see importOrgsByEins for
 * the same cost spread across many orgs at once.
 */
export async function importOrgByEin(ein: string): Promise<ImportedOrg | null> {
  const reports = await getReportsByEin(ein);
  if (reports.length === 0) return null;

  const findings = await getFindingsForReports(reports.map((r) => r.report_id));
  return assembleImportedOrg(ein, reports, findings);
}

/**
 * The batched sibling of importOrgByEin — imports MANY orgs for the
 * SAME 4 FAC calls importOrgByEin spends on just one, by batching the
 * `general` lookup (getReportsByEins) and the findings/text/CAP lookup
 * (getFindingsForReports, already report_id-batched) across every EIN
 * in one shot rather than looping importOrgByEin per EIN. Built for
 * lib/portfolio.ts's cold-cache case — a 10-EIN portfolio used to cost
 * up to 40 FAC calls (4 × 10, one importOrgByEin per row); this costs 4
 * regardless of how many EINs are in the batch. See
 * FAC_API_Improvement_Sprint_Checklist.md, Sprint 2.
 *
 * Returns a Map so callers can look up each EIN's result (or null, if
 * that EIN has no submissions) without relying on array order.
 */
export async function importOrgsByEins(eins: string[]): Promise<Map<string, ImportedOrg | null>> {
  const result = new Map<string, ImportedOrg | null>();
  if (eins.length === 0) return result;

  const allReports = await getReportsByEins(eins);

  const reportsByEin = new Map<string, FacGeneral[]>();
  for (const r of allReports) {
    const list = reportsByEin.get(r.auditee_ein);
    if (list) list.push(r);
    else reportsByEin.set(r.auditee_ein, [r]);
  }

  const allReportIds = allReports.map((r) => r.report_id);
  const findingsPool = await getFindingsForReports(allReportIds);

  for (const ein of eins) {
    // getReportsByEins' order clause applies across the whole result
    // set, not guaranteed stable within each EIN's subset after
    // grouping — re-sort per EIN explicitly rather than rely on that.
    const reports = (reportsByEin.get(ein) ?? [])
      .slice()
      .sort((a, b) => b.fy_end_date.localeCompare(a.fy_end_date));

    result.set(ein, reports.length === 0 ? null : assembleImportedOrg(ein, reports, findingsPool));
  }

  return result;
}
