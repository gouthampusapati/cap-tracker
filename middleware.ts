import { NextRequest, NextResponse } from 'next/server';
import { isRateLimited, isPortfolioRateLimited, isWaitlistRateLimited } from '@/lib/rate-limit';

/**
 * Rate-limits: (1) the public surfaces that each cost calls against the
 * shared FAC API quota — single-org lookups (the org page itself — the
 * thing a crawler would actually hit at scale — and the public JSON
 * endpoint kept for external consumers) and portfolio submissions, which
 * cost up to ~50x a single lookup per request and get a much tighter
 * budget; and (2) /api/waitlist, which doesn't touch FAC at all but is a
 * public POST endpoint that can still be spammed. Everything else —
 * /dashboard, /auth, /api/cap-items, /api/findings, /api/import, the
 * plain /api/org lookup-by-email route — is untouched; see the matcher
 * below.
 */
export function middleware(req: NextRequest) {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown';

  // TEMPORARY diagnostic: identify what's been discovering a new EIN on
  // /single-audit/[ein] every ~5s (see 05d0c7f / the 86.6% error-rate
  // investigation) — Vercel's log stream doesn't include request headers
  // by default, so there was no way to see the User-Agent any other way.
  // Remove once the source is confirmed (matters concretely: Googlebot
  // ignores the Crawl-delay just added to robots.ts, so if it's
  // Googlebot we need Search Console instead, not a robots.txt change).
  if (req.nextUrl.pathname.startsWith('/single-audit/')) {
    console.log(
      `[crawler-diagnostic] ${ip} UA="${req.headers.get('user-agent') || 'none'}" ${req.nextUrl.pathname}`
    );
  }

  if (req.nextUrl.pathname === '/api/waitlist') {
    if (isWaitlistRateLimited(ip)) {
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

  const limited = isPortfolioSubmission ? isPortfolioRateLimited(ip) : isRateLimited(ip);

  if (limited) {
    return NextResponse.json(
      {
        error: isPortfolioSubmission
          ? 'Too many portfolio lookups. Try again in a few minutes.'
          : 'Too many requests. Try again in a minute.',
      },
      { status: 429, headers: { 'Retry-After': isPortfolioSubmission ? '900' : '60' } }
    );
  }

  return NextResponse.next();
}

export const config = {
  // :path+ requires at least one segment after /api/org/, so the
  // authenticated /api/org (no EIN — lookup by signed-in user's email)
  // route is not matched here.
  matcher: ['/single-audit/:path*', '/api/org/:path+', '/portfolio', '/api/waitlist'],
};
