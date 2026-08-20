import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { publicOrgCache } from '@/lib/db/schema';
import { importOrgByEin, type ImportedOrg } from '@/lib/fac-api';
import { hasFacBudget, recordFacFetch } from '@/lib/fac-budget';

/**
 * The single shared cache for public org data — backs both
 * /single-audit/[ein] and /portfolio, so an EIN looked up through either
 * feature warms the cache for both. A cache hit within SYNC_MAX_AGE_MS
 * never touches FAC at all: fast, and immune to FAC being rate-limited
 * or briefly down, which is the whole point (see the false-404 bug this
 * session already hit once from a live fetch failure with nowhere to
 * fall back to).
 */
const SYNC_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface OrgLookupResult {
  org: ImportedOrg | null;
  syncedAt: Date;
  fromCache: boolean;
  /** True when this is cached data older than SYNC_MAX_AGE_MS, served
   * because the shared FAC budget was exhausted (or the live fetch
   * failed) rather than because it was still considered fresh. Callers
   * should say so plainly — the date alone doesn't make that obvious. */
  stale: boolean;
}

function fromCacheRow(cached: {
  found: boolean;
  snapshot: string | null;
  syncedAt: Date;
}): { org: ImportedOrg | null; syncedAt: Date } {
  return {
    org: cached.found && cached.snapshot ? (JSON.parse(cached.snapshot) as ImportedOrg) : null,
    syncedAt: cached.syncedAt,
  };
}

export async function getPublicOrg(ein: string): Promise<OrgLookupResult> {
  const [cached] = await db
    .select()
    .from(publicOrgCache)
    .where(eq(publicOrgCache.ein, ein))
    .limit(1);

  const isFresh = cached && Date.now() - cached.syncedAt.getTime() < SYNC_MAX_AGE_MS;

  if (isFresh) {
    return { ...fromCacheRow(cached), fromCache: true, stale: false };
  }

  // Not fresh (missing or expired). Check the shared, site-wide FAC
  // budget *before* attempting a live fetch — this is what actually
  // prevents the "two-thirds of attempts just fail" problem: rather than
  // racing FAC once the quota's already spent for the hour, fall back to
  // whatever's cached (even if stale) immediately, clearly labeled.
  // Nothing gets lost to a doomed request.
  const budgetOk = await hasFacBudget();

  if (!budgetOk) {
    if (cached) {
      console.warn(`FAC budget exhausted, serving stale cache for ${ein} from ${cached.syncedAt.toISOString()}`);
      return { ...fromCacheRow(cached), fromCache: true, stale: true };
    }
    throw new Error(
      'FAC request budget exhausted for this hour and no cached data exists for this EIN yet.'
    );
  }

  // If FAC fails here and we have an old cached row, serve the stale
  // data rather than nothing: stale-but-labeled beats a hard failure for
  // a page whose whole value is being dependable. Only propagate the
  // error when there's truly nothing to fall back to.
  try {
    await recordFacFetch();
    const org = await importOrgByEin(ein);
    const now = new Date();

    await db
      .insert(publicOrgCache)
      .values({ ein, found: org !== null, snapshot: org ? JSON.stringify(org) : null, syncedAt: now })
      .onConflictDoUpdate({
        target: publicOrgCache.ein,
        set: { found: org !== null, snapshot: org ? JSON.stringify(org) : null, syncedAt: now },
      });

    return { org, syncedAt: now, fromCache: false, stale: false };
  } catch (error) {
    if (cached) {
      console.error(`Live fetch failed for ${ein}, serving stale cache from ${cached.syncedAt.toISOString()}:`, error);
      return { ...fromCacheRow(cached), fromCache: true, stale: true };
    }
    throw error;
  }
}
