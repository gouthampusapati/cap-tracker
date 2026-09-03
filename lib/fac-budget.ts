import { gt, lt, and, sql, desc, isNotNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { facFetchLog, facApiCallLog } from '@/lib/db/schema';

/**
 * Shared, site-wide throttle on live FAC fetches — separate from (and a
 * more important protection than) the per-IP rate limiter in
 * lib/rate-limit.ts. That one can't meaningfully cap a crawler, which
 * arrives from many IPs; this gates FAC-fetch attempts globally, in
 * Turso, so every serverless instance and every consumer (org pages,
 * /portfolio, /single-audit/[ein]/risk-assessment, /api/org/[ein])
 * shares one real budget against FAC's actual ~1,000/hour-per-key quota.
 *
 * Found live on 2026-08-20: without this, a single well-behaved crawler
 * working through the sitemap exhausted the shared quota almost
 * continuously. That crawl scenario is mostly moot now — the sitemap's
 * org EINs are all in the local mirror at 0 FAC cost — but the
 * (unmirrored) federal_awards data behind /risk-assessment is still
 * live-fetched, and steady crawl of the org-page → risk-assessment link
 * kept this gate pinned.
 *
 * The gate is driven by FAC's OWN `x-ratelimit-remaining` header (which
 * lib/fac-api.ts logs per call to fac_api_call_log), not a static guess:
 * draw on the primary key until api.data.gov says it's nearly spent,
 * then the fallback key (FAC_API_KEY_FALLBACK) up to its own limit —
 * mirroring the 429 → next-key roll that facGet already does at the HTTP
 * level. A static per-hour count is kept only as a backstop for when the
 * rate headers are missing.
 */
const WINDOW_MS = 60 * 60 * 1000; // 1 hour
const RATE_LOOKBACK_MS = 20 * 60 * 1000;

// Stop drawing on a key once api.data.gov says it has this few calls left
// in its hourly window — headroom for the read-then-fetch race and for
// other consumers hitting the same key.
export const KEY_RATE_FLOOR = 60;

// Backstops on fetch *batches*/hour (each batch is ~2–4 FAC calls):
//  - HARD:  only meant to bind if FAC stops sending rate headers with a
//           key still nominally healthy. Dropped from 700 to 300 after
//           the Sep 2026 spike: with federal_awards now cached per-EIN in
//           Turso (lib/federal-awards.ts) the legitimate steady-state
//           batch rate is a small fraction of one key, so a tighter
//           backstop costs real traffic nothing and caps a runaway
//           (crawler discovering cold EINs faster than the cache warms)
//           far lower. 300 batches × ~3 calls ≈ 900/hr, still inside one
//           key, leaving the rate gate in control in the normal case.
//  - BLIND: when there's no usable rate signal at all in the lookback
//           window, fall back to this much tighter cap (~one key's worth).
export const HARD_HOURLY_BATCH_CEILING = 300;
export const BLIND_HOURLY_BATCH_CEILING = 100;

export function fallbackKeyConfigured(): boolean {
  const fb = process.env.FAC_API_KEY_FALLBACK;
  return !!fb && fb !== process.env.FAC_API_KEY;
}

/**
 * Pure budget decision — see hasFacBudget for how the inputs are
 * gathered. `latestRemainingByKey` maps 'primary' / 'fallback' to that
 * key's most recent x-ratelimit-remaining; a key absent from the map
 * hasn't been called in the lookback window (so its hourly limit has
 * reset and is intact).
 */
export function evaluateFacBudget(input: {
  batchCount: number;
  hasRateSignal: boolean;
  latestRemainingByKey: Record<string, number>;
  fallbackConfigured: boolean;
}): boolean {
  if (input.batchCount >= HARD_HOURLY_BATCH_CEILING) return false;

  if (!input.hasRateSignal) {
    return input.batchCount < BLIND_HOURLY_BATCH_CEILING;
  }

  const primary = input.latestRemainingByKey.primary;
  // undefined = primary not called recently → its window has reset.
  if (primary === undefined || primary > KEY_RATE_FLOOR) return true;

  if (input.fallbackConfigured) {
    const fb = input.latestRemainingByKey.fallback;
    if (fb === undefined || fb > KEY_RATE_FLOOR) return true;
  }

  return false;
}

export async function hasFacBudget(): Promise<boolean> {
  const now = Date.now();

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(facFetchLog)
    .where(gt(facFetchLog.fetchedAt, new Date(now - WINDOW_MS)));

  const recent = await db
    .select({
      keyLabel: facApiCallLog.keyLabel,
      rateRemaining: facApiCallLog.rateRemaining,
    })
    .from(facApiCallLog)
    .where(
      and(
        gt(facApiCallLog.calledAt, new Date(now - RATE_LOOKBACK_MS)),
        isNotNull(facApiCallLog.rateRemaining)
      )
    )
    .orderBy(desc(facApiCallLog.calledAt))
    .limit(40);

  const latestRemainingByKey: Record<string, number> = {};
  for (const r of recent) {
    if (r.rateRemaining != null && !(r.keyLabel in latestRemainingByKey)) {
      latestRemainingByKey[r.keyLabel] = r.rateRemaining;
    }
  }

  return evaluateFacBudget({
    batchCount: Number(count),
    hasRateSignal: recent.length > 0,
    latestRemainingByKey,
    fallbackConfigured: fallbackKeyConfigured(),
  });
}

export async function recordFacFetch(): Promise<void> {
  await db.insert(facFetchLog).values({
    id: crypto.randomUUID(),
    fetchedAt: new Date(),
  });

  // Opportunistic cleanup so this table doesn't grow forever — only
  // bother roughly 1 in 20 calls rather than every single one.
  if (Math.random() < 0.05) {
    const cutoff = new Date(Date.now() - 2 * WINDOW_MS);
    await db.delete(facFetchLog).where(lt(facFetchLog.fetchedAt, cutoff));
  }
}
