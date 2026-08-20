import { gt, lt, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { facFetchLog } from '@/lib/db/schema';

/**
 * Shared, site-wide throttle on live FAC fetches — separate from (and a
 * more important protection than) the per-IP rate limiter in
 * lib/rate-limit.ts. That one can't meaningfully cap a crawler, which
 * arrives from many IPs; this counts actual FAC-fetch attempts globally,
 * in Turso, so every serverless instance and every consumer
 * (org pages, /portfolio, /api/org/[ein]) shares one real budget against
 * FAC's actual ~1,000/hour quota.
 *
 * Found live on 2026-08-20: without this, a single well-behaved crawler
 * working through the sitemap was enough on its own to exhaust the
 * shared quota almost continuously, and two-thirds of fetch attempts in
 * a sample were failing outright — not degrading gracefully, just lost.
 */
const WINDOW_MS = 60 * 60 * 1000; // 1 hour

// Each fetch is ~4 FAC calls (lib/fac-api.ts). 180 fetches/hour ≈ 720
// calls/hour, safely under FAC's ~1,000/hour ceiling with headroom left
// for direct dashboard imports and manual testing that don't go through
// this shared cache at all.
const HOURLY_FETCH_BUDGET = 180;

export async function hasFacBudget(): Promise<boolean> {
  const windowStart = new Date(Date.now() - WINDOW_MS);
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(facFetchLog)
    .where(gt(facFetchLog.fetchedAt, windowStart));

  return count < HOURLY_FETCH_BUDGET;
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
