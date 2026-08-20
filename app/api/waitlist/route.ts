import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { waitlistSignups } from '@/lib/db/schema';

/**
 * Public endpoint backing the one CTA that's genuinely just capturing
 * general interest (see the UI/branding overhaul plan, Phase 1.5).
 * Collects an email + which CTA it came from, nothing else — no
 * account, no session, no redirect.
 *
 * Rate-limited per IP in middleware.ts (lib/rate-limit.ts's
 * isWaitlistRateLimited) — this doesn't touch FAC, so the limit here is
 * just anti-spam, not quota protection.
 */

// Kept in sync with every <WaitlistForm source="..."> call site — reject
// anything else rather than let arbitrary strings into the source column.
// Every CTA that could plausibly identify a real recipient or
// pass-through org (org page's "Are you this organization?", homepage's
// "For Recipients"/"For Pass-Throughs") deliberately does NOT use this —
// those route straight into sign-in or /portfolio, since getting a real
// early user into the actual product for feedback matters more than
// filtering for "qualified" intent. See app/single-audit/[ein]/page.tsx
// and app/page.tsx.
const VALID_SOURCES = ['homepage-cta-band'] as const;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  let body: { email?: unknown; source?: unknown; ein?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const source = typeof body.source === 'string' ? body.source : '';
  const ein = typeof body.ein === 'string' && /^\d{9}$/.test(body.ein) ? body.ein : null;

  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 });
  }

  if (!VALID_SOURCES.includes(source as (typeof VALID_SOURCES)[number])) {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  try {
    await db.insert(waitlistSignups).values({
      id: crypto.randomUUID(),
      email,
      source,
      ein,
      createdAt: new Date(),
    });
  } catch (error) {
    console.error('Waitlist signup failed:', error);
    return NextResponse.json({ error: 'Could not save your signup. Try again.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
