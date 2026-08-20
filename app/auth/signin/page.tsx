'use client';

import { FormEvent, Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { loginUser } from '@/lib/auth-config';

export default function SignIn() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50" />}>
      <SignInForm />
    </Suspense>
  );
}

function SignInForm() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  // Carries the EIN through from a public org page's "Are you this
  // organization?" / "Do you fund this organization?" CTA, so signing in
  // lands on that org already imported instead of a blank EIN field.
  const ein = searchParams.get('ein');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);

    // Simple login - just store email
    loginUser(email);
    router.push(ein ? `/dashboard?ein=${encodeURIComponent(ein)}` : '/dashboard');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white p-8 rounded-lg shadow-md w-96">
        <Link href="/" className="text-sm text-blue-600 hover:text-blue-800">
          ← Back to home
        </Link>
        {/* TODO(brand): swap for the logo mark once public/brand/logo-mark.svg lands (Phase 1.2) */}
        <h1 className="text-2xl font-bold mb-2 text-center mt-2">Single Audit Intelligence</h1>

        {ein && (
          <p className="text-sm text-blue-700 bg-blue-50 border border-blue-200 rounded p-2 mb-4 text-center">
            Signing in will import EIN {ein}&apos;s audit history automatically.
          </p>
        )}

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@organization.org"
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-2 rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <p className="text-xs text-gray-500 mt-4 text-center">
          MVP: No email validation. Enter any email to continue.
        </p>
      </div>
    </div>
  );
}
