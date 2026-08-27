import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import { DrizzleAdapter } from '@auth/drizzle-adapter';
import { db } from '@/lib/db';
import { users, accounts, verificationTokens } from '@/lib/db/schema';
import { sendMagicLinkEmail } from '@/lib/send-magic-link-email';

/**
 * Auth.js v5 config, deliberately at the repo root (not lib/) — this is
 * Auth.js's own convention so route handlers and, in principle,
 * middleware.ts can `import { auth } from './auth'` without a deep path.
 * middleware.ts doesn't actually use this (see its own comment on why
 * auth checks live in route handlers instead), but app/api/auth/[...nextauth]/route.ts
 * and lib/auth-guard.ts both do.
 *
 * DrizzleAdapter points at this app's own `users`/`accounts`/
 * `verification_tokens` tables (lib/db/schema.ts) rather than Auth.js's
 * usual dedicated tables — a Google or magic-link sign-in becomes the
 * *same* users row the rest of the app already keys everything on by
 * email, not a shadow identity system. No sessionsTable passed: sessions
 * use the JWT strategy below (no DB session row).
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
    verificationTokensTable: verificationTokens,
  }),
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      // Without this, Auth.js refuses to link a Google sign-in to an
      // existing `users` row with the same email (OAuthAccountNotLinked)
      // — its default anti-account-takeover guard for when you can't
      // trust the provider's email claim. Safe to override here
      // specifically because Google verifies email ownership itself
      // before handing it to us. This matters a lot for this app: most
      // real accounts already have a users row from guest/typed-email
      // use before ever touching Google sign-in (see lib/auth-config.ts),
      // so refusing to link is the common case, not an edge case —
      // confirmed live: a sign-in against a pre-existing email silently
      // failed to create an accounts row until this was added.
      allowDangerousEmailAccountLinking: true,
    }),
    // Passwordless magic-link sign-in — the non-Google option, chosen
    // over email+password specifically to avoid taking on password
    // security surface (hashing, reset flow, brute-force defense) this
    // app doesn't need. Hand-authored object, not the Email()/
    // Nodemailer() provider factories from next-auth/providers/* — those
    // require an SMTP `server` config (they throw without one; see
    // node_modules/@auth/core/providers/nodemailer.js) and this app
    // sends via Resend's HTTP API instead, already the established
    // pattern (lib/send-owner-notification.ts). The EmailConfig type
    // these factories build doesn't actually require `server` — it's
    // documented as SMTP-specific and optional — so a plain object
    // matching that shape works without going through either factory,
    // and without adding nodemailer as a dependency at all.
    {
      id: 'email',
      type: 'email',
      name: 'Email',
      from: process.env.RESEND_FROM_EMAIL || 'Single Audit Intelligence <onboarding@resend.dev>',
      // 30 minutes, not the old dead code's arbitrary 24h — standard
      // practice for a link that arrives by email, shorter interception
      // window.
      maxAge: 30 * 60,
      async sendVerificationRequest({ identifier, url }) {
        await sendMagicLinkEmail({ email: identifier, url });
      },
    },
  ],
  session: { strategy: 'jwt' },
  secret: process.env.NEXTAUTH_SECRET,
  pages: {
    // Auth.js's own default verify-request page is unstyled/generic —
    // this points it at a custom page matching the rest of the site
    // instead (app/auth/verify-request/page.tsx).
    verifyRequest: '/auth/verify-request',
  },
});
