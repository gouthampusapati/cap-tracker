import { unstable_cache } from 'next/cache';
import { importOrgByEin } from '@/lib/fac-api';
import { computeManagementDecisionDeadline, soonestDeadline } from '@/lib/management-decision';

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
  found: boolean;
  orgName: string | null;
  mostRecentFyEnd: string | null;
  totalFindings: number;
  repeatFindings: number;
  materialWeaknesses: number;
  managementDecisionDays: number | null; // null = no deadline to show
  managementDecisionLabel: string | null; // e.g. "34 days" / "124 days overdue" / null
}

/**
 * Same 1-hour cadence as the org pages' own `revalidate = 3600` — a
 * portfolio submission that includes an EIN someone already looked up (or
 * that appears in another portfolio) within the last hour is served from
 * Next's data cache instead of re-hitting the FAC. Keyed per-EIN so cache
 * hits are shared across every caller, not just repeat submissions of the
 * identical list.
 */
const getCachedOrg = unstable_cache(
  async (ein: string) => importOrgByEin(ein),
  ['portfolio-org-lookup'],
  { revalidate: 3600 }
);

function toRow(ein: string, org: Awaited<ReturnType<typeof importOrgByEin>>): PortfolioRow {
  if (!org) {
    return {
      ein,
      found: false,
      orgName: null,
      mostRecentFyEnd: null,
      totalFindings: 0,
      repeatFindings: 0,
      materialWeaknesses: 0,
      managementDecisionDays: null,
      managementDecisionLabel: null,
    };
  }

  const deadline = soonestDeadline(
    org.reports.map((r) => computeManagementDecisionDeadline(r.fac_accepted_date))
  );

  return {
    ein,
    found: true,
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
  };
}

/**
 * Fetches a batch of EINs with bounded concurrency — not all 50 at once.
 * Each org fetch already does up to 4 FAC calls itself (see
 * lib/fac-api.ts); running many orgs fully in parallel would multiply
 * that into a burst well beyond anything reasonable for a shared
 * ~1,000/hour key, on top of just being a lot of simultaneous connections
 * to a third-party API that doesn't belong to this site.
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
        const org = await getCachedOrg(ein);
        results[i] = toRow(ein, org);
      } catch (error) {
        console.error(`Portfolio fetch failed for ${ein}:`, error);
        results[i] = toRow(ein, null);
      }
    }
  }

  const workers = Array.from({ length: Math.min(CONCURRENCY, eins.length) }, () => worker());
  await Promise.all(workers);

  return results;
}

/** Sort default from the spec: soonest management-decision deadline
 * first (overdue counts as "soonest" — it's already due), then most
 * repeat findings as a tiebreaker. Not-found and no-deadline rows sort
 * to the end. */
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
