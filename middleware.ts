import { NextRequest, NextResponse } from 'next/server';
import { isRateLimited } from '@/lib/rate-limit';

/**
 * Rate-limits the two public surfaces that each cost a call against the
 * shared FAC API quota: the org page itself (the thing a crawler would
 * actually hit at scale) and the public JSON endpoint kept for external
 * consumers. Everything else — /dashboard, /auth, /api/cap-items,
 * /api/findings, /api/import, the plain /api/org lookup-by-email route —
 * is untouched; see the matcher below.
 */
export function middleware(req: NextRequest) {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown';

  if (isRateLimited(ip)) {
    return NextResponse.json(
      { error: 'Too many requests. Try again in a minute.' },
      { status: 429, headers: { 'Retry-After': '60' } }
    );
  }

  return NextResponse.next();
}

export const config = {
  // :path+ requires at least one segment after /api/org/, so the
  // authenticated /api/org (no EIN — lookup by signed-in user's email)
  // route is not matched here.
  matcher: ['/single-audit/:path*', '/api/org/:path+'],
};
