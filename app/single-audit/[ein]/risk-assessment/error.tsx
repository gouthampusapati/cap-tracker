'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

/**
 * Route-segment error boundary for /single-audit/[ein]/risk-assessment.
 *
 * The award lines on this page are the one bit of data NOT in the local
 * mirror — they're fetched live from FAC. page.tsx throws
 * 'FEDERAL_AWARDS_UNAVAILABLE' when the shared FAC budget
 * (lib/fac-budget.ts) is momentarily spent, deliberately, so the
 * "couldn't load" state is never baked into the ISR cache. Everything
 * else (the org's audit history, findings, CAPs) is on the main org
 * page and unaffected.
 */
export default function RiskAssessmentError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const params = useParams<{ ein: string }>();

  useEffect(() => {
    if (error.message !== 'FEDERAL_AWARDS_UNAVAILABLE') {
      console.error('Risk-assessment page error:', error);
    }
  }, [error]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white border border-gray-200 rounded-lg p-8 text-center">
        <h1 className="text-xl font-bold text-gray-900 mb-3">Award detail unavailable right now</h1>
        <p className="text-gray-600 mb-6">
          The Federal Audit Clearinghouse is briefly rate-limited, so the award-level detail
          couldn&apos;t be fetched. This doesn&apos;t affect the organization&apos;s audit history —
          try again in a moment.
        </p>
        <div className="flex flex-wrap gap-3 justify-center">
          <button
            onClick={reset}
            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-5 py-2.5 rounded-lg"
          >
            Try again
          </button>
          {params?.ein && (
            <Link
              href={`/single-audit/${params.ein}`}
              className="border border-gray-300 hover:bg-gray-50 text-gray-700 font-semibold px-5 py-2.5 rounded-lg"
            >
              Back to audit history
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
