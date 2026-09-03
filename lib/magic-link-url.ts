/**
 * Magic-link URL rewriting for the sign-in email.
 *
 * Auth.js hands `sendVerificationRequest` a direct callback link
 * (`<origin>/api/auth/callback/email?token=…&email=…&callbackUrl=…`). A
 * plain GET on that link redeems the one-time token — and email security
 * scanners (Microsoft Safe Links, Mimecast, Proofpoint, Gmail link
 * preview, AV proxies) issue that GET automatically, before the human
 * clicks, which is what produces `error=Verification`.
 *
 * The fix: email a link to the /auth/confirm interstitial with the
 * callback params in the URL *fragment*. A fragment is never sent to a
 * server, so a scanner's GET carries nothing and redeems nothing; only a
 * real browser running the confirm page's JS can read it back and only
 * the user's click completes sign-in. Pure functions, kept out of
 * auth.ts (which isn't unit-testable) so the round-trip can be verified.
 */

/** The email-provider callback path — `provider.id` is 'email' (auth.ts). */
export const EMAIL_CALLBACK_PATH = '/api/auth/callback/email';

/** Auth.js callback URL -> link to the confirmation interstitial. */
export function toConfirmUrl(callbackUrl: string): string {
  const parsed = new URL(callbackUrl);
  return `${parsed.origin}/auth/confirm#${parsed.searchParams.toString()}`;
}

/** The confirm page's fragment (token/email/callbackUrl, no leading '#')
 * -> the real Auth.js callback URL to navigate to. */
export function callbackUrlFromFragment(fragment: string): string {
  const params = fragment.replace(/^#/, '');
  return `${EMAIL_CALLBACK_PATH}?${params}`;
}
