'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getUser, logoutUser } from '@/lib/auth-config';

interface Finding {
  id: string;
  facFindingId: string;
  category: string;
  description: string;
  questionedCosts?: number;
  isRepeatFinding: boolean;
  auditYear: string;
  priorRefs: string[];
}

interface CapItem {
  id: string;
  finding_id: string;
  owner: string;
  due_date?: number;
  status: string;
  notes: string;
  created_at: number;
  updated_at: number;
}

export default function Dashboard() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [ein, setEin] = useState('');
  const [loading, setLoading] = useState(false);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [imported, setImported] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [capItems, setCapItems] = useState<Record<string, CapItem[]>>({});

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    const user = getUser();
    if (!user) {
      router.push('/auth/signin');
    } else {
      setEmail(user);
    }
  }, [mounted, router]);

  const handleImport = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ein, email }),
      });

      if (res.ok) {
        setImported(true);
        await fetchFindings();
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchFindings = async () => {
    const res = await fetch('/api/findings?email=' + encodeURIComponent(email));
    if (res.ok) {
      const data = await res.json();
      setFindings(data);
      // Fetch CAP items for each finding
      data.forEach((finding: Finding) => {
        fetchCapItems(finding.id);
      });
    }
  };

  const fetchCapItems = async (findingId: string) => {
    try {
      const res = await fetch(`/api/cap-items?findingId=${encodeURIComponent(findingId)}`);
      if (res.ok) {
        const items = await res.json();
        setCapItems((prev) => ({
          ...prev,
          [findingId]: items,
        }));
      }
    } catch (error) {
      console.error('Error fetching CAP items:', error);
    }
  };

  const handleSignOut = () => {
    logoutUser();
    router.push('/auth/signin');
  };

  if (!mounted || !email) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold">CAP Tracker</h1>
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
        {!imported ? (
          <div className="bg-white rounded-lg shadow p-6 mb-8">
            <h2 className="text-xl font-bold mb-4">Import Organization</h2>
            <form onSubmit={handleImport} className="flex gap-4">
              <input
                type="text"
                placeholder="Enter EIN (e.g., 471334206)"
                value={ein}
                onChange={(e) => setEin(e.target.value)}
                className="flex-1 px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
              <button
                type="submit"
                disabled={loading}
                className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? 'Importing...' : 'Import'}
              </button>
            </form>
            <p className="text-sm text-gray-500 mt-2">Test EIN: 471334206</p>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex gap-4">
              <Link
                href="/dashboard/next-cycle-prep"
                className="inline-block bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 font-semibold"
              >
                📅 Next-Cycle Prep Report
              </Link>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-bold mb-4">Audit Findings</h2>

              {findings.length === 0 ? (
                <p className="text-gray-500">No findings imported yet.</p>
              ) : (
                <div className="space-y-4">
                  {findings.map((finding) => (
                    <div
                      key={finding.id}
                      className={`border-l-4 p-4 ${
                        finding.isRepeatFinding
                          ? 'border-red-500 bg-red-50'
                          : 'border-blue-500 bg-blue-50'
                      }`}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <h3 className="font-bold text-lg">{finding.facFindingId}</h3>
                          <p className="text-sm text-gray-600">{finding.category}</p>
                        </div>
                        <span className="text-sm text-gray-600">{finding.auditYear}</span>
                      </div>

                      <p className="text-sm mb-3">{finding.description}</p>

                      {finding.questionedCosts && (
                        <p className="text-sm font-semibold mb-2">
                          Questioned Costs: ${finding.questionedCosts.toLocaleString()}
                        </p>
                      )}

                      {finding.isRepeatFinding && (
                        <div className="bg-red-100 border border-red-300 rounded p-2 mb-3">
                          <p className="text-sm font-semibold text-red-800">
                            ⚠️ REPEAT FINDING
                          </p>
                          {finding.priorRefs.length > 0 && (
                            <p className="text-xs text-red-700">
                              Prior refs: {finding.priorRefs.join(', ')}
                            </p>
                          )}
                        </div>
                      )}

                      <div className="mt-3 p-3 bg-white rounded border">
                        <p className="text-sm font-semibold mb-2">CAP Item</p>
                        {capItems[finding.id]?.length > 0 ? (
                          capItems[finding.id].map((item) => (
                            <div key={item.id} className="p-2 bg-gray-50 rounded text-sm">
                              <p className="font-semibold">{item.owner || '(No owner)'}</p>
                              <p className="text-xs text-gray-600">
                                Due: {item.due_date ? new Date(item.due_date).toLocaleDateString() : 'Not set'}
                              </p>
                              <p className="text-xs">
                                Status: <span className="font-semibold">{item.status}</span>
                              </p>
                              {item.notes && <p className="text-xs mt-1 italic">{item.notes}</p>}
                            </div>
                          ))
                        ) : (
                          <div className="text-xs text-gray-500 italic">No CAP item yet</div>
                        )}
                        <button className="mt-2 w-full bg-gray-200 text-gray-800 py-1 rounded text-sm hover:bg-gray-300">
                          Generate Draft
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
