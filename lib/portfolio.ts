import 'server-only';
import { getPublicOrgsBatch } from '@/lib/public-org-cache';
import { readOrgsFromMirror, getMirrorSyncedAt } from '@/lib/fac-mirror-read';
import { resolveCoveringFilingEins } from '@/lib/entity-resolution';
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
  // Set when the entered EIN has no Single Audit of its own but is a
  // component rolled into a parent entity's audit (a hospital in a health
  // system, an agency under a state). Every other field on the row is
  // that covering filing's — status stays 'found' because the data is
  // real, just filed under `coveringEin`. The row's "View →" link and
  // any drill-down should target `coveringEin`.
  coveringEin: string | null;
  syncedAt: Date | null;
  // Data older than the normal 24h freshness window, served because the
  // shared FAC budget was exhausted (or a refresh failed) instead of
  // discarded — see lib/public-org-cache.ts.
  stale: boolean;
}

function toRow(
  ein: string,
  org: ImportedOrg | null,
  syncedAt: Date,
  stale: boolean,
  coveringEin: string | null = null
): PortfolioRow {
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
      coveringEin: null,
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
    coveringEin,
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
    coveringEin: null,
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
 *
 * Component-EIN resolution: a pasted EIN with no filing of its own may
 * be a component of a parent entity's Single Audit. Those get resolved
 * to the covering filing and shown with the parent's data (marked
 * `coveringEin`). The resolution query and the covering-filing read are
 * BOTH mirror-only — this step adds zero FAC calls and zero cache
 * writes on top of the single batched lookup above.
 */
export async function fetchPortfolio(eins: string[]): Promise<PortfolioRow[]> {
  if (eins.length === 0) return [];

  try {
    const lookups = await getPublicOrgsBatch(eins);

    // EINs that came back with no org — whether "not found" or "budget
    // exhausted, never checked". Some are genuinely unaudited; some are
    // components rolled into a parent entity's Single Audit. Resolving
    // the latter to the covering filing is a mirror-only read (0 FAC
    // calls), so it's worth trying even for the budget-exhausted rows —
    // a big parent entity is almost always already in the mirror. The
    // same gap the org page fixed with a redirect, which a table row
    // can't do.
    const missed = eins.filter((ein) => {
      const r = lookups.get(ein);
      return !!r && !r.org;
    });
    const coveringByEin =
      missed.length > 0 ? await resolveCoveringFilingEins(missed) : new Map<string, string>();

    // Covering filings we still need data for (not already fetched above
    // as an entered EIN). Read these from the MIRROR ONLY — never a live
    // FAC call: this is a secondary "also filed under" row, the mirror's
    // weekly freshness is fine for it, and the parent's own page does
    // the deadline-aware live check when the user clicks through. This
    // keeps /portfolio's FAC-call and cache-write cost identical to
    // before this resolution step existed.
    const needMirror = [...new Set(coveringByEin.values())].filter((e) => !lookups.get(e)?.org);
    const [mirrorCovering, mirrorSyncedAt] =
      needMirror.length > 0
        ? await Promise.all([readOrgsFromMirror(needMirror), getMirrorSyncedAt()])
        : [new Map<string, ImportedOrg>(), null];

    const coveringRow = (ein: string, parentEin: string): PortfolioRow | null => {
      const fromBatch = lookups.get(parentEin);
      if (fromBatch?.org) {
        return toRow(ein, fromBatch.org, fromBatch.syncedAt, fromBatch.stale, parentEin);
      }
      const fromMirror = mirrorCovering.get(parentEin);
      if (fromMirror && mirrorSyncedAt) {
        return toRow(ein, fromMirror, mirrorSyncedAt, false, parentEin);
      }
      return null;
    };

    return eins.map((ein) => {
      const result = lookups.get(ein);
      if (!result) return errorRow(ein);
      if (result.org) return toRow(ein, result.org, result.syncedAt, result.stale);

      const parentEin = coveringByEin.get(ein);
      if (parentEin) {
        const row = coveringRow(ein, parentEin);
        if (row) return row;
      }
      // No covering filing. Preserve the org page's distinction: "never
      // checked, budget exhausted" (unavailable) is not "not found" —
      // the table renders 'error' as "couldn't be checked right now"
      // rather than implying the org has no findings.
      return result.unavailable
        ? errorRow(ein)
        : toRow(ein, null, result.syncedAt, result.stale);
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
