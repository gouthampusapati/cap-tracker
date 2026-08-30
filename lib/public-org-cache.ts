import { eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { publicOrgCache } from '@/lib/db/schema';
import { importOrgByEin, importOrgsByEins, type ImportedOrg } from '@/lib/fac-api';
import { hasFacBudget, recordFacFetch } from '@/lib/fac-budget';
import { effectiveMaxAgeMs } from '@/lib/org-cache-ttl';
import { readOrgFromMirror, readOrgsFromMirror, getMirrorSyncedAt } from '@/lib/fac-mirror-read';

/**
 * The single shared read path for public org data — backs both
 * /single-audit/[ein] and /portfolio, so an EIN looked up through either
 * feature warms the cache for both.
 *
 * Read order, cheapest first:
 * 1. Local bulk-CSV mirror (lib/fac-mirror-read.ts, Sprint 4) — a hit
 *    here is 0 FAC calls AND 0 DB writes, not just a cache hit. Only
 *    trusted when fresh enough for that specific org (see
 *    isMirrorFreshFor below); an org near its next filing deadline
 *    still falls through even if it's in the mirror, since the mirror
 *    can be up to ~1 sync-cycle stale.
 * 2. public_org_cache — a hit within the effective max-age (see
 *    lib/org-cache-ttl.ts) never touches FAC at all either, just a
 *    cheap DB read instead of the mirror's (slightly heavier) read.
 * 3. Live FAC API call, budget-gated (lib/fac-budget.ts) — only reached
 *    for an EIN genuinely new since the mirror's last sync, or
 *    genuinely stale in public_org_cache.
 *
 * Falling back to stale cached data (rather than nothing) on a live
 * fetch failure, and reporting "unavailable" rather than a false
 * "not found" when the shared budget is exhausted with no cache to
 * fall back to, are both unchanged from before Sprint 4 — see the
 * false-404 bug this session hit once from a live fetch failure with
 * nowhere to fall back to. TTL is filing-aware, not a flat window — see
 * lib/org-cache-ttl.ts. FAC_API_Improvement_Sprint_Checklist.md,
 * Sprints 3-4.
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

/**
 * Whether the local bulk-CSV mirror (Sprint 4) is fresh enough to trust
 * for this specific org, reusing the exact same filing-aware rule
 * Sprint 3 built for the per-EIN cache — just measured against the
 * mirror's own last-successful-sync time instead of a per-EIN
 * `syncedAt`. An org whose next filing is plausibly due soon still
 * falls through to a live check even if it's in the mirror, since the
 * mirror can be up to ~1 sync-cycle stale.
 */
function isMirrorFreshFor(org: ImportedOrg, mirrorSyncedAt: Date | null): boolean {
  if (!mirrorSyncedAt) return false;
  const maxAge = effectiveMaxAgeMs(true, org.reports[0]?.fy_end_date, Date.now());
  return Date.now() - mirrorSyncedAt.getTime() < maxAge;
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

// `next build` sets this. During the static prerender of the top-org
// pages (app/single-audit/[ein]/generateStaticParams) we must never make
// a live FAC call — the build runs hundreds of these back to back and
// would blow the shared budget, then prerender "not checked yet" pages.
// The mirror has every one of those orgs, so build renders serve from it
// (stale-labeled if past the freshness window); the first runtime
// revalidation does the proper deadline-aware live check.
const IS_BUILD = process.env.NEXT_PHASE === 'phase-production-build';

export async function getPublicOrg(ein: string): Promise<OrgLookupResult> {
  // Mirror + mirror-sync-time together — a mirror hit is 0 FAC calls AND
  // 0 public_org_cache writes. These don't depend on each other, and the
  // sync time was a serial DB round-trip on the critical path of every
  // cache-miss render; fetch them at once. (getMirrorSyncedAt is also
  // memoized in-process now — see lib/fac-mirror-read.ts.)
  const [mirrorOrg, mirrorSyncedAt] = await Promise.all([
    readOrgFromMirror(ein),
    getMirrorSyncedAt(),
  ]);
  if (mirrorOrg && isMirrorFreshFor(mirrorOrg, mirrorSyncedAt)) {
    return { org: mirrorOrg, syncedAt: mirrorSyncedAt!, fromCache: true, stale: false, unavailable: false };
  }

  // Serve the mirror copy rather than nothing whenever a live check
  // isn't possible right now. `stale` distinguishes why:
  //  - at build time it's `false` — the weekly mirror IS the authoritative
  //    data we serve, the page just shows "Data as of <sync date>", and
  //    the first runtime revalidation does the real deadline-aware check;
  //  - at runtime (FAC budget spent, or a live fetch threw) it's `true` —
  //    we wanted fresher data and couldn't get it, so the page says so.
  const mirrorFallback = (stale: boolean): OrgLookupResult | null =>
    mirrorOrg && mirrorSyncedAt
      ? { org: mirrorOrg, syncedAt: mirrorSyncedAt, fromCache: true, stale, unavailable: false }
      : null;

  const [cached] = await db
    .select()
    .from(publicOrgCache)
    .where(eq(publicOrgCache.ein, ein))
    .limit(1);

  if (isCacheRowFresh(cached)) {
    return { ...fromCacheRow(cached), fromCache: true, stale: false, unavailable: false };
  }

  if (IS_BUILD) {
    return (
      mirrorFallback(false) ??
      (cached
        ? { ...fromCacheRow(cached), fromCache: true, stale: false, unavailable: false }
        : { org: null, syncedAt: new Date(), fromCache: false, stale: false, unavailable: true })
    );
  }

  // Not fresh (missing or expired). Check the shared, site-wide FAC
  // budget *before* attempting a live fetch — this is what actually
  // prevents the "two-thirds of attempts just fail" problem: rather than
  // racing FAC once the quota's already spent for the hour, fall back to
  // whatever's cached (even if stale) immediately, clearly labeled.
  // Nothing gets lost to a doomed request.
  const budgetOk = await hasFacBudget();

  if (!budgetOk) {
    const fallback = mirrorFallback(true);
    if (fallback) {
      console.warn(`FAC budget exhausted, serving mirror copy for ${ein} from ${fallback.syncedAt.toISOString()}`);
      return fallback;
    }
    if (cached) {
      console.warn(`FAC budget exhausted, serving stale cache for ${ein} from ${cached.syncedAt.toISOString()}`);
      return { ...fromCacheRow(cached), fromCache: true, stale: true, unavailable: false };
    }
    // Never checked before, not in the mirror, and we can't check now.
    // This is routine under sustained crawler load (a new EIN discovered
    // faster than the budget refills), not a bug — a thrown error here
    // (the previous behavior) turned normal, expected demand into a 500
    // for every one of these, which is what actually drove the site's
    // error rate up. Return a normal result instead; callers render a
    // plain "come back shortly" state rather than an error page.
    console.warn(`FAC budget exhausted, no cache for ${ein} — reporting unavailable, not an error`);
    return { org: null, syncedAt: new Date(), fromCache: false, stale: false, unavailable: true };
  }

  // If FAC fails here, serve whatever we can (mirror copy, then stale
  // cache) rather than nothing: stale-but-labeled beats a hard failure
  // for a page whose whole value is being dependable. Only propagate the
  // error when there's truly nothing at all to fall back to.
  try {
    await recordFacFetch();
    const org = await importOrgByEin(ein);
    const now = new Date();
    await upsertCacheRow(ein, org, now);

    return { org, syncedAt: now, fromCache: false, stale: false, unavailable: false };
  } catch (error) {
    const fallback = mirrorFallback(true);
    if (fallback) {
      console.error(`Live fetch failed for ${ein}, serving mirror copy from ${fallback.syncedAt.toISOString()}:`, error);
      return fallback;
    }
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

  // Mirror check first, same reasoning as getPublicOrg — one shared
  // query for the whole batch (readOrgsFromMirror), one shared
  // getMirrorSyncedAt() call, so a portfolio's worth of EINs already in
  // the mirror costs 0 FAC calls and 0 public_org_cache writes.
  const mirrorOrgs = await readOrgsFromMirror(eins);
  const mirrorSyncedAt = mirrorOrgs.size > 0 ? await getMirrorSyncedAt() : null;
  const stillNeeded: string[] = [];
  for (const ein of eins) {
    const mirrorOrg = mirrorOrgs.get(ein);
    if (mirrorOrg && isMirrorFreshFor(mirrorOrg, mirrorSyncedAt)) {
      results.set(ein, { org: mirrorOrg, syncedAt: mirrorSyncedAt!, fromCache: true, stale: false, unavailable: false });
    } else {
      stillNeeded.push(ein);
    }
  }
  if (stillNeeded.length === 0) return results;

  const cachedRows = await db.select().from(publicOrgCache).where(inArray(publicOrgCache.ein, stillNeeded));
  const cacheByEin = new Map(cachedRows.map((r) => [r.ein, r]));

  const missEins: string[] = [];
  for (const ein of stillNeeded) {
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
