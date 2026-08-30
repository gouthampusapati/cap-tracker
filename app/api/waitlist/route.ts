import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { foundingSignups } from '@/lib/db/schema';
import { sendOwnerNotification } from '@/lib/send-owner-notification';

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
//
// 'generate-draft-cta' is a different situation, not an exception to
// that rule: it's not gatekeeping entry into the product (the visitor
// is already a signed-in/guest recipient inside their own dashboard),
// it's capturing demand for one specific feature that doesn't exist yet
// (AI-drafted CAP narratives — see app/dashboard/page.tsx's "Generate
// Draft" button) from someone who already has full product access.
const VALID_SOURCES = ['homepage-cta-band', 'generate-draft-cta', 'pricing-page'] as const;

// recipient vs. pass-through vs. adviser/auditor is the question the
// whole product strategy hangs on, and the founding form is the one
// moment a visitor is motivated to answer it — see app/waitlist-form.tsx.
// An unsegmented email list tells you nothing; this is what makes the
// signal usable.
const VALID_SEGMENTS = ['recipient', 'passthrough', 'adviser', 'other'] as const;

// Founding-customer qualifying answers — only the pricing-page form
// (qualifying) sends these; the homepage band omits them and they stay
// null. Kept in sync with app/waitlist-form.tsx. There is deliberately
// no willingness-to-pay field: that comes from the sales conversation.
const VALID_INTEREST = ['pay-now', 'after-demo', 'test-first', 'free-only'] as const;
const VALID_ORG_COUNT = ['1-5', '6-25', '26-100', '101-500', '500+'] as const;
const VALID_METHOD = [
  'spreadsheet',
  'manual-fac',
  'internal-system',
  'email-calendar',
  'audit-software',
  'none',
  'other',
] as const;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  let body: {
    email?: unknown;
    source?: unknown;
    ein?: unknown;
    segment?: unknown;
    organization?: unknown;
    interest?: unknown;
    orgCount?: unknown;
    method?: unknown;
    referrer?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const source = typeof body.source === 'string' ? body.source : '';
  const ein = typeof body.ein === 'string' && /^\d{9}$/.test(body.ein) ? body.ein : null;
  const segment = typeof body.segment === 'string' ? body.segment : '';
  // Optional free-text org name — trimmed and length-capped, no
  // allowlist (it's a name). Stored for follow-up, never used to gate.
  const organization =
    typeof body.organization === 'string' && body.organization.trim()
      ? body.organization.trim().slice(0, 200)
      : null;
  // Optional founding qualifiers — accept only allowlisted values, drop
  // anything else to null rather than reject the whole signup over an
  // optional field.
  const interest =
    typeof body.interest === 'string' &&
    VALID_INTEREST.includes(body.interest as (typeof VALID_INTEREST)[number])
      ? body.interest
      : null;
  const orgCount =
    typeof body.orgCount === 'string' &&
    VALID_ORG_COUNT.includes(body.orgCount as (typeof VALID_ORG_COUNT)[number])
      ? body.orgCount
      : null;
  const method =
    typeof body.method === 'string' &&
    VALID_METHOD.includes(body.method as (typeof VALID_METHOD)[number])
      ? body.method
      : null;
  // Free qualitative signal for the owner notification only — not
  // validated against an allowlist like the fields above, since it's
  // never stored or used to make a decision, just reported. See
  // lib/send-owner-notification.ts.
  const referrer = typeof body.referrer === 'string' && body.referrer ? body.referrer : null;

  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 });
  }

  if (!VALID_SOURCES.includes(source as (typeof VALID_SOURCES)[number])) {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  if (!VALID_SEGMENTS.includes(segment as (typeof VALID_SEGMENTS)[number])) {
    return NextResponse.json({ error: 'Please choose which describes you.' }, { status: 400 });
  }

  try {
    await db.insert(foundingSignups).values({
      id: crypto.randomUUID(),
      email,
      source,
      ein,
      segment,
      organization,
      interestLevel: interest,
      orgCount,
      currentMethod: method,
      createdAt: new Date(),
    });
  } catch (error) {
    console.error('Waitlist signup failed:', error);
    return NextResponse.json({ error: 'Could not save your signup. Try again.' }, { status: 500 });
  }

  // Best-effort only, strictly after the signup is already saved — a
  // failure here must never turn into a failed response, since losing a
  // notification is recoverable and losing a signup is not.
  try {
    await sendOwnerNotification({
      email,
      segment,
      source,
      ein,
      referrer,
      organization,
      interest,
      orgCount,
      method,
    });
  } catch (error) {
    console.error('Owner notification failed (signup already saved):', error);
  }

  return NextResponse.json({ ok: true });
}
