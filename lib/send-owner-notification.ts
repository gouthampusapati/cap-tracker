import 'server-only';
import { Resend } from 'resend';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { waitlistSignups } from '@/lib/db/schema';

/**
 * Owner-facing notification on every early-access signup — see
 * REVISED_FINAL_PASS.md Task 5 and
 * /Users/Bunnu/.claude/plans/merry-enchanting-kay.md. Deliberately NOT
 * an auto-reply to the visitor who signed up — that was explicitly
 * declined (see app/waitlist-form.tsx's doc comment); this only tells
 * the site owner a signup happened.
 *
 * Safe no-op by design: RESEND_API_KEY and WAITLIST_NOTIFY_EMAIL aren't
 * set anywhere yet (no Resend account exists), so this logs a warning
 * and returns rather than throwing — signups must keep working before
 * and after this is actually configured. See .env.example.
 *
 * Called from app/api/waitlist/route.ts strictly AFTER the DB insert
 * succeeds, and its own caller swallows any error — losing a
 * notification is recoverable, losing a signup is not.
 */
export async function sendOwnerNotification(signup: {
  email: string;
  segment: string;
  source: string;
  ein: string | null;
  referrer: string | null;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const notifyEmail = process.env.WAITLIST_NOTIFY_EMAIL;

  if (!apiKey || !notifyEmail) {
    console.warn(
      'sendOwnerNotification: RESEND_API_KEY or WAITLIST_NOTIFY_EMAIL not set — skipping (signup itself already saved).'
    );
    return;
  }

  // Running count is cheap (single indexed-by-nothing COUNT on a small
  // table) and gives the owner a sense of pace, not just a one-off ping.
  // If this fails for any reason, still send the notification without it
  // rather than losing the whole email over an optional detail.
  let totalSignups: number | null = null;
  try {
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(waitlistSignups);
    totalSignups = count;
  } catch (error) {
    console.error('sendOwnerNotification: signup count query failed:', error);
  }

  // dateStyle/timeStyle combined with timeZoneName throws
  // "Invalid option : option" in Node's ICU here (caught live in
  // testing) — timeZoneName isn't actually needed since the zone is
  // fixed and named explicitly below.
  const timestamp = `${new Date().toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/New_York',
  })} ET`;

  const lines = [
    `Role: ${signup.segment}`,
    `Email: ${signup.email}`,
    `Time: ${timestamp}`,
    `Source: ${signup.source}${signup.ein ? ` (EIN ${signup.ein})` : ''}`,
    `Referrer: ${signup.referrer || '(direct / none)'}`,
  ];
  if (totalSignups !== null) {
    lines.push(`Total signups: ${totalSignups}`);
  }

  const resend = new Resend(apiKey);
  const fromAddress = process.env.RESEND_FROM_EMAIL || 'Single Audit Intelligence <onboarding@resend.dev>';

  try {
    await resend.emails.send({
      from: fromAddress,
      to: notifyEmail,
      subject: `New early-access signup: ${signup.segment}`,
      text: lines.join('\n'),
    });
  } catch (error) {
    // Caller already treats this whole function as best-effort, but log
    // here too so the specific send failure (vs. a missing key) is
    // visible in server logs.
    console.error('sendOwnerNotification: Resend send failed:', error);
  }
}
