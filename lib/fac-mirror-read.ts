import 'server-only';
import { eq, inArray, desc } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  facMirrorGeneral,
  facMirrorFindings,
  facMirrorFindingsText,
  facMirrorCorrectiveActionPlans,
  facMirrorSyncLog,
} from '@/lib/db/schema';
import {
  assembleImportedOrg,
  normalizeFindings,
  type ImportedOrg,
  type FacGeneral,
  type FacFinding,
  type FacFindingText,
  type FacCap,
} from '@/lib/fac-api';

/**
 * Reads org data from the local bulk-CSV mirror (Sprint 4,
 * FAC_API_Improvement_Sprint_Checklist.md) instead of a live FAC API
 * call — see scripts/sync-fac-mirror.mjs for how the mirror tables get
 * populated. Row shapes read here are mapped straight into the same
 * FacGeneral/FacFinding/FacFindingText/FacCap interfaces the live path
 * uses (lib/fac-api.ts), then run through the exact same
 * normalizeFindings/assembleImportedOrg — confirmed live 2026-08-27
 * that the mirror's CSV source uses identical column names and
 * "Yes"/"No" / "Y"/"N" value encodings to the JSON API, so no separate
 * parsing logic is needed here.
 */

/** Most recent successful mirror sync's completion time, or null if the
 * mirror has never completed a sync (first deploy, before the first
 * scheduled GitHub Actions run). lib/public-org-cache.ts uses this to
 * decide whether the mirror is fresh enough to trust for a given org,
 * same effectiveMaxAgeMs logic Sprint 3 already built — just measured
 * against the mirror's own sync time instead of a per-EIN cache row.
 *
 * In-process memo with a short TTL: this value only changes when the
 * weekly sync completes, but it's read on every cache-miss org render
 * (and every /portfolio submission), where it was a full DB round-trip
 * on the critical path. 60s is short enough that a just-finished sync is
 * picked up within a minute, and the memo is per-instance so a fresh
 * serverless instance never serves a stale-forever value. */
let syncedAtMemo: { value: Date | null; at: number } | null = null;
const SYNCED_AT_MEMO_MS = 60_000;

export async function getMirrorSyncedAt(): Promise<Date | null> {
  const now = Date.now();
  if (syncedAtMemo && now - syncedAtMemo.at < SYNCED_AT_MEMO_MS) {
    return syncedAtMemo.value;
  }
  const [row] = await db
    .select({ completedAt: facMirrorSyncLog.completedAt })
    .from(facMirrorSyncLog)
    .where(eq(facMirrorSyncLog.status, 'success'))
    .orderBy(desc(facMirrorSyncLog.completedAt))
    .limit(1);
  const value = row?.completedAt ?? null;
  syncedAtMemo = { value, at: now };
  return value;
}

// The exact fac_mirror_general columns the org-page read path needs.
// Selected explicitly (not `db.select()`) so columns added to the table
// for other purposes — e.g. the auditee/auditor contact fields carried
// for outbound outreach — don't have to exist yet for a build-time
// prerender query to succeed. Keep in sync with rowToFacGeneral below.
const GENERAL_COLUMNS = {
  reportId: facMirrorGeneral.reportId,
  auditeeEin: facMirrorGeneral.auditeeEin,
  auditeeUei: facMirrorGeneral.auditeeUei,
  auditeeName: facMirrorGeneral.auditeeName,
  auditYear: facMirrorGeneral.auditYear,
  fyEndDate: facMirrorGeneral.fyEndDate,
  fyStartDate: facMirrorGeneral.fyStartDate,
  totalAmountExpended: facMirrorGeneral.totalAmountExpended,
  entityType: facMirrorGeneral.entityType,
  isLowRiskAuditee: facMirrorGeneral.isLowRiskAuditee,
  isGoingConcernIncluded: facMirrorGeneral.isGoingConcernIncluded,
  isMaterialNoncomplianceDisclosed: facMirrorGeneral.isMaterialNoncomplianceDisclosed,
  gaapResults: facMirrorGeneral.gaapResults,
  auditorFirmName: facMirrorGeneral.auditorFirmName,
  auditorEin: facMirrorGeneral.auditorEin,
  cognizantAgency: facMirrorGeneral.cognizantAgency,
  oversightAgency: facMirrorGeneral.oversightAgency,
  facAcceptedDate: facMirrorGeneral.facAcceptedDate,
} as const;

type GeneralRow = Pick<typeof facMirrorGeneral.$inferSelect, keyof typeof GENERAL_COLUMNS>;

function rowToFacGeneral(row: GeneralRow): FacGeneral {
  return {
    report_id: row.reportId,
    auditee_ein: row.auditeeEin,
    auditee_uei: row.auditeeUei ?? '',
    auditee_name: row.auditeeName ?? '',
    audit_year: row.auditYear ?? '',
    fy_end_date: row.fyEndDate ?? '',
    fy_start_date: row.fyStartDate ?? '',
    total_amount_expended: row.totalAmountExpended ?? 0,
    entity_type: row.entityType ?? '',
    is_low_risk_auditee: row.isLowRiskAuditee ?? '',
    is_going_concern_included: row.isGoingConcernIncluded ?? '',
    is_material_noncompliance_disclosed: row.isMaterialNoncomplianceDisclosed ?? '',
    gaap_results: row.gaapResults ?? '',
    auditor_firm_name: row.auditorFirmName ?? '',
    auditor_ein: row.auditorEin ?? '',
    cognizant_agency: row.cognizantAgency ?? '',
    oversight_agency: row.oversightAgency ?? '',
    fac_accepted_date: row.facAcceptedDate ?? null,
  };
}

