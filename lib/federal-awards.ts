import { cache } from 'react';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { federalAwardsCache } from '@/lib/db/schema';
import { getPublicOrg } from '@/lib/public-org-cache';
import { hasFacBudget, recordFacFetch } from '@/lib/fac-budget';
import { effectiveMaxAgeMs } from '@/lib/org-cache-ttl';
import {
  getFederalAwardsForReports,
  getDeMinimisRateForReports,
  type DeMinimisRate,
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
  /** notes_to_sefa.is_minimis_rate_used for this report, or null when
   * the record doesn't say (legacy GSA_MIGRATION rows, or no note). */
  deMinimisRate: DeMinimisRate | null;
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

function toAwardYears(
  reports: FacGeneral[],
  awards: NormalizedAward[],
  deMinimisByReport: Map<string, DeMinimisRate>
): AwardYear[] {
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
      deMinimisRate: deMinimisByReport.get(r.report_id) ?? null,
    }))
    .filter((y) => y.awards.length > 0)
    .sort((a, b) => b.fiscalYearEnd.localeCompare(a.fiscalYearEnd));
}

/* ---- per-EIN Turso cache (federal_awards_cache) ----
 *
 * The award detail behind this page (federal_awards + notes_to_sefa) is
 * the one public dataset not in the local bulk mirror, so an uncached
 * render costs 2 live FAC calls. Crawler traffic revisiting the
 * org-page → risk-assessment link (once per ISR window per URL) is what
 * repeatedly pinned the shared FAC budget. This cache collapses that to
 * one fetch per EIN per filing-aware TTL — the same DEFAULT/NEAR_DEADLINE
 * window public_org_cache uses (lib/org-cache-ttl.ts), since an accepted
 * SEFA doesn't change retroactively and a new one isn't plausible until
 * near the next filing deadline. */

interface CachedAwards {
  found: boolean;
  data: OrgAwardsData | null;
  syncedAt: Date;
}

function reviveAwards(row: {
  found: boolean;
  snapshot: string | null;
  syncedAt: Date;
}): CachedAwards {
  if (!row.found || !row.snapshot) return { found: false, data: null, syncedAt: row.syncedAt };
  const parsed = JSON.parse(row.snapshot) as OrgAwardsData;
  // syncedAt round-trips through JSON as a string — revive it, the page
  // calls .toLocaleDateString() on it.
  parsed.syncedAt = new Date(parsed.syncedAt);
  return { found: true, data: parsed, syncedAt: row.syncedAt };
}

async function readAwardsCache(ein: string): Promise<CachedAwards | null> {
  const [row] = await db
    .select()
    .from(federalAwardsCache)
    .where(eq(federalAwardsCache.ein, ein))
    .limit(1);
  return row ? reviveAwards(row) : null;
}

function isAwardsCacheFresh(cached: CachedAwards): boolean {
  const fyEnd = cached.data?.years[0]?.fiscalYearEnd;
  const maxAge = effectiveMaxAgeMs(cached.found, fyEnd, Date.now());
  return Date.now() - cached.syncedAt.getTime() < maxAge;
}

async function writeAwardsCache(ein: string, data: OrgAwardsData | null): Promise<void> {
  const now = new Date();
  await db
    .insert(federalAwardsCache)
    .values({ ein, found: data !== null, snapshot: data ? JSON.stringify(data) : null, syncedAt: now })
    .onConflictDoUpdate({
      target: federalAwardsCache.ein,
      set: { found: data !== null, snapshot: data ? JSON.stringify(data) : null, syncedAt: now },
    });
}

/**
 * Wrapped in React `cache()` so generateMetadata and the page render in
 * the same request share ONE lookup — without this the live award fetch
 * (and its recordFacFetch budget charge) would run twice per page load.
 */
export const getFederalAwardsForOrg = cache(_getFederalAwardsForOrg);

async function _getFederalAwardsForOrg(ein: string): Promise<OrgAwardsResult> {
  if (!/^\d{9}$/.test(ein)) return { kind: 'not-found' };

  const cached = await readAwardsCache(ein);
  if (cached && isAwardsCacheFresh(cached)) {
    return cached.found && cached.data
      ? { kind: 'ok', data: cached.data }
      : { kind: 'not-found' };
  }

  const { org, syncedAt, stale } = await getPublicOrg(ein);
  if (!org) {
    await writeAwardsCache(ein, null);
    return { kind: 'not-found' };
  }

  const reportIds = org.reports.map((r) => r.report_id);
  if (reportIds.length === 0) {
    await writeAwardsCache(ein, null);
    return { kind: 'not-found' };
  }

  // Cache miss / stale and no budget to refresh: serve a stale hit if we
  // have one (clearly labeled), otherwise a "check back shortly" state.
  if (!(await hasFacBudget())) {
    if (cached?.found && cached.data) {
      return { kind: 'ok', data: { ...cached.data, stale: true } };
    }
    return { kind: 'unavailable' };
  }

  let awards: NormalizedAward[];
  let deMinimisByReport: Map<string, DeMinimisRate>;
  try {
    await recordFacFetch();
    // Both live calls counted as one fetch against the budget — same
    // report_id batch, issued together.
    [awards, deMinimisByReport] = await Promise.all([
      getFederalAwardsForReports(reportIds),
      getDeMinimisRateForReports(reportIds).catch(() => new Map<string, DeMinimisRate>()),
    ]);
  } catch {
    // The org itself loaded fine; only the award fetch failed. Serve a
    // stale hit if we have one, else "unavailable" — a transient FAC
    // problem, not "no awards".
    if (cached?.found && cached.data) {
      return { kind: 'ok', data: { ...cached.data, stale: true } };
    }
    return { kind: 'unavailable' };
  }

  const data: OrgAwardsData = {
    ein: org.ein,
    name: org.name,
    uei: org.uei,
    years: toAwardYears(org.reports, awards, deMinimisByReport),
    findingAnchorsByAward: buildFindingAnchors(org.findings),
    syncedAt,
    stale,
  };
  await writeAwardsCache(ein, data);
  return { kind: 'ok', data };
}
