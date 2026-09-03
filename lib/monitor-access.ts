import 'server-only';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { monitorAccess } from '@/lib/db/schema';

/**
 * Whether this email may use continuous monitoring right now — an
 * unexpired row in the hand-managed `monitor_access` allowlist (see
 * scripts/grant-monitor-access.mjs). During founding-customer validation
 * this is the paywall; the monitor job applies the same check.
 */
export async function hasActiveMonitorAccess(email: string | null | undefined): Promise<boolean> {
  if (!email) return false;
  const [row] = await db
    .select({ expiresAt: monitorAccess.expiresAt })
    .from(monitorAccess)
    .where(eq(monitorAccess.email, email.trim().toLowerCase()))
    .limit(1);
  return !!row && row.expiresAt.getTime() > Date.now();
}
