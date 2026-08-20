'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getUser, logoutUser } from '@/lib/auth-config';
import Link from 'next/link';

interface CapItem {
  id: string;
  status: string;
}

interface Finding {
  id: string;
  facFindingId: string;
  category: string;
  description: string;
  questionedCosts?: number;
  isRepeatFinding: boolean;
  auditYear: string; // the audit period's fiscal-year-end date, e.g. "2024-12-31"
  capItems: CapItem[];
}

/**
 * A finding's fiscal-year-end date is always in the past — it's the
 * period an already-completed audit covered, not a future deadline. What
 * "next cycle prep" actually needs is the *next* occurrence of that same
 * annual date, projected forward from today, since that's the closest
 * proxy this data has for "when will the next audit likely happen."
 * Previously this just diffed today against the historical date
 * directly, so every finding — regardless of actual urgency — showed as
 * "OVERDUE," which made the whole ranking meaningless.
 */
function daysUntilNextCycle(fiscalYearEnd: string): number | null {
  if (!fiscalYearEnd) return null;
  const fye = new Date(fiscalYearEnd);
  if (Number.isNaN(fye.getTime())) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let next = new Date(today.getFullYear(), fye.getMonth(), fye.getDate());
  if (next < today) {
    next = new Date(today.getFullYear() + 1, fye.getMonth(), fye.getDate());
  }

  return Math.round((next.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

/** A finding counts as resolved only if it has at least one CAP item and
 * every CAP item on it is marked resolved. No CAP items yet, or any item
 * still open/in_progress, means it still needs attention. Previously
 * this checked `finding.status`, a field the API response never actually
 * sets — every finding passed the filter regardless of its CAP items'
 * real status. */
function isResolved(finding: Finding): boolean {
  return finding.capItems.length > 0 && finding.capItems.every((c) => c.status === 'resolved');
}

export default function NextCyclePrepReport() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [findings, setFindings] = useState<Finding[]>([]);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    const user = getUser();
    if (!user) {
      router.push('/auth/signin');
      return;
    }
    setEmail(user);
    fetchFindings(user);
  }, [mounted, router]);

  const fetchFindings = async (userEmail: string) => {
    try {
      const res = await fetch(`/api/findings?email=${encodeURIComponent(userEmail)}`);
      if (res.ok) {
        const data = await res.json();
        setFindings(data);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = () => {
    logoutUser();
    router.push('/auth/signin');
  };

  if (!mounted || !email) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  const openFindings = findings
    .filter((f) => !isResolved(f))
    .map((f) => ({ finding: f, daysLeft: daysUntilNextCycle(f.auditYear) }))
    .sort((a, b) => (a.daysLeft ?? Infinity) - (b.daysLeft ?? Infinity));

  const groupedByFYE = openFindings.reduce((acc, entry) => {
    const fye = entry.finding.auditYear || 'Unknown';
    (acc[fye] ||= []).push(entry);
    return acc;
  }, {} as Record<string, typeof openFindings>);

  const sortedFYEs = Object.keys(groupedByFYE).sort(
    (a, b) => (daysUntilNextCycle(a) ?? Infinity) - (daysUntilNextCycle(b) ?? Infinity)
  );

  const dueSoonCount = openFindings.filter((e) => e.daysLeft !== null && e.daysLeft <= 90).length;

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-sm text-blue-600 hover:text-blue-800">
              ← Back to home
            </Link>
            <span className="text-gray-300">|</span>
            <Link href="/dashboard" className="text-2xl font-bold hover:text-blue-600">
              CAP Tracker
            </Link>
            <span className="text-gray-400">›</span>
            <span className="text-lg font-semibold text-gray-700">Next-Cycle Prep</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600">{email}</span>
            <button onClick={handleSignOut} className="text-sm text-gray-600 hover:text-gray-900">
              Sign Out
            </button>
          </div>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-2xl font-bold mb-2">Next-Cycle Prep Report</h2>
          <p className="text-gray-600 mb-1">
            Your open corrective action items, grouped by the audit they came from and ranked by
            how soon that fiscal year comes back around.
          </p>
          <p className="text-sm text-gray-500">
            "Days until next cycle" projects the next occurrence of each finding's fiscal
            year-end date — it's an estimate of when your next audit for that period is likely,
            not a date the FAC publishes. A repeat finding at your next audit is what this report
            is trying to help you avoid.
          </p>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          {loading ? (
            <p className="text-gray-500">Loading findings...</p>
          ) : openFindings.length === 0 ? (
            <div className="bg-green-50 border border-green-200 rounded p-4">
              <p className="text-green-800 font-semibold">✓ No open CAP items!</p>
              <p className="text-sm text-green-700">
                Every finding either has a resolved CAP item or none was ever open.
              </p>
            </div>
          ) : (
            <>
              {dueSoonCount > 0 && (
                <p className="text-sm text-gray-700 mb-4">
                  <strong>{dueSoonCount}</strong> of {openFindings.length} open item
                  {openFindings.length === 1 ? '' : 's'} {dueSoonCount === 1 ? 'is' : 'are'} tied
                  to a fiscal year ending within 90 days.
                </p>
              )}

              <div className="space-y-6">
                {sortedFYEs.map((fye) => {
                  const daysLeft = daysUntilNextCycle(fye);
                  const urgencyColor =
                    daysLeft === null
                      ? 'text-gray-500'
                      : daysLeft < 30
                        ? 'text-red-600'
                        : daysLeft < 90
                          ? 'text-yellow-600'
                          : 'text-gray-600';

                  return (
                    <div key={fye} className="border rounded-lg p-4">
                      <div className="flex justify-between items-center mb-4">
                        <h3 className="text-lg font-bold">
                          Audit period ending {fye}
                          <span className="ml-2 font-normal text-sm text-gray-500">
                            {groupedByFYE[fye].length} open item
                            {groupedByFYE[fye].length === 1 ? '' : 's'}
                          </span>
                        </h3>
                        <span className={`text-sm font-semibold ${urgencyColor}`}>
                          {daysLeft === null
                            ? 'Date unknown'
                            : `📅 next cycle in ~${daysLeft} day${daysLeft === 1 ? '' : 's'}`}
                        </span>
                      </div>

                      <div className="space-y-3">
                        {groupedByFYE[fye].map(({ finding }) => {
                          const isOpen = expanded[finding.id];
                          return (
                            <div
                              key={finding.id}
                              className={`border-l-4 p-3 ${
                                finding.isRepeatFinding
                                  ? 'border-red-500 bg-red-50'
                                  : 'border-blue-500 bg-blue-50'
                              }`}
                            >
                              <div className="flex justify-between items-start">
                                <div className="flex-1">
                                  <p className="font-bold text-sm">{finding.facFindingId}</p>
                                  <p
                                    className={`text-sm text-gray-700 mt-1 ${
                                      isOpen ? '' : 'line-clamp-2'
                                    }`}
                                  >
                                    {finding.description}
                                  </p>
                                  {finding.description.length > 160 && (
                                    <button
                                      onClick={() =>
                                        setExpanded((p) => ({ ...p, [finding.id]: !p[finding.id] }))
                                      }
                                      className="text-xs text-blue-700 hover:underline mt-1"
                                    >
                                      {isOpen ? 'Show less' : 'Read full finding'}
                                    </button>
                                  )}
                                  <p className="text-xs text-gray-600 mt-2">
                                    {finding.category}
                                    {finding.questionedCosts && (
                                      <span> • ${finding.questionedCosts.toLocaleString()} questioned</span>
                                    )}
                                  </p>
                                </div>
                                {finding.isRepeatFinding && (
                                  <span className="ml-2 inline-block bg-red-600 text-white text-xs px-2 py-1 rounded whitespace-nowrap">
                                    REPEAT
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-6">
          <p className="text-sm text-blue-800">
            💡 <strong>Tip:</strong> Items whose fiscal year comes back around soonest should be
            prioritized. Red items are repeat findings from prior audits — showing up again at
            your next audit carries extra weight with reviewers.
          </p>
        </div>

        <Link href="/dashboard" className="inline-block mt-6 text-blue-600 hover:text-blue-800 font-semibold">
          ← Back to Dashboard
        </Link>
      </main>
    </div>
  );
}
