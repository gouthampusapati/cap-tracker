import { eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { publicOrgCache } from '@/lib/db/schema';
import { importOrgByEin, importOrgsByEins, type ImportedOrg } from '@/lib/fac-api';
import { hasFacBudget, recordFacFetch } from '@/lib/fac-budget';
import { effectiveMaxAgeMs } from '@/lib/org-cache-ttl';

/**
 * The single shared cache for public org data — backs both
 * /single-audit/[ein] and /portfolio, so an EIN looked up through either
 * feature warms the cache for both. A cache hit within the effective
 * max-age (see lib/org-cache-ttl.ts) never touches FAC at all: fast, and
 * immune to FAC being rate-limited or briefly down, which is the whole
 * point (see the false-404 bug this session already hit once from a
 * live fetch failure with nowhere to fall back to).
 *
 * TTL is filing-aware, not a flat window — see lib/org-cache-ttl.ts for
 * why and the actual TTL logic (pulled into its own module so it's
 * directly unit testable without pulling in `server-only`/db). See
 * FAC_API_Improvement_Sprint_Checklist.md, Sprint 3.
 */

export interface OrgLookupResult {
  org: ImportedOrg | null;
  syncedAt: Date;
  fromCache: boolean;
  /** True when this is cached data older than its effective max age
   * (see effectiveMaxAgeMs), served because the shared FAC budget was
   * exhausted (or the live fetch failed) rather than because it was
   * still considered fresh. Callers should say so plainly — the date
   * alone doesn't make that obvious. */
  stale: boolean;
  /** True when we have literally never checked this EIN and the shared
   * FAC budget is currently exhausted, so we couldn't check now either.
   * `org` is null here too, same as a genuine "not found" — but callers
   * MUST treat this differently: it is not evidence the org has no
   * audit history, only that nobody has looked yet. This used to throw
   * (caught by error.tsx / a 500), which is both a worse experience for
   * a real visitor and, under sustained crawler load discovering EINs
   * faster than the budget refills, was the majority of the site's
   * measured error rate — routine, expected demand showing up as
   * "errors" instead of a normal response. */
  unavailable: boolean;
}

type CacheRow = { ein: string; found: boolean; snapshot: string | null; syncedAt: Date };

function fromCacheRow(cached: CacheRow): { org: ImportedOrg | null; syncedAt: Date } {
  return {
    org: cached.found && cached.snapshot ? (JSON.parse(cached.snapshot) as ImportedOrg) : null,
    syncedAt: cached.syncedAt,
  };
}

/** Shared by getPublicOrg and getPublicOrgsBatch so the freshness rule
 * (effectiveMaxAgeMs, applied to the cached org's most recent fy_end_date)
 * can't drift between the single and batched paths. */
function isCacheRowFresh(cached: CacheRow | undefined): boolean {
  if (!cached) return false;
  const cachedOrg = fromCacheRow(cached).org;
  const maxAge = effectiveMaxAgeMs(cached.found, cachedOrg?.reports[0]?.fy_end_date, Date.now());
  return Date.now() - cached.syncedAt.getTime() < maxAge;
}

/** Shared upsert shape — one row, found/snapshot/syncedAt. */
async function upsertCacheRow(ein: string, org: ImportedOrg | null, now: Date): Promise<void> {
  await db
    .insert(publicOrgCache)
    .values({ ein, found: org !== null, snapshot: org ? JSON.stringify(org) : null, syncedAt: now })
    .onConflictDoUpdate({
      target: publicOrgCache.ein,
      set: { found: org !== null, snapshot: org ? JSON.stringify(org) : null, syncedAt: now },
    });
}

export async function getPublicOrg(ein: string): Promise<OrgLookupResult> {
  const [cached] = await db
    .select()
    .from(publicOrgCache)
    .where(eq(publicOrgCache.ein, ein))
    .limit(1);

  if (isCacheRowFresh(cached)) {
    return { ...fromCacheRow(cached), fromCache: true, stale: false, unavailable: false };
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
      return { ...fromCacheRow(cached), fromCache: true, stale: true, unavailable: false };
    }
    // Never checked before, and we can't check now. This is routine
    // under sustained crawler load (a new EIN discovered faster than
    // the budget refills), not a bug — a thrown error here (the
    // previous behavior) turned normal, expected demand into a 500 for
    // every one of these, which is what actually drove the site's error
    // rate up. Return a normal result instead; callers render a plain
    // "come back shortly" state rather than an error page.
    console.warn(`FAC budget exhausted, no cache for ${ein} — reporting unavailable, not an error`);
    return { org: null, syncedAt: new Date(), fromCache: false, stale: false, unavailable: true };
  }

  // If FAC fails here and we have an old cached row, serve the stale
  // data rather than nothing: stale-but-labeled beats a hard failure for
  // a page whose whole value is being dependable. Only propagate the
  // error when there's truly nothing to fall back to.
  try {
    await recordFacFetch();
    const org = await importOrgByEin(ein);
    const now = new Date();
    await upsertCacheRow(ein, org, now);

    return { org, syncedAt: now, fromCache: false, stale: false, unavailable: false };
  } catch (error) {
    if (cached) {
      console.error(`Live fetch failed for ${ein}, serving stale cache from ${cached.syncedAt.toISOString()}:`, error);
      return { ...fromCacheRow(cached), fromCache: true, stale: true, unavailable: false };
    }
    throw error;
  }
}

