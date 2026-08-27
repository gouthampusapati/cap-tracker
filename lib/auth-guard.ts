import 'server-only';
import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from './db';
import { users, accounts, findings, auditYears, capItems } from './db/schema';
import { auth } from '@/auth';

/**
 * Shared authorization guard for every route that reads/writes a user's
 * private data (org record, audit years, findings, CAP items). See
 * /Users/Bunnu/.claude/plans/staged-baking-lake.md for the full design
 * rationale — short version:
 *
 * Every one of these routes historically trusted a client-supplied email
 * (or an id that traces back to one) with zero server-side check. Guest
 * identities (lib/auth-config.ts's `guest-xxx@anonymous.local` strings)
 * are *meant* to work exactly that way — there's no password or provider
 * to verify against, so "whoever holds the string" is the whole
 * security model, by design, and that doesn't change here.
 *
 * The gap this closes is specifically for accounts that HAVE signed in
 * with Google (see ../auth.ts): once an account has a row in `accounts`,
 * anyone passing its email as a bare parameter should no longer get in —
 * only a session that actually matches should. A route can't just say
 * "no session cookie present → fall back to trusting the param", because
 * an attacker calling the API directly never has a session cookie either
 * — that fallback would silently undo the whole fix. So every check here
 * looks up whether the *target* identity is Google-linked before
 * deciding whether a session is required at all.
 */

type AuthResult = { email: string } | { response: NextResponse };
type EntityAuthResult = AuthResult | { notFound: true };

async function hasLinkedAccount(userId: string): Promise<boolean> {
  const rows = await db
    .select({ userId: accounts.userId })
    .from(accounts)
    .where(eq(accounts.userId, userId))
    .limit(1);
  return rows.length > 0;
}

function unauthorized(): NextResponse {
  return NextResponse.json(
    { error: 'This account is signed in with Google — sign in to access it.' },
    { status: 401 }
  );
}

async function checkOwnership(requestedEmail: string, ownerUserId: string | null): Promise<AuthResult> {
  if (!ownerUserId || !(await hasLinkedAccount(ownerUserId))) {
    // No users row yet, or a guest/typed-email row that's never signed
    // in with Google — unchanged, pre-existing trust model.
    return { email: requestedEmail };
  }

  const session = await auth();
  if (!session?.user?.email || session.user.email !== requestedEmail) {
    return { response: unauthorized() };
  }
  return { email: requestedEmail };
}

/**
 * Guard for routes that take an email directly — app/api/org (GET/DELETE
 * by ?email=) and app/api/import (POST body.email).
 */
export async function authorizeEmailAccess(requestedEmail: string): Promise<AuthResult> {
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, requestedEmail))
    .limit(1);

  return checkOwnership(requestedEmail, user?.id ?? null);
}

/**
 * Guard for routes keyed by findingId instead of an email —
 * app/api/findings (GET by ?email= actually — see that route, it already
 * has an email) and app/api/cap-items (GET/POST by findingId). Resolves
 * the owning account via findings → audit_years → users. Returns
 * `{ notFound: true }` when the finding doesn't exist at all, distinct
 * from "exists but you can't access it".
 */
export async function authorizeFindingAccess(findingId: string): Promise<EntityAuthResult> {
  const [row] = await db
    .select({ userId: auditYears.userId, email: users.email })
    .from(findings)
    .innerJoin(auditYears, eq(findings.auditYearId, auditYears.id))
    .innerJoin(users, eq(auditYears.userId, users.id))
    .where(eq(findings.id, findingId))
    .limit(1);

  if (!row) return { notFound: true };
  return checkOwnership(row.email, row.userId);
}

/**
 * Same as authorizeFindingAccess, one hop further — cap_items → findings
 * → audit_years → users. Used by app/api/cap-items/[id] (PATCH/DELETE by
 * cap item id).
 */
export async function authorizeCapItemAccess(capItemId: string): Promise<EntityAuthResult> {
  const [row] = await db
    .select({ userId: auditYears.userId, email: users.email })
    .from(capItems)
    .innerJoin(findings, eq(capItems.findingId, findings.id))
    .innerJoin(auditYears, eq(findings.auditYearId, auditYears.id))
    .innerJoin(users, eq(auditYears.userId, users.id))
    .where(eq(capItems.id, capItemId))
    .limit(1);

  if (!row) return { notFound: true };
  return checkOwnership(row.email, row.userId);
}
