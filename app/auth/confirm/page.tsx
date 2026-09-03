'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { callbackUrlFromFragment } from '@/lib/magic-link-url';

/**
 * Magic-link confirmation interstitial. The sign-in email points here
 * (see auth.ts's sendVerificationRequest) with the Auth.js callback
 * params — token, email, callbackUrl — in the URL *fragment* rather than
 * the query string.
 *
 * Why: a GET on the raw /api/auth/callback/email link consumes the
 * one-time token, and email security scanners (Microsoft Safe Links,
 * Mimecast, Proofpoint, Gmail link preview, AV proxies) issue that GET
 * automatically before the recipient clicks — the token is already gone
 * by the time the human does, giving error=Verification. A fragment is
 * never transmitted to a server and can't be replayed from logs, so a
 * scanner hitting this URL just renders an inert page. Only a real
 * browser that runs this component sees the fragment, and only the
 * user's click on the button below navigates to the actual callback.
 */
export default function ConfirmSignIn() {
  const [params, setParams] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    setParams(hash);
    try {
      setEmail(new URLSearchParams(hash).get('email'));
    } catch {
      /* leave email null */
    }
  }, []);

  const callbackHref = params ? callbackUrlFromFragment(params) : null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white p-8 rounded-lg shadow-md w-96 text-center">
        <Link href="/" className="text-sm text-blue-600 hover:text-blue-800">
          ← Back to home
        </Link>
        <h1 className="flex items-center justify-center gap-2 text-2xl font-bold mb-2 mt-2">
          <img src="/brand/logo-mark.png" alt="" className="h-7 w-7" />
          Single Audit Intelligence
        </h1>

        {callbackHref ? (
          <>
            <p className="text-lg font-semibold text-gray-900 mt-4">Finish signing in</p>
            <p className="text-sm text-gray-600 mt-2">
              {email ? (
                <>
                  You&apos;re signing in as <span className="font-semibold">{email}</span>.
                </>
              ) : (
                'Confirm to complete your sign-in.'
              )}
            </p>
            {/* A plain link, not an auto-redirect: the click is the whole
                point — it's what a scanner won't do. */}
            <a
              href={callbackHref}
              className="mt-5 inline-block w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold px-4 py-2.5 rounded-md"
            >
              Finish signing in
            </a>
            <p className="text-xs text-gray-500 mt-4">
              This link works once and expires shortly after it was sent.
            </p>
          </>
        ) : (
          <>
            <p className="text-lg font-semibold text-gray-900 mt-4">Open this from your email</p>
            <p className="text-sm text-gray-600 mt-2">
              This page only works when opened directly from the sign-in link we emailed you. If you
              got here another way, start again.
            </p>
            <Link
              href="/auth/signin"
              className="mt-5 inline-block w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold px-4 py-2.5 rounded-md"
            >
              Go to sign in
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
