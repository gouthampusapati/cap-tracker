import 'server-only';
import { Resend } from 'resend';

/**
 * Sends the actual magic-link sign-in email — called from root auth.ts's
 * Email-provider `sendVerificationRequest`. Mirrors
 * lib/send-owner-notification.ts's Resend usage pattern (same
 * `RESEND_API_KEY`/`RESEND_FROM_EMAIL` env vars, same fallback sender),
 * with one deliberate difference: that function no-ops safely on a
 * missing key because the thing it's notifying about (a waitlist signup)
 * already succeeded regardless. This one can't — if this throws, the
 * whole sign-in attempt has no other way to reach the visitor, so a
 * missing key or a failed send both throw here rather than swallow,
 * matching the contract Auth.js's own built-in Nodemailer provider uses
 * (it throws on send failure too — see node_modules/@auth/core/providers/nodemailer.js).
 *
 * Important: resend's SDK does NOT throw on an API-level failure (bad
 * `from` domain, rate limit, etc.) — `resend.emails.send()` resolves
 * successfully with `{ data: null, error }` instead (confirmed by
 * reading node_modules/resend/dist/index.cjs's `fetchRequest`, and by
 * this actually happening live in testing: an unverified-domain
 * rejection logged via Resend's own internal logger but didn't throw,
 * so a plain try/catch around the call never caught it and the sign-in
 * flow "succeeded" with no email ever sent). The `error` field on the
 * resolved result has to be checked explicitly and thrown ourselves.
 */
export async function sendMagicLinkEmail({ email, url }: { email: string; url: string }): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error(
      'sendMagicLinkEmail: RESEND_API_KEY is not configured — magic-link sign-in cannot send email. Set it in .env.local (see .env.example) or use Google sign-in instead.'
    );
  }

  const resend = new Resend(apiKey);
  const fromAddress = process.env.RESEND_FROM_EMAIL || 'Single Audit Intelligence <onboarding@resend.dev>';

  let result;
  try {
    result = await resend.emails.send({
      from: fromAddress,
      to: email,
      subject: 'Sign in to Single Audit Intelligence',
      // The link opens a confirmation page (auth.ts sendVerificationRequest)
      // and needs one more click there to finish — that extra click is
      // deliberate: it's what an email link scanner won't do, so the
      // one-time token survives to reach you.
      text:
        `Open this link, then click "Finish signing in":\n\n${url}\n\n` +
        `The link opens a page that asks you to confirm — that second click is expected.\n\n` +
        `If you didn't request this, you can safely ignore this email.`,
      html:
        `<p style="margin:0 0 16px">Click to sign in, then confirm on the next page:</p>` +
        `<p style="margin:0 0 16px">` +
        `<a href="${url}" style="display:inline-block;background:#2563eb;color:#fff;font-weight:600;` +
        `text-decoration:none;padding:10px 20px;border-radius:6px">Sign in to Single Audit Intelligence</a>` +
        `</p>` +
        `<p style="color:#6b6b68;font-size:13px;margin:0 0 4px">` +
        `The link opens a page that asks you to confirm — that second click is expected.</p>` +
        `<p style="color:#6b6b68;font-size:13px;margin:0">` +
        `If you didn't request this, you can safely ignore this email.</p>`,
    });
  } catch (error) {
    // Belt-and-suspenders — a network-level failure (fetch itself
    // rejecting) does throw, unlike an API-level error response. See the
    // comment above: this is the less common path in practice.
    console.error('sendMagicLinkEmail: Resend send threw:', error);
    throw error;
  }

  if (result.error) {
    console.error('sendMagicLinkEmail: Resend returned an error:', result.error);
    throw new Error(`sendMagicLinkEmail: ${result.error.message || 'Resend send failed'}`);
  }
}
