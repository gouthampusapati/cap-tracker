'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { signOut, useSession } from 'next-auth/react';
import { getUser, isGuestUser, onIdentityChanged } from '@/lib/auth-config';

/**
 * Sticky site-wide header — stays visible while scrolling, mounted once
 * in app/layout.tsx rather than per-page. Replaces: the homepage's old
 * non-sticky inline header, and the bespoke <nav> each of
 * app/dashboard/page.tsx and app/dashboard/next-cycle-prep/page.tsx used
 * to render for itself. Modeled on talkory.ai's header (persistent
 * Sign in / Get Started, always reachable) per direct user request —
 * previously "Sign in" was deliberately NOT in primary nav (see the
 * removed comment this replaced in app/page.tsx); that decision is
 * intentionally reversed here.
 *
 * The logo always links to "/" on every page, including from inside the
 * dashboard — also a direct user request, and why next-cycle-prep's old
 * "logo → /dashboard, then › Next-Cycle Prep" breadcrumb pattern is now
 * just "logo → /, then › Next-Cycle Prep" via the `breadcrumb` prop.
 *
 * Three-way auth state, in priority order (matches the logic
 * app/dashboard/page.tsx used to render inline):
 * 1. Real Google session → name/email + Sign Out.
 * 2. No session, but a guest identity already exists in localStorage
 *    (created by getOrCreateUser on a prior /dashboard visit) → a
 *    specific "save your workspace" prompt, more useful to an active
 *    guest than generic marketing copy.
 * 3. Neither → plain "Sign in" + "Get Started", both going to
 *    /auth/signin (which itself offers Google sign-in with "continue as
 *    guest" one click away) — not straight into a guest workspace,
 *    since the whole point of this header is making sign-in visible
 *    rather than bypassed by default.
 *
 * /auth/signin and /auth/verify-request both get a stripped-down
 * version (logo only, no nav, no CTA buttons) — showing "Sign in"/"Get
 * Started" atop the sign-in form, or above a "check your email, you're
 * mid-sign-in" page, would be circular either way.
 *
 * This is mounted once in app/layout.tsx with no props (a page can't
 * hand props to something in its own layout), so a per-page breadcrumb
 * — currently only next-cycle-prep wants one — is looked up by pathname
 * here rather than passed in. Fine for the one page that needs it; if
 * more pages want breadcrumbs later, revisit with a context instead of
 * growing this map.
 */
const BREADCRUMBS: Record<string, string> = {
  '/dashboard/next-cycle-prep': 'Next-Cycle Prep',
};

export function Header() {
  const pathname = usePathname();
  const breadcrumb = BREADCRUMBS[pathname];
  const { data: session, status } = useSession();
  const [guestEmail, setGuestEmail] = useState<string | null>(null);

  // Plain localStorage read (getUser), not getOrCreateUser — the header
  // should reflect whatever identity already exists, not create a guest
  // one just by rendering on a marketing page that never called
  // getOrCreateUser itself. Re-checks on navigation (pathname) AND on
  // the identity-changed event — a page that calls getOrCreateUser()
  // (i.e. app/dashboard/page.tsx) creates the guest identity in its own
  // effect, which can run after this one; without the event subscription
  // this would keep showing the signed-out state until the next
  // navigation instead of picking up the just-created guest identity.
  useEffect(() => {
    setGuestEmail(getUser());
    return onIdentityChanged(() => setGuestEmail(getUser()));
  }, [pathname]);

  const isSignInPage = pathname === '/auth/signin' || pathname === '/auth/verify-request';

  return (
    <header className="sticky top-0 z-50 h-16 bg-surface/95 backdrop-blur border-b border-border">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 h-full flex items-center justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <Link href="/" className="flex items-center gap-2 font-bold text-text shrink-0">
            <img src="/brand/logo-mark.png" alt="" className="h-6 w-6" />
            <span className="hidden sm:inline">Single Audit Intelligence</span>
          </Link>
          {breadcrumb && (
            <span className="flex items-center gap-2 min-w-0 text-sm text-muted">
              <span aria-hidden="true">›</span>
              <span className="font-semibold text-text truncate">{breadcrumb}</span>
            </span>
          )}
          {!isSignInPage && (
            <nav className="hidden md:flex items-center gap-4 ml-2">
              <Link href="/guide" className="text-sm text-accent hover:text-blue-800 font-semibold">
                Guide
              </Link>
              <Link href="/portfolio" className="text-sm text-accent hover:text-blue-800 font-semibold">
                Portfolio
              </Link>
              <Link href="/auditors" className="text-sm text-accent hover:text-blue-800 font-semibold">
                Auditors
              </Link>
            </nav>
          )}
        </div>

        {!isSignInPage && (
          <div className="flex items-center gap-3 shrink-0">
            {status === 'loading' ? null : session ? (
              <>
                <span className="hidden sm:inline text-sm text-muted truncate max-w-[14rem]">
                  {session.user?.name || session.user?.email}
                </span>
                <button
                  onClick={() => signOut({ callbackUrl: '/auth/signin' })}
                  className="text-sm text-muted hover:text-text"
                >
                  Sign Out
                </button>
              </>
            ) : guestEmail && isGuestUser(guestEmail) ? (
              <Link href="/auth/signin" className="text-sm text-accent hover:underline font-semibold">
                Sign in with Google to save your workspace
              </Link>
            ) : (
              <>
                <Link href="/auth/signin" className="text-sm font-semibold text-text hover:text-accent">
                  Sign in
                </Link>
                <Link
                  href="/auth/signin"
                  className="bg-accent hover:bg-blue-800 text-white text-sm font-semibold px-4 py-2 rounded-md"
                >
                  Get Started
                </Link>
              </>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
