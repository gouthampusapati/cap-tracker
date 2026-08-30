import 'server-only';
import { Resend } from 'resend';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { foundingSignups } from '@/lib/db/schema';

/**
 * Owner-facing notification on every Founding Customer signup.
 * Deliberately NOT an auto-reply to the visitor who signed up — that
 * was explicitly declined (see app/waitlist-form.tsx's doc comment);
 * this only tells the site owner a signup happened.
 *
 * Safe no-op by design: if RESEND_API_KEY or WAITLIST_NOTIFY_EMAIL is
 * unset (e.g. local dev, or CI) this logs a warning and returns rather
 * than throwing — signups must keep working whether or not email is
 * configured. Both are set in Vercel prod. See .env.example.
 *
 * Called from app/api/waitlist/route.ts strictly AFTER the DB insert
 * succeeds, and its own caller swallows any error — losing a
 * notification is recoverable, losing a signup is not.
 */
// Human-readable labels for the founding qualifiers — the raw slugs
// ('pay-now') read badly in an email. Keys match VALID_* in
// app/api/waitlist/route.ts.
const INTEREST_LABELS: Record<string, string> = {
  'pay-now': 'Would pay now',
  'after-demo': 'Would consider after a demo',
  'test-first': 'Wants to test first',
  'free-only': 'Only wants the free tools',
};
const METHOD_LABELS: Record<string, string> = {
  spreadsheet: 'Spreadsheet',
  'manual-fac': 'Manual FAC searches',
  'internal-system': 'Internal system',
  'email-calendar': 'Email / calendar reminders',
  'audit-software': 'Audit / compliance software',
  none: "Doesn't currently monitor",
  other: 'Other',
};

export async function sendOwnerNotification(signup: {
  email: string;
  segment: string;
  source: string;
  ein: string | null;
  referrer: string | null;
  organization?: string | null;
  interest?: string | null;
  orgCount?: string | null;
  method?: string | null;
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
      .from(foundingSignups);
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
    ...(signup.organization ? [`Organization: ${signup.organization}`] : []),
    `Time: ${timestamp}`,
    `Source: ${signup.source}${signup.ein ? ` (EIN ${signup.ein})` : ''}`,
    `Referrer: ${signup.referrer || '(direct / none)'}`,
  ];
  if (signup.interest) {
    lines.push(`Interest: ${INTEREST_LABELS[signup.interest] ?? signup.interest}`);
  }
  if (signup.orgCount) {
    lines.push(`Orgs to monitor: ${signup.orgCount}`);
  }
  if (signup.method) {
    lines.push(`Current method: ${METHOD_LABELS[signup.method] ?? signup.method}`);
  }
  if (totalSignups !== null) {
    lines.push(`Total signups: ${totalSignups}`);
  }

  // Lead the subject with the interest level when it's the strong
  // signal — "would pay now" is worth seeing without opening the email.
  const subjectTag = signup.interest
    ? INTEREST_LABELS[signup.interest] ?? signup.interest
    : signup.segment;

  const resend = new Resend(apiKey);
  const fromAddress = process.env.RESEND_FROM_EMAIL || 'Single Audit Intelligence <onboarding@resend.dev>';

  try {
    await resend.emails.send({
      from: fromAddress,
      to: notifyEmail,
      subject: `New founding-customer signup: ${subjectTag}`,
      text: lines.join('\n'),
    });
  } catch (error) {
    // Caller already treats this whole function as best-effort, but log
    // here too so the specific send failure (vs. a missing key) is
    // visible in server logs.
    console.error('sendOwnerNotification: Resend send failed:', error);
  }
}
