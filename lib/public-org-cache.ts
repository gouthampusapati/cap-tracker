import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { publicOrgCache } from '@/lib/db/schema';
import { importOrgByEin, type ImportedOrg } from '@/lib/fac-api';

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
}

export async function getPublicOrg(ein: string): Promise<OrgLookupResult> {
  const [cached] = await db
    .select()
    .from(publicOrgCache)
    .where(eq(publicOrgCache.ein, ein))
    .limit(1);

  const isFresh = cached && Date.now() - cached.syncedAt.getTime() < SYNC_MAX_AGE_MS;

  if (isFresh) {
    return {
      org: cached.found && cached.snapshot ? (JSON.parse(cached.snapshot) as ImportedOrg) : null,
      syncedAt: cached.syncedAt,
      fromCache: true,
    };
  }

  // Cache miss or stale — fetch live. If FAC fails here and we have an
  // old cached row, serve the stale data rather than nothing: stale-but-
  // labeled beats a hard failure for a page whose whole value is being
  // dependable. Only propagate the error when there's truly nothing to
  // fall back to.
  try {
    const org = await importOrgByEin(ein);
    const now = new Date();

    await db
      .insert(publicOrgCache)
      .values({ ein, found: org !== null, snapshot: org ? JSON.stringify(org) : null, syncedAt: now })
      .onConflictDoUpdate({
        target: publicOrgCache.ein,
        set: { found: org !== null, snapshot: org ? JSON.stringify(org) : null, syncedAt: now },
      });

    return { org, syncedAt: now, fromCache: false };
  } catch (error) {
    if (cached) {
      console.error(`Live fetch failed for ${ein}, serving stale cache from ${cached.syncedAt.toISOString()}:`, error);
      return {
        org: cached.found && cached.snapshot ? (JSON.parse(cached.snapshot) as ImportedOrg) : null,
        syncedAt: cached.syncedAt,
        fromCache: true,
      };
    }
    throw error;
  }
}
