'use client';

import { Suspense, useState } from 'react';
import { signIn } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

export default function SignIn() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50" />}>
      <SignInForm />
    </Suspense>
  );
}

function SignInForm() {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [emailLoading, setEmailLoading] = useState(false);
  const searchParams = useSearchParams();
  // Carries the EIN through from a public org page's "Are you this
  // organization?" / "Do you fund this organization?" CTA, so signing in
  // lands on that org already imported instead of a blank EIN field.
  const ein = searchParams.get('ein');
  const callbackUrl = ein ? `/dashboard?ein=${encodeURIComponent(ein)}` : '/dashboard';

  const handleGoogleSignIn = () => {
    setLoading(true);
    signIn('google', { callbackUrl });
  };

  const handleEmailSignIn = (e: React.FormEvent) => {
    e.preventDefault();
    setEmailLoading(true);
    // Default redirect:true — on success, Auth.js sends the link and
    // navigates to /auth/verify-request (pages.verifyRequest in
    // auth.ts); on failure (e.g. rate-limited, or RESEND_API_KEY unset
    // in a dev environment), it navigates to Auth.js's own error page.
    // No inline error handling here, matching how the Google button
    // above also doesn't handle errors itself — both hand off to
    // Auth.js's own redirect flow.
    signIn('email', { email, callbackUrl });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white p-8 rounded-lg shadow-md w-96">
        <Link href="/" className="text-sm text-blue-600 hover:text-blue-800">
          ← Back to home
        </Link>
        <h1 className="flex items-center justify-center gap-2 text-2xl font-bold mb-2 text-center mt-2">
          <img src="/brand/logo-mark.png" alt="" className="h-7 w-7" />
          Single Audit Intelligence
        </h1>

        {ein && (
          <p className="text-sm text-blue-700 bg-blue-50 border border-blue-200 rounded p-2 mb-4 text-center">
            Signing in will import EIN {ein}&apos;s audit history automatically.
          </p>
        )}

        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 bg-white border border-gray-300 text-gray-700 py-2 rounded-md hover:bg-gray-50 disabled:opacity-50"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="#4285F4"
              d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.47a5.53 5.53 0 0 1-2.4 3.63v3h3.87c2.27-2.09 3.58-5.17 3.58-8.82Z"
            />
            <path
              fill="#34A853"
              d="M12 24c3.24 0 5.96-1.07 7.94-2.91l-3.87-3c-1.08.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.27v3.11A11.998 11.998 0 0 0 12 24Z"
            />
            <path
              fill="#FBBC05"
              d="M5.27 14.28A7.2 7.2 0 0 1 4.89 12c0-.79.14-1.56.38-2.28V6.61H1.27A11.998 11.998 0 0 0 0 12c0 1.94.46 3.77 1.27 5.39l4-3.11Z"
            />
            <path
              fill="#EA4335"
              d="M12 4.75c1.76 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.69 1.27 6.61l4 3.11C6.22 6.86 8.87 4.75 12 4.75Z"
            />
          </svg>
          {loading ? 'Signing in…' : 'Sign in with Google'}
        </button>

        <div className="flex items-center gap-3 my-4">
          <div className="flex-1 h-px bg-gray-200" />
          <span className="text-xs text-gray-400">or</span>
          <div className="flex-1 h-px bg-gray-200" />
        </div>

        <form onSubmit={handleEmailSignIn}>
          <label htmlFor="magic-link-email" className="sr-only">
            Email
          </label>
          <input
            id="magic-link-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your@organization.org"
            // Explicit bg-white/text-gray-900 — see
            // app/waitlist-form.tsx for why (dark-mode browsers can
            // otherwise render a UA-default background that clashes
            // with forced/assumed text color).
            className="w-full px-3 py-2 border rounded-md bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 mb-2"
          />
          <button
            type="submit"
            disabled={emailLoading}
            className="w-full bg-gray-100 text-gray-800 font-semibold py-2 rounded-md hover:bg-gray-200 disabled:opacity-50"
          >
            {emailLoading ? 'Sending…' : 'Send magic link'}
          </button>
        </form>

        <p className="text-xs text-gray-500 mt-4 text-center">
          Don&apos;t want to sign in yet?{' '}
          <Link href="/dashboard" className="text-blue-600 hover:text-blue-800">
            Continue as a guest
          </Link>{' '}
          — a workspace is created automatically. You can sign in with Google later to make it
          portable across devices.
        </p>
      </div>
    </div>
  );
}
