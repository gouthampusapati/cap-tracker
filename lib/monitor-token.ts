import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Stateless unsubscribe token for the watchlist digest emails — an HMAC
 * of the user id under NEXTAUTH_SECRET. No DB row, no expiry: the only
 * thing it authorises is "stop emailing this user", which is safe to be
 * long-lived and idempotent.
 *
 * Keep in lockstep with unsubscribeToken() in
 * scripts/monitor-fac-changes.mjs (the job builds the same link).
 */
function sign(userId: string): string {
  return createHmac('sha256', process.env.NEXTAUTH_SECRET || 'dev-secret')
    .update(`monitor-unsub:${userId}`)
    .digest('base64url')
    .slice(0, 24);
}

export function monitorUnsubToken(userId: string): string {
  return sign(userId);
}

export function verifyMonitorUnsubToken(userId: string, token: string): boolean {
  if (!userId || !token) return false;
  const expected = sign(userId);
  if (token.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(token), Buffer.from(expected));
}
