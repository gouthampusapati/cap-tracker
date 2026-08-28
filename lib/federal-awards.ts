import { cache } from 'react';
import { getPublicOrg } from '@/lib/public-org-cache';
import { hasFacBudget, recordFacFetch } from '@/lib/fac-budget';
import {
  getFederalAwardsForReports,
  type FacGeneral,
  type NormalizedAward,
  type NormalizedFinding,
} from '@/lib/fac-api';

/**
 * Org-level federal-awards (SEFA) lookup backing
 * /single-audit/[ein]/risk-assessment.
 *
 * Split of labour:
 *  - Reports + findings + identity come from getPublicOrg — that path is
 *    mirror-backed (Sprint 4) and usually costs 0 FAC calls.
 *  - The award lines themselves are NOT mirrored (federal_awards is a
 *    1.33GB CSV) — they're fetched live here, gated on the same shared
 *    site-wide FAC budget every other live path uses (lib/fac-budget.ts).
 *
 * Result kinds mirror app/single-audit/[ein]/page.tsx's OrgFetchResult:
 *  - 'ok'          — org found, awards fetched (awards may be [] for an
 *                    org that filed but had no SEFA detail).
 *  - 'not-found'   — no FAC submissions for this EIN.
 *  - 'unavailable' — org is known, but the shared FAC budget is spent so
 *                    the live award fetch couldn't run. NOT an error, and
 *                    NOT "no awards": render a "check back shortly" state.
 */

export interface AwardYear {
  reportId: string;
  auditYear: string;
  fiscalYearEnd: string;
  totalAmountExpended: number;
  awards: NormalizedAward[];
}

export interface OrgAwardsData {
  ein: string;
  name: string;
  uei: string;
  years: AwardYear[];
  /** award_reference -> finding anchor ids on the main org page, so an
   * award row with findings_count > 0 can deep-link to the exact finding
   * card. Built from findings we already have — no extra FAC call. */
  findingAnchorsByAward: Record<string, string[]>;
  syncedAt: Date;
  stale: boolean;
}

export type OrgAwardsResult =
  | { kind: 'ok'; data: OrgAwardsData }
  | { kind: 'not-found' }
  | { kind: 'unavailable' };

/** Anchor id for a finding card on the main org page — must match
 * FindingCard's `id` in app/single-audit/[ein]/finding-card.tsx. */
function findingAnchorId(f: NormalizedFinding): string {
  return `${f.reportId}-${f.facFindingId}`;
}

function buildFindingAnchors(findings: NormalizedFinding[]): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  for (const f of findings) {
    for (const ref of f.awardReferences) {
      const key = ref.trim();
      if (!key) continue;
      (map[key] ??= []).push(findingAnchorId(f));
    }
  }
  return map;
}

function toAwardYears(reports: FacGeneral[], awards: NormalizedAward[]): AwardYear[] {
  const byReport = new Map<string, NormalizedAward[]>();
  for (const a of awards) {
    const list = byReport.get(a.reportId);
    if (list) list.push(a);
    else byReport.set(a.reportId, [a]);
  }
  return reports
    .map((r) => ({
      reportId: r.report_id,
      auditYear: r.audit_year,
      fiscalYearEnd: r.fy_end_date,
      totalAmountExpended: r.total_amount_expended ?? 0,
      awards: byReport.get(r.report_id) ?? [],
    }))
    .filter((y) => y.awards.length > 0)
    .sort((a, b) => b.fiscalYearEnd.localeCompare(a.fiscalYearEnd));
}

/**
 * Wrapped in React `cache()` so generateMetadata and the page render in
 * the same request share ONE lookup — without this the live award fetch
 * (and its recordFacFetch budget charge) would run twice per page load.
 */
export const getFederalAwardsForOrg = cache(_getFederalAwardsForOrg);

async function _getFederalAwardsForOrg(ein: string): Promise<OrgAwardsResult> {
  if (!/^\d{9}$/.test(ein)) return { kind: 'not-found' };

  const { org, syncedAt, stale } = await getPublicOrg(ein);
  if (!org) return { kind: 'not-found' };

  const reportIds = org.reports.map((r) => r.report_id);
  if (reportIds.length === 0) return { kind: 'not-found' };

  if (!(await hasFacBudget())) {
    return { kind: 'unavailable' };
  }

  let awards: NormalizedAward[];
  try {
    await recordFacFetch();
    awards = await getFederalAwardsForReports(reportIds);
  } catch {
    // The org itself loaded fine; only the award fetch failed. Treat it
    // like a spent budget — a transient FAC problem, not "no awards".
    return { kind: 'unavailable' };
  }

  return {
    kind: 'ok',
    data: {
      ein: org.ein,
      name: org.name,
      uei: org.uei,
      years: toAwardYears(org.reports, awards),
      findingAnchorsByAward: buildFindingAnchors(org.findings),
      syncedAt,
      stale,
    },
  };
}
