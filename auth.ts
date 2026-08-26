import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import { DrizzleAdapter } from '@auth/drizzle-adapter';
import { db } from '@/lib/db';
import { users, accounts } from '@/lib/db/schema';

/**
 * Auth.js v5 config, deliberately at the repo root (not lib/) — this is
 * Auth.js's own convention so route handlers and, in principle,
 * middleware.ts can `import { auth } from './auth'` without a deep path.
 * middleware.ts doesn't actually use this (see its own comment on why
 * auth checks live in route handlers instead), but app/api/auth/[...nextauth]/route.ts
 * and lib/auth-guard.ts both do.
 *
 * DrizzleAdapter points at this app's own `users`/`accounts` tables
 * (lib/db/schema.ts) rather than Auth.js's usual dedicated tables — a
 * Google sign-in becomes the *same* users row the rest of the app
 * already keys everything on by email, not a shadow identity system. No
 * sessionsTable/verificationTokensTable passed: sessions use the JWT
 * strategy below (no DB session row), and there's no email/magic-link
 * provider configured (see lib/auth.ts's now-superseded magic-link code).
 *
 * `secret` reuses NEXTAUTH_SECRET rather than Auth.js v5's newer
 * AUTH_SECRET name — that var was already stubbed in .env.example and
 * read by test/setup.ts before this feature existed, so this avoids
 * introducing a second name for the same thing.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
  }),
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],
  session: { strategy: 'jwt' },
  secret: process.env.NEXTAUTH_SECRET,
});