/**
 * The batched sibling of getPublicOrg — same cache/budget rules, but
 * looks up MANY EINs for the cost of one live fetch instead of one per
 * EIN. Built for lib/portfolio.ts, whose per-EIN getPublicOrg loop used
 * to cost up to 4 FAC calls PER ROW on a cold cache (up to 40 for a
 * 10-EIN portfolio); this costs 4 total for the whole batch, regardless
 * of size, by routing cache misses through importOrgsByEins instead of
 * looping importOrgByEin. See FAC_API_Improvement_Sprint_Checklist.md,
 * Sprint 2.
 */
export async function getPublicOrgsBatch(eins: string[]): Promise<Map<string, OrgLookupResult>> {
  const results = new Map<string, OrgLookupResult>();
  if (eins.length === 0) return results;

  const cachedRows = await db.select().from(publicOrgCache).where(inArray(publicOrgCache.ein, eins));
  const cacheByEin = new Map(cachedRows.map((r) => [r.ein, r]));

  const missEins: string[] = [];
  for (const ein of eins) {
    const cached = cacheByEin.get(ein);
    if (isCacheRowFresh(cached)) {
      results.set(ein, { ...fromCacheRow(cached!), fromCache: true, stale: false, unavailable: false });
    } else {
      missEins.push(ein);
    }
  }

  if (missEins.length === 0) return results;

  // One shared budget check for the WHOLE batch, not per EIN — a
  // batched fetch is still ~4 real FAC calls regardless of how many
  // EINs it covers (see importOrgsByEins), so it costs exactly one unit
  // against the shared budget, same as a single-org lookup.
  const budgetOk = await hasFacBudget();

  if (!budgetOk) {
    for (const ein of missEins) {
      const cached = cacheByEin.get(ein);
      if (cached) {
        console.warn(`FAC budget exhausted, serving stale cache for ${ein} from ${cached.syncedAt.toISOString()}`);
        results.set(ein, { ...fromCacheRow(cached), fromCache: true, stale: true, unavailable: false });
      } else {
        console.warn(`FAC budget exhausted, no cache for ${ein} — reporting unavailable, not an error`);
        results.set(ein, { org: null, syncedAt: new Date(), fromCache: false, stale: false, unavailable: true });
      }
    }
    return results;
  }

  try {
    await recordFacFetch();
    const orgsByEin = await importOrgsByEins(missEins);
    const now = new Date();

    // DB writes, not FAC calls — looping here doesn't cost anything
    // against the budget already spent above for the whole batch.
    for (const ein of missEins) {
      const org = orgsByEin.get(ein) ?? null;
      await upsertCacheRow(ein, org, now);
      results.set(ein, { org, syncedAt: now, fromCache: false, stale: false, unavailable: false });
    }
  } catch (error) {
    // Unlike getPublicOrg, deliberately do NOT rethrow when an EIN has
    // no cache to fall back to — one FAC outage shouldn't take down
    // every row of a portfolio page, including ones this same call
    // already resolved from cache above. Report just that EIN as
    // unavailable instead.
    for (const ein of missEins) {
      const cached = cacheByEin.get(ein);
      if (cached) {
        console.error(`Live batch fetch failed, serving stale cache for ${ein} from ${cached.syncedAt.toISOString()}:`, error);
        results.set(ein, { ...fromCacheRow(cached), fromCache: true, stale: true, unavailable: false });
      } else {
        console.error(`Live batch fetch failed for ${ein}, no cache to fall back to:`, error);
        results.set(ein, { org: null, syncedAt: new Date(), fromCache: false, stale: false, unavailable: true });
      }
    }
  }

  return results;
}
