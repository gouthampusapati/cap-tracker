'use client';

import { useEffect } from 'react';
import Link from 'next/link';

/**
 * Route-segment error boundary — catches fetch failures from
 * fetchOrgData() in page.tsx (a FAC outage, rate limit, or network
 * error), which are deliberately NOT converted to notFound() there
 * anymore. The distinction matters: "not found" tells a visitor this
 * EIN has no audit history, which may not be true at all — the honest
 * answer here is "we couldn't check right now."
 */
export default function SingleAuditError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Org page fetch failed:', error);
  }, [error]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white border border-gray-200 rounded-lg p-8 text-center">
        <h1 className="text-xl font-bold text-gray-900 mb-3">Temporarily unavailable</h1>
        <p className="text-gray-600 mb-6">
          We couldn't load this organization's data right now — the Federal Audit Clearinghouse
          may be rate-limited or briefly unavailable. This doesn't mean the organization has no
          audit history, only that we couldn't check just now.
        </p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={reset}
            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-5 py-2.5 rounded-lg"
          >
            Try again
          </button>
          <Link
            href="/"
            className="border border-gray-300 hover:bg-gray-50 text-gray-700 font-semibold px-5 py-2.5 rounded-lg"
          >
            Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}
