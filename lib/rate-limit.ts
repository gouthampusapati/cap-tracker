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

// Single-org lookups (/single-audit/[ein], /api/org/[ein]). Originally
// sized purely against FAC-quota risk (each miss costs ~4 FAC calls) —
// loosened after Sprint 4 (local bulk-CSV mirror, ~413K orgs cached
// locally): the large majority of lookups now cost 0 FAC calls
// regardless of request rate, since they resolve straight from the
// mirror. 120/min is still well above any real visitor's rate, while
// staying far below what would meaningfully strain the server on
// mirror-hit traffic (a DB read + render, not free, just much cheaper
// than a live FAC round-trip).
export const isRateLimited = createLimiter(60_000, 120);

// Same surfaces as isRateLimited (now just the /api/* routes — the org
// page moved off middleware, see middleware.ts), but over an hour. The
// two run TOGETHER. Kept as a secondary cap on the API surfaces; the
// shared FAC budget (lib/fac-budget.ts, 140 fetches/hour site-wide) is
// the real ceiling and applies to the org page too via its data layer.
export const isHourlyRateLimited = createLimiter(60 * 60_000, 90);

// /portfolio: up to PORTFOLIO_MAX_EINS EINs per submission (10, was 50
// — see lib/ein-list.ts). Originally budgeted assuming ~4 FAC calls PER
// EIN (up to 40/submission) before Sprint 2 batched the whole
// submission into one shared live fetch (~4 calls total, same cost as
// a single-org lookup, regardless of portfolio size) and Sprint 4's
// mirror made most of those EINs free outright. 3/15min (caught live —
// this exact limiter blocked normal repeat testing of one portfolio
// during this session) was sized for a cost model that no longer
// applies; 30/15min keeps a real cap (a script still can't hammer this)
// while being generous enough for actual use, including a person
// re-checking/testing the same portfolio a few times in a row.
export const isPortfolioRateLimited = createLimiter(15 * 60_000, 30);

// /api/waitlist: doesn't touch FAC at all (just a DB insert), so this
// isn't protecting a shared external quota like the two limiters above —
// it's just stopping a script from filling the table with junk. 5/min/IP
// is generous for a real visitor filling out one form once.
export const isWaitlistRateLimited = createLimiter(60_000, 5);

// /api/auth/signin/email (magic-link sign-in): doesn't touch FAC either,
// but unlike waitlist a hit here costs a real email send — and, unlike
// every other limiter above, the cost lands on whatever address gets
// typed in, not just this app's own resources. Tighter than the rest
// (3/min/IP) since the realistic abuse case is spamming an arbitrary
// inbox with sign-in links, not just database junk.
export const isMagicLinkRateLimited = createLimiter(60_000, 3);
