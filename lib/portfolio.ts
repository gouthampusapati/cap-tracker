import { getPublicOrg } from '@/lib/public-org-cache';
import { computeManagementDecisionDeadline, soonestDeadline } from '@/lib/management-decision';
import type { ImportedOrg } from '@/lib/fac-api';

export const PORTFOLIO_MAX_EINS = 50;

/**
 * Parses a pasted block of EINs — newline or comma separated, tolerating
 * extra whitespace and formatted EINs like "91-6001236". Dedupes while
 * preserving first-seen order, and reports which entries didn't look like
 * a 9-digit EIN at all (distinct from "not found in the FAC," which is a
 * live lookup result, not a parsing problem).
 */
export function parseEinList(raw: string): { eins: string[]; invalid: string[] } {
  const tokens = raw
    .split(/[\n,]+/)
    .map((t) => t.trim())
    .filter(Boolean);

  const eins: string[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();

  for (const token of tokens) {
    const digitsOnly = token.replace(/[^0-9]/g, '');
    if (!/^\d{9}$/.test(digitsOnly)) {
      invalid.push(token);
      continue;
    }
    if (!seen.has(digitsOnly)) {
      seen.add(digitsOnly);
      eins.push(digitsOnly);
    }
  }

  return { eins, invalid };
}

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
 * Fetches a batch of EINs with bounded concurrency — not all 50 at once.
 * Each org fetch already does up to 4 FAC calls itself when it's an
 * actual cache miss (see lib/fac-api.ts); running many uncached orgs
 * fully in parallel would multiply that into a burst well beyond
 * anything reasonable for a shared ~1,000/hour key, on top of just being
 * a lot of simultaneous connections to a third-party API that doesn't
 * belong to this site. Cache hits (lib/public-org-cache.ts) are cheap
 * DB reads and don't need this throttling, but the pool doesn't know
 * which EINs will hit vs. miss ahead of time, so it throttles uniformly.
 */
const CONCURRENCY = 6;

export async function fetchPortfolio(eins: string[]): Promise<PortfolioRow[]> {
  const results: PortfolioRow[] = new Array(eins.length);
  let next = 0;

  async function worker() {
    while (next < eins.length) {
      const i = next++;
      const ein = eins[i];
      try {
        const { org, syncedAt, stale } = await getPublicOrg(ein);
        results[i] = toRow(ein, org, syncedAt, stale);
      } catch (error) {
        console.error(`Portfolio fetch failed for ${ein}:`, error);
        results[i] = errorRow(ein);
      }
    }
  }

  const workers = Array.from({ length: Math.min(CONCURRENCY, eins.length) }, () => worker());
  await Promise.all(workers);

  return results;
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
