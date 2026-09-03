import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import {
  isRateLimited,
  isHourlyRateLimited,
  isPortfolioRateLimited,
  isWaitlistRateLimited,
  isMagicLinkRateLimited,
} from '@/lib/rate-limit';

/**
 * Is there a valid Auth.js session on this request? Uses getToken (the
 * edge-safe JWT reader) rather than the full `auth()` from ../auth.ts —
 * that one pulls the Drizzle adapter + @libsql/client, which don't run
 * in the middleware runtime. Tries both cookie names (dev: bare,
 * prod/https: __Secure- prefixed) so it doesn't depend on protocol
 * detection behind Vercel's proxy. A missing NEXTAUTH_SECRET returns
 * true — a misconfigured deploy shouldn't lock every visitor out.
 */
async function hasSession(req: NextRequest): Promise<boolean> {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) return true;
  for (const secureCookie of [true, false]) {
    const token = await getToken({ req, secret, secureCookie }).catch(() => null);
    if (token) return true;
  }
  return false;
}

// The one HTML route gated behind sign-in: /single-audit/<ein>/risk-assessment.
// Its data (SEFA federal_awards + notes_to_sefa) is the only public
// dataset not in the local mirror, so every cold render is a live FAC
// fetch — and anonymous crawler traffic walking it kept lib/fac-budget.ts
// pinned (three separate incidents, Aug–Sep 2026) even with robots.txt
// Disallow + rel=nofollow, which crawlers ignore. Requiring a session
// removes the crawler vector entirely; real users (low volume) still get
// it, served from federal_awards_cache.
const RISK_ASSESSMENT_RE = /^\/single-audit\/\d{9}\/risk-assessment\/?$/;

/**
 * Rate-limits: (1) the FAC-costing JSON API surfaces — /api/org/[ein]
 * (the public JSON endpoint kept for external consumers) and /api/import
 * — plus portfolio submissions, which cost up to ~10x a single lookup
 * and get a much tighter budget; (2) /api/waitlist, which doesn't touch
 * FAC but is a public POST that can be spammed; and (3)
 * /api/auth/signin/email (magic-link requests — see auth.ts), each of
 * which costs a real email send. Everything else is untouched; see the
 * matcher.
 *
 * NOT here any more: the /single-audit HTML pages. Per-IP throttling
 * forces a route to be served uncached (middleware runs on every
 * request), and an edge-cached org page is worth far more than the
 * per-IP layer — which, post-mirror, barely fires (the sitemap's ~68K
 * org EINs are all served from the local mirror at 0 FAC cost). The org
 * page relies on the global lib/fac-budget.ts ceiling instead, a hard
 * cap on live FAC calls regardless of request volume or source.
 *
 * The API surfaces above still get BOTH isRateLimited (per-minute burst)
 * AND isHourlyRateLimited (per-hour sustained) — see isHourlyRateLimited
 * in lib/rate-limit.ts.
 */
export async function middleware(req: NextRequest) {
  if (RISK_ASSESSMENT_RE.test(req.nextUrl.pathname)) {
    if (await hasSession(req)) return NextResponse.next();
    const signin = new URL('/auth/signin', req.url);
    signin.searchParams.set('next', req.nextUrl.pathname + req.nextUrl.search);
    return NextResponse.redirect(signin);
  }

  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown';

  if (req.nextUrl.pathname === '/api/waitlist') {
    if (isWaitlistRateLimited(ip)) {
      return NextResponse.json(
        { error: 'Too many requests. Try again in a minute.' },
        { status: 429, headers: { 'Retry-After': '60' } }
      );
    }
    return NextResponse.next();
  }

  if (req.nextUrl.pathname === '/api/auth/signin/email') {
    if (isMagicLinkRateLimited(ip)) {
      return NextResponse.json(
        { error: 'Too many requests. Try again in a minute.' },
        { status: 429, headers: { 'Retry-After': '60' } }
      );
    }
    return NextResponse.next();
  }

  // Only an actual submission (?eins=...) costs FAC calls — visiting the
  // bare /portfolio form is free, so it isn't worth limiting and doing so
  // would make a shared link look broken after a few opens.
  const isPortfolioSubmission =
    req.nextUrl.pathname === '/portfolio' && req.nextUrl.searchParams.has('eins');

  if (isPortfolioSubmission) {
    if (isPortfolioRateLimited(ip)) {
      return NextResponse.json(
        { error: 'Too many portfolio lookups. Try again in a few minutes.' },
        { status: 429, headers: { 'Retry-After': '900' } }
      );
    }
    return NextResponse.next();
  }

  // The FAC-costing JSON API surfaces (/api/org/[ein], /api/import): both
  // limiters must pass. The org page itself is no longer here — see the
  // config.matcher note — so it's protected only by the global
  // lib/fac-budget.ts ceiling now.
  if (isRateLimited(ip) || isHourlyRateLimited(ip)) {
    return NextResponse.json(
      { error: 'Too many requests. Try again shortly.' },
      { status: 429, headers: { 'Retry-After': '60' } }
    );
  }

  return NextResponse.next();
}

export const config = {
  // Any path matched here runs through middleware on every request, which
  // makes Vercel serve it UNCACHED (middleware can rate-limit / rewrite,
  // so the edge can't reuse a response). Per-IP throttling and an
  // edge-cached page are mutually exclusive — so the HTML pages
  // (/single-audit, /single-audit/state/*, /single-audit/<ein>, and its
  // sub-routes) are all kept OUT of the matcher and rely on the shared,
  // global FAC-fetch budget (lib/fac-budget.ts) instead. That budget is
  // a hard ceiling on live FAC calls regardless of request volume, and
  // post-mirror the sitemap's ~68K org EINs are all served from the
  // local mirror at 0 FAC cost anyway, so the per-IP layer the org page
  // used to have was doing very little.
  //
  // The JSON API surfaces still cost FAC calls per hit and don't benefit
  // from page caching, so they keep the per-IP limiter. :path+ on
  // /api/org requires a segment, so the authenticated /api/org (lookup
  // by signed-in user's email) is not matched.
  matcher: [
    '/api/org/:path+',
    '/api/import',
    '/portfolio',
    '/api/waitlist',
    '/api/auth/signin/email',
    // Sign-in gate (see RISK_ASSESSMENT_RE). Matching this here does mean
    // Vercel serves it uncached, but that's fine now: federal_awards_cache
    // (Turso) carries the FAC-call cost, and post-gate the only traffic is
    // authenticated, so per-request render cost is a non-issue.
    '/single-audit/:ein/risk-assessment',
  ],
};
