/**
 * Fixed-window rate limiter, in memory.
 *
 * Scope: protects the FAC API quota (api.data.gov, ~1,000 req/hour/key)
 * from a scraper hammering the public /single-audit/[ein] pages,
 * /api/org/[ein], or /portfolio. All three share this quota, so all are
 * limited here — see middleware.ts.
 *
 * Caveat: this state lives in one serverless/edge instance. Vercel can run
 * several instances of the same function concurrently (across regions or
 * under load), and a cold start resets the counter, so this is a per-instance
 * speed bump, not a hard global cap. It stops a single naive crawler from
 * burning the hourly FAC quota in seconds; it will not stop a distributed
 * or deliberately evasive one. If that becomes the actual threat model,
 * replace this with a shared store (Upstash Redis / Vercel KV) — call
 * sites don't need to change, only this file.
 */

// Cap how many distinct keys (IPs) any one limiter will track at once, so
// a distributed scraper can't grow a map without bound.
const MAX_TRACKED_KEYS = 5_000;

function createLimiter(windowMs: number, maxRequests: number) {
  const hits = new Map<string, { count: number; windowStart: number }>();

  return function isLimited(key: string): boolean {
    const now = Date.now();
    const entry = hits.get(key);

    if (!entry || now - entry.windowStart >= windowMs) {
      if (hits.size >= MAX_TRACKED_KEYS && !entry) {
        // Evict the oldest-looking entry rather than let the map grow
        // unbounded. Not exact LRU — good enough for a stopgap.
        const oldestKey = hits.keys().next().value;
        if (oldestKey !== undefined) hits.delete(oldestKey);
      }
      hits.set(key, { count: 1, windowStart: now });
      return false;
    }

    entry.count += 1;
    return entry.count > maxRequests;
  };
}

// Single-org lookups (/single-audit/[ein], /api/org/[ein]): ~4 FAC calls
// each. 30/min is generous for a real visitor, tight enough to stop a
// naive full-catalog crawl.
export const isRateLimited = createLimiter(60_000, 30);

// /portfolio: up to 50 EINs per submission, ~4 FAC calls each — a single
// submission can cost as much as the single-org limiter's entire budget
// for 6+ minutes. Budgeted far tighter: a real grants manager checking a
// portfolio a few times an hour is nowhere near this; a script wouldn't
// get past the first handful of submissions.
export const isPortfolioRateLimited = createLimiter(15 * 60_000, 3);
