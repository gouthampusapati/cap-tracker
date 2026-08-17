import crypto from 'crypto';
import { db } from './db';
import { users, magicLinkTokens } from './db/schema';
import { eq } from 'drizzle-orm';

export function generateMagicToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export async function createMagicLinkToken(email: string): Promise<string> {
  const token = generateMagicToken();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  await db.insert(magicLinkTokens).values({
    id: crypto.randomUUID(),
    email,
    token,
    expiresAt,
    usedAt: null,
  });

  return token;
}

export async function verifyMagicLinkToken(token: string): Promise<string | null> {
  const result = await db
    .select()
    .from(magicLinkTokens)
    .where(eq(magicLinkTokens.token, token))
    .limit(1);

  if (!result.length) return null;

  const record = result[0];
  const now = new Date();

  if (record.expiresAt < now || record.usedAt) {
    return null;
  }

  await db
    .update(magicLinkTokens)
    .set({ usedAt: now })
    .where(eq(magicLinkTokens.token, token));

  return record.email;
}

export async function getOrCreateUser(email: string): Promise<string> {
  const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);

  if (existing.length) {
    await db
      .update(users)
      .set({ lastLogin: new Date() })
      .where(eq(users.email, email));
    return existing[0].id;
  }

  const userId = crypto.randomUUID();
  await db.insert(users).values({
    id: userId,
    email,
    createdAt: new Date(),
  });

  return userId;
}

export async function getUser(userId: string) {
  const result = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return result[0] || null;
}
