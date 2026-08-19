/**
 * Fixed-window rate limiter, in memory.
 *
 * Scope: protects the FAC API quota (api.data.gov, ~1,000 req/hour/key)
 * from a scraper hammering the public /single-audit/[ein] pages or
 * /api/org/[ein]. Both share this quota, so both are limited here — see
 * middleware.ts.
 *
 * Caveat: this state lives in one serverless/edge instance. Vercel can run
 * several instances of the same function concurrently (across regions or
 * under load), and a cold start resets the counter, so this is a per-instance
 * speed bump, not a hard global cap. It stops a single naive crawler from
 * burning the hourly FAC quota in seconds; it will not stop a distributed
 * or deliberately evasive one. If that becomes the actual threat model,
 * replace this with a shared store (Upstash Redis / Vercel KV) — the
 * isRateLimited() call site doesn't need to change, only this file.
 */

const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 30;

// Cap how many distinct keys (IPs) we'll track at once so a distributed
// scraper can't grow this map without bound.
const MAX_TRACKED_KEYS = 5_000;

const hits = new Map<string, { count: number; windowStart: number }>();

export function isRateLimited(key: string): boolean {
  const now = Date.now();
  const entry = hits.get(key);

  if (!entry || now - entry.windowStart >= WINDOW_MS) {
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
  return entry.count > MAX_REQUESTS_PER_WINDOW;
}
