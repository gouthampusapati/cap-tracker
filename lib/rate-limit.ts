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

// Same surfaces as isRateLimited, but over an hour rather than a minute
// — the two run TOGETHER, not as alternatives. 30/min alone doesn't
// actually protect the shared FAC budget (lib/fac-budget.ts,
// 180 lookups/hour site-wide): a single IP sustaining even a fraction
// of that per-minute allowance for a few minutes can burn through the
// *entire* hourly site-wide budget on its own, starving every other
// visitor. 20/hour/IP is generous for a real visitor (nobody looks up
// 20 different EINs by hand in an hour) while capping any one source's
// worst-case share of the shared pool to ~11% of it.
export const isHourlyRateLimited = createLimiter(60 * 60_000, 20);

// /portfolio: up to PORTFOLIO_MAX_EINS EINs per submission (10, was 50
// — see lib/ein-list.ts), ~4 FAC calls each, so a single submission can
// still cost a meaningful chunk of the single-org limiter's budget.
// Budgeted far tighter regardless of the cap size: a real grants
// manager checking a portfolio a few times an hour is nowhere near
// this; a script wouldn't get past the first handful of submissions.
export const isPortfolioRateLimited = createLimiter(15 * 60_000, 3);

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
