'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getUser, logoutUser } from '@/lib/auth-config';
import Link from 'next/link';

interface Finding {
  id: string;
  facFindingId: string;
  category: string;
  description: string;
  questionedCosts?: number;
  isRepeatFinding: boolean;
  auditYear: string;
  status?: string;
}

export default function NextCyclePrepReport() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [findings, setFindings] = useState<Finding[]>([]);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);

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

  // Calculate days until fiscal year end
  const calculateDaysUntilFYE = (fiscalYearEnd: string): number => {
    if (!fiscalYearEnd) return 999;
    const fye = new Date(fiscalYearEnd);
    const today = new Date();
    const daysLeft = Math.ceil((fye.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return daysLeft;
  };

  // Sort findings by urgency (closest fiscal year end first)
  const urgentFindings = findings
    .filter(f => f.status !== 'resolved') // Only open/in-progress items
    .sort((a, b) => {
      const daysA = calculateDaysUntilFYE(a.auditYear);
      const daysB = calculateDaysUntilFYE(b.auditYear);
      return daysA - daysB; // Closest deadline first
    });

  // Group by fiscal year end
  const groupedByFYE = urgentFindings.reduce((acc, finding) => {
    const fye = finding.auditYear || 'Unknown';
    if (!acc[fye]) {
      acc[fye] = [];
    }
    acc[fye].push(finding);
    return acc;
  }, {} as Record<string, Finding[]>);

  // Sort groups by fiscal year end date
  const sortedFYEs = Object.keys(groupedByFYE).sort((a, b) => {
    const daysA = calculateDaysUntilFYE(a);
    const daysB = calculateDaysUntilFYE(b);
    return daysA - daysB;
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="text-2xl font-bold hover:text-blue-600">
              CAP Tracker
            </Link>
            <span className="text-gray-400">›</span>
            <span className="text-lg font-semibold text-gray-700">Next-Cycle Prep</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600">{email}</span>
            <button
              onClick={handleSignOut}
              className="text-sm text-gray-600 hover:text-gray-900"
            >
              Sign Out
            </button>
          </div>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <h2 className="text-2xl font-bold mb-2">Next-Cycle Prep Report</h2>
          <p className="text-gray-600 mb-6">
            Open CAP items sorted by urgency (fiscal year-end proximity)
          </p>

          {loading ? (
            <p className="text-gray-500">Loading findings...</p>
          ) : urgentFindings.length === 0 ? (
            <div className="bg-green-50 border border-green-200 rounded p-4">
              <p className="text-green-800 font-semibold">✓ No open CAP items!</p>
              <p className="text-sm text-green-700">All findings have been resolved.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {sortedFYEs.map((fye) => {
                const daysLeft = calculateDaysUntilFYE(fye);
                const urgencyColor =
                  daysLeft < 30 ? 'text-red-600' : daysLeft < 90 ? 'text-yellow-600' : 'text-gray-600';

                return (
                  <div key={fye} className="border rounded-lg p-4">
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="text-lg font-bold">
                        Fiscal Year End: {fye}
                      </h3>
                      <span className={`text-sm font-semibold ${urgencyColor}`}>
                        {daysLeft < 0 ? '⚠️ OVERDUE' : `📅 ${daysLeft} days`}
                      </span>
                    </div>

                    <div className="space-y-3">
                      {groupedByFYE[fye].map((finding) => (
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
                              <p className="text-sm text-gray-700 mt-1">{finding.description}</p>
                              <p className="text-xs text-gray-600 mt-2">
                                {finding.category}
                                {finding.questionedCosts && (
                                  <span> • ${finding.questionedCosts.toLocaleString()} questioned</span>
                                )}
                              </p>
                            </div>
                            {finding.isRepeatFinding && (
                              <span className="ml-2 inline-block bg-red-600 text-white text-xs px-2 py-1 rounded">
                                REPEAT
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-sm text-blue-800">
            💡 <strong>Tip:</strong> Items closest to fiscal year-end should be prioritized. Red items are
            repeat findings from prior audits — extra attention needed.
          </p>
        </div>

        <Link
          href="/dashboard"
          className="inline-block mt-6 text-blue-600 hover:text-blue-800 font-semibold"
        >
          ← Back to Dashboard
        </Link>
      </main>
    </div>
  );
}