function rowToFacFinding(row: typeof facMirrorFindings.$inferSelect): FacFinding {
  return {
    report_id: row.reportId,
    audit_year: row.auditYear ?? '',
    reference_number: row.referenceNumber,
    award_reference: row.awardReference ?? '',
    type_requirement: row.typeRequirement ?? '',
    is_material_weakness: row.isMaterialWeakness ?? '',
    is_significant_deficiency: row.isSignificantDeficiency ?? '',
    is_modified_opinion: row.isModifiedOpinion ?? '',
    is_other_matters: row.isOtherMatters ?? '',
    is_other_findings: row.isOtherFindings ?? '',
    is_questioned_costs: row.isQuestionedCosts ?? '',
    is_repeat_finding: row.isRepeatFinding ?? '',
    prior_finding_ref_numbers: row.priorFindingRefNumbers ?? '',
  };
}

function rowToFacFindingText(row: typeof facMirrorFindingsText.$inferSelect): FacFindingText {
  return {
    report_id: row.reportId,
    finding_ref_number: row.findingRefNumber,
    finding_text: row.findingText ?? '',
    contains_chart_or_table: row.containsChartOrTable ?? '',
  };
}

function rowToFacCap(row: typeof facMirrorCorrectiveActionPlans.$inferSelect): FacCap {
  return {
    report_id: row.reportId,
    finding_ref_number: row.findingRefNumber,
    planned_action: row.plannedAction ?? '',
    contains_chart_or_table: row.containsChartOrTable ?? '',
  };
}

/**
 * Reads one org from the mirror. Returns null when the EIN has no rows
 * in fac_mirror_general — this means EITHER "genuinely has no Single
 * Audit history" OR "mirror hasn't been synced since this EIN's first
 * submission" — same ambiguity the live API's empty-result case has,
 * so callers (lib/public-org-cache.ts) fall through to the existing
 * live-fetch path on a mirror miss rather than treating it as a
 * confirmed not-found, exactly like today's cache-miss handling.
 */
export async function readOrgFromMirror(ein: string): Promise<ImportedOrg | null> {
  const generalRows = await db
    .select(GENERAL_COLUMNS)
    .from(facMirrorGeneral)
    .where(eq(facMirrorGeneral.auditeeEin, ein));

  if (generalRows.length === 0) return null;

  const reports = generalRows
    .map(rowToFacGeneral)
    .sort((a, b) => b.fy_end_date.localeCompare(a.fy_end_date));
  const reportIds = reports.map((r) => r.report_id);

  const [findingRows, textRows, capRows] = await Promise.all([
    db.select().from(facMirrorFindings).where(inArray(facMirrorFindings.reportId, reportIds)),
    db.select().from(facMirrorFindingsText).where(inArray(facMirrorFindingsText.reportId, reportIds)),
    db
      .select()
      .from(facMirrorCorrectiveActionPlans)
      .where(inArray(facMirrorCorrectiveActionPlans.reportId, reportIds)),
  ]);

  const findings = normalizeFindings(
    findingRows.map(rowToFacFinding),
    textRows.map(rowToFacFindingText),
    capRows.map(rowToFacCap)
  );

  return assembleImportedOrg(ein, reports, findings);
}

/**
 * Batched sibling of readOrgFromMirror — one query per mirror table for
 * the WHOLE batch of EINs, mirroring the same batching approach
 * importOrgsByEins uses for the live path (Sprint 2). Returns a Map;
 * an EIN with no rows in fac_mirror_general is simply absent from the
 * map (not present as null) — callers should treat "absent" as "check
 * the live/public_org_cache path for this one" the same way a mirror
 * miss is handled in readOrgFromMirror.
 */
export async function readOrgsFromMirror(eins: string[]): Promise<Map<string, ImportedOrg>> {
  const result = new Map<string, ImportedOrg>();
  if (eins.length === 0) return result;

  const generalRows = await db
    .select(GENERAL_COLUMNS)
    .from(facMirrorGeneral)
    .where(inArray(facMirrorGeneral.auditeeEin, eins));

  if (generalRows.length === 0) return result;

  const reportsByEin = new Map<string, FacGeneral[]>();
  for (const row of generalRows) {
    const general = rowToFacGeneral(row);
    const list = reportsByEin.get(general.auditee_ein);
    if (list) list.push(general);
    else reportsByEin.set(general.auditee_ein, [general]);
  }

  const allReportIds = generalRows.map((r) => r.reportId);

  const [findingRows, textRows, capRows] = await Promise.all([
    db.select().from(facMirrorFindings).where(inArray(facMirrorFindings.reportId, allReportIds)),
    db
      .select()
      .from(facMirrorFindingsText)
      .where(inArray(facMirrorFindingsText.reportId, allReportIds)),
    db
      .select()
      .from(facMirrorCorrectiveActionPlans)
      .where(inArray(facMirrorCorrectiveActionPlans.reportId, allReportIds)),
  ]);

  const findingsPool = normalizeFindings(
    findingRows.map(rowToFacFinding),
    textRows.map(rowToFacFindingText),
    capRows.map(rowToFacCap)
  );

  for (const [ein, reportsUnsorted] of reportsByEin) {
    const reports = reportsUnsorted.slice().sort((a, b) => b.fy_end_date.localeCompare(a.fy_end_date));
    result.set(ein, assembleImportedOrg(ein, reports, findingsPool));
  }

  return result;
}
