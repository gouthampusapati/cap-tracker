import 'server-only';
import { getPublicOrgsBatch } from '@/lib/public-org-cache';
import { computeManagementDecisionDeadline, soonestDeadline } from '@/lib/management-decision';
import type { ImportedOrg } from '@/lib/fac-api';

// Re-exported for existing importers (e.g. app/portfolio/page.tsx) — the
// actual implementation moved to lib/ein-list.ts, which has zero
// DB-touching imports. A 'use client' component MUST import these two
// from lib/ein-list.ts directly, not from here: importing anything from
// this file pulls in the `server-only` guard above and the whole
// DB/FAC dependency chain below, which is exactly the bug that broke
// /portfolio in production (see lib/ein-list.ts's comment for the story).
export { PORTFOLIO_MAX_EINS, parseEinList } from '@/lib/ein-list';

export interface PortfolioRow {
  ein: string;
  // 'error' is deliberately distinct from 'not-found' — a fetch failure
  // (FAC down/rate-limited, no cached fallback) says nothing about
  // whether the org actually exists. Collapsing the two into one
  // "not found" state was the same bug the org page had; see
  // app/single-audit/[ein]/page.tsx and error.tsx for the fuller fix.
  status: 'found' | 'not-found' | 'error';
  orgName: string | null;
  mostRecentFyEnd: string | null;
  totalFindings: number;
  repeatFindings: number;
  materialWeaknesses: number;
  managementDecisionDays: number | null; // null = no deadline to show
  managementDecisionLabel: string | null; // e.g. "34 days" / "124 days overdue" / null
  syncedAt: Date | null;
  // Data older than the normal 24h freshness window, served because the
  // shared FAC budget was exhausted (or a refresh failed) instead of
  // discarded — see lib/public-org-cache.ts.
  stale: boolean;
}

function toRow(ein: string, org: ImportedOrg | null, syncedAt: Date, stale: boolean): PortfolioRow {
  if (!org) {
    return {
      ein,
      status: 'not-found',
      orgName: null,
      mostRecentFyEnd: null,
      totalFindings: 0,
      repeatFindings: 0,
      materialWeaknesses: 0,
      managementDecisionDays: null,
      managementDecisionLabel: null,
      syncedAt,
      stale,
    };
  }

  const deadline = soonestDeadline(
    org.reports.map((r) => computeManagementDecisionDeadline(r.fac_accepted_date))
  );

  return {
    ein,
    status: 'found',
    orgName: org.name,
    mostRecentFyEnd: org.reports[0]?.fy_end_date ?? null,
    totalFindings: org.findings.length,
    repeatFindings: org.findings.filter((f) => f.isRepeatFinding).length,
    materialWeaknesses: org.findings.filter((f) => f.isMaterialWeakness).length,
    managementDecisionDays: deadline?.daysFromToday ?? null,
    managementDecisionLabel: deadline
      ? deadline.state === 'past'
        ? `${Math.abs(deadline.daysFromToday)}d overdue`
        : `${deadline.daysFromToday}d`
      : null,
    syncedAt,
    stale,
  };
}

function errorRow(ein: string): PortfolioRow {
  return {
    ein,
    status: 'error',
    orgName: null,
    mostRecentFyEnd: null,
    totalFindings: 0,
    repeatFindings: 0,
    materialWeaknesses: 0,
    managementDecisionDays: null,
    managementDecisionLabel: null,
    syncedAt: null,
    stale: false,
  };
}

/**
 * Fetches every EIN in the portfolio via one batched lookup
 * (getPublicOrgsBatch) rather than a per-EIN worker pool — a cold cache
 * used to cost up to 4 FAC calls per row (up to 40 for a 10-EIN
 * portfolio); now it's 4 total for the whole page regardless of size.
 * See FAC_API_Improvement_Sprint_Checklist.md, Sprint 2. The old
 * bounded-concurrency worker pool this replaced existed specifically to
 * throttle N independent per-EIN live fetches running in parallel —
 * moot now that a cold portfolio is one shared live fetch, not N.
 */
export async function fetchPortfolio(eins: string[]): Promise<PortfolioRow[]> {
  if (eins.length === 0) return [];

  try {
    const lookups = await getPublicOrgsBatch(eins);
    return eins.map((ein) => {
      const result = lookups.get(ein);
      if (!result) return errorRow(ein);
      // Same distinction as the org page: "never checked, budget
      // exhausted" is not "not found" — reuse the 'error' row status,
      // which the table already renders as "couldn't be checked right
      // now" rather than implying the org has no findings.
      return result.unavailable
        ? errorRow(ein)
        : toRow(ein, result.org, result.syncedAt, result.stale);
    });
  } catch (error) {
    console.error('Portfolio batch fetch failed:', error);
    return eins.map((ein) => errorRow(ein));
  }
}

/** Sort default from the spec: soonest management-decision deadline
 * first (overdue counts as "soonest" — it's already due), then most
 * repeat findings as a tiebreaker. Not-found, error, and no-deadline
 * rows sort to the end. */
export function defaultSort(rows: PortfolioRow[]): PortfolioRow[] {
  return [...rows].sort((a, b) => {
    const aHas = a.managementDecisionDays !== null;
    const bHas = b.managementDecisionDays !== null;
    if (aHas && bHas) {
      if (a.managementDecisionDays !== b.managementDecisionDays) {
        return a.managementDecisionDays! - b.managementDecisionDays!;
      }
    } else if (aHas !== bHas) {
      return aHas ? -1 : 1;
    }
    return b.repeatFindings - a.repeatFindings;
  });
}
