'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { getOrCreateUser, isGuestUser, logoutUser } from '@/lib/auth-config';

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

interface Finding {
  id: string;
  facFindingId: string;
  reportId: string;
  auditYear: string;
  category: string;
  description: string;
  plannedAction: string;
  questionedCosts: number | null;
  isRepeatFinding: boolean;
  priorRefs: string[];
  capItems: CapItem[];
}

interface OrgSummary {
  orgName: string;
  ein?: string;
  uei?: string;
  auditYears: number;
  findingsCount?: number;
  repeatFindings?: number;
}

const STATUS_LABELS: Record<string, string> = {
  open: 'Open',
  in_progress: 'In Progress',
  resolved: 'Resolved',
};

const emptyForm = { owner: '', dueDate: '', status: 'open', notes: '' };

export default function Dashboard() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen text-gray-500">
          Loading…
        </div>
      }
    >
      <DashboardInner />
    </Suspense>
  );
}

function DashboardInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const einFromLink = searchParams.get('ein');
  const [email, setEmail] = useState('');
  const [ein, setEin] = useState('');
  const [loading, setLoading] = useState(false);
  const [importError, setImportError] = useState('');
  const [summary, setSummary] = useState<OrgSummary | null>(null);
  const [switching, setSwitching] = useState(false);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [imported, setImported] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [capItems, setCapItems] = useState<Record<string, CapItem[]>>({});
  const [editingFinding, setEditingFinding] = useState<string | null>(null);
  const [formData, setFormData] = useState(emptyForm);
  const [savingFinding, setSavingFinding] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setMounted(true);
  }, []);

  // No sign-in redirect: a first-time visitor gets a silently-created
  // guest identity (see getOrCreateUser) instead of hitting a form. This
  // is the entire reason "For Recipients" on the homepage can link
  // straight to /dashboard now instead of /auth/signin.
  useEffect(() => {
    if (!mounted) return;
    setEmail(getOrCreateUser());
  }, [mounted]);

  // If this user imported in an earlier session, show their data straight
  // away rather than making them re-enter the EIN. An org with zero
  // findings still counts as imported, so check the org record rather than
  // inferring from the findings list.
  //
  // If they arrived via ?ein=... (the "Are you this organization?" /
  // "Do you fund this organization?" CTAs on a public /single-audit/[ein]
  // page, carried through sign-in) and don't already have an org
  // imported, import that EIN automatically instead of dropping them back
  // at a blank EIN field they'd have to retype.
  //
  // BUG FIX: if they already have a DIFFERENT org imported (e.g. clicked
  // a homepage example earlier), a ?ein= link for another org used to be
  // silently ignored — the dashboard just showed whatever was already
  // there, which reads as "the link is broken" (reported live: visiting
  // ?ein=421079767 showed Atascosa, 0 findings, because that org had
  // been imported previously under the same guest identity). A link
  // naming a specific org should always show that org. Old data is
  // deleted before importing the new EIN, not left behind — findings
  // are queried by userId only (app/api/findings/route.ts), not scoped
  // by EIN, so leaving old audit_years/findings rows in place would mix
  // two different orgs' findings into one dashboard.
  useEffect(() => {
    if (!email) return;
    const einIsValid = !!einFromLink && /^\d{9}$/.test(einFromLink);
    (async () => {
      const res = await fetch('/api/org?email=' + encodeURIComponent(email));
      const org = res.ok ? await res.json() : null;

      if (org && einIsValid && org.ein !== einFromLink) {
        await fetch('/api/org?email=' + encodeURIComponent(email), { method: 'DELETE' });
        setEin(einFromLink!);
        await runImport(einFromLink!);
      } else if (org) {
        setSummary(org);
        setImported(true);
        await loadFindings(email);
      } else if (einIsValid) {
        setEin(einFromLink!);
        await runImport(einFromLink!);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email]);

  // Detach the current org so a different EIN can be imported.
  const handleSwitchOrg = async () => {
    setSwitching(true);
    try {
      await fetch('/api/org?email=' + encodeURIComponent(email), {
        method: 'DELETE',
      });
      setImported(false);
      setSummary(null);
      setFindings([]);
      setCapItems({});
      setEin('');
      setImportError('');
    } finally {
      setSwitching(false);
    }
  };

  const loadFindings = async (forEmail: string): Promise<Finding[]> => {
    const res = await fetch(
      '/api/findings?email=' + encodeURIComponent(forEmail)
    );
    if (!res.ok) return [];

    const data: Finding[] = await res.json();
    setFindings(data);
    setCapItems(Object.fromEntries(data.map((f) => [f.id, f.capItems || []])));
    return data;
  };

  const runImport = async (einToImport: string) => {
    setLoading(true);
    setImportError('');
    setSummary(null);

    try {
      const res = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ein: einToImport.trim(), email }),
      });

      const body = await res.json();

      if (!res.ok) {
        setImportError(body.error || 'Import failed.');
        return;
      }

      setSummary(body);
      setImported(true);
      await loadFindings(email);
    } catch {
      setImportError('Could not reach the Federal Audit Clearinghouse.');
    } finally {
      setLoading(false);
    }
  };

  const handleImport = (e: React.FormEvent) => {
    e.preventDefault();
    runImport(ein);
  };

  const refreshCapItems = async (findingId: string) => {
    const res = await fetch(
      `/api/cap-items?findingId=${encodeURIComponent(findingId)}`
    );
    if (!res.ok) return;
    const items = await res.json();
    setCapItems((prev) => ({ ...prev, [findingId]: items }));
  };

  const handleSaveCapItem = async (findingId: string) => {
    if (!formData.owner.trim()) return;

    setSavingFinding(findingId);
    try {
      const res = await fetch('/api/cap-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ findingId, ...formData }),
      });

      if (res.ok) {
        await refreshCapItems(findingId);
        setFormData(emptyForm);
        setEditingFinding(null);
      }
    } finally {
      setSavingFinding(null);
    }
  };

  const handleSignOut = () => {
    logoutUser();
    router.push('/auth/signin');
  };

  if (!mounted || !email) {
    return (
      <div className="flex items-center justify-center min-h-screen text-gray-500">
        Loading…
      </div>
    );
  }

  // Group by fiscal year so the page reads as an audit history.
  const byYear = findings.reduce<Record<string, Finding[]>>((acc, f) => {
    const key = f.auditYear || 'Unknown';
    (acc[key] ||= []).push(f);
    return acc;
  }, {});
  const years = Object.keys(byYear).sort().reverse();

  const openCount = findings.filter((f) => {
    const items = capItems[f.id] || [];
    return items.length === 0 || items.some((i) => i.status !== 'resolved');
  }).length;

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b">
        <div className="max-w-5xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-sm text-blue-600 hover:text-blue-800">
              ← Back to home
            </Link>
            <span className="text-gray-300">|</span>
            <h1 className="flex items-center gap-2 text-xl font-bold">
              <img src="/brand/logo-mark.png" alt="" className="h-6 w-6" />
              Single Audit Intelligence
            </h1>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600">
              {isGuestUser(email) ? 'Anonymous session' : email}
            </span>
            <button
              onClick={handleSignOut}
              className="text-sm text-gray-600 hover:text-gray-900"
            >
              Sign Out
            </button>
          </div>
        </div>
      </nav>

      <main className="max-w-5xl mx-auto px-4 py-8">
        {!imported ? (
          <div className="bg-white rounded-lg border p-6">
            <h2 className="text-lg font-bold mb-1">Import your audit history</h2>
            <p className="text-sm text-gray-600 mb-4">
              Enter your organization&apos;s EIN. We pull every Single Audit
              submission on file with the Federal Audit Clearinghouse.
            </p>

            <form onSubmit={handleImport} className="flex gap-3">
              <input
                type="text"
                placeholder="EIN (e.g. 916001236)"
                value={ein}
                onChange={(e) => setEin(e.target.value)}
                // Explicit bg-white/text-gray-900 — see
                // app/waitlist-form.tsx for why.
                className="flex-1 px-3 py-2 border rounded-md bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
              <button
                type="submit"
                disabled={loading}
                className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? 'Importing…' : 'Import'}
              </button>
            </form>

            {importError && (
              <p className="mt-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3">
                {importError}
              </p>
            )}

            <p className="text-xs text-gray-500 mt-3">
              Try 916001236 (City of Cheney &mdash; has findings) or 237155203
              (Council of Spanish Speaking Organizations &mdash; repeat finding).
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="bg-white rounded-lg border p-5 flex flex-wrap gap-6 items-center justify-between">
              <div>
                <h2 className="font-bold text-lg">
                  {summary?.orgName || 'Your organization'}
                </h2>
                <p className="text-sm text-gray-600">
                  {findings.length} finding{findings.length === 1 ? '' : 's'}{' '}
                  across {years.length} audit year
                  {years.length === 1 ? '' : 's'}
                  {openCount > 0 && ` · ${openCount} still open`}
                </p>
                <button
                  onClick={handleSwitchOrg}
                  disabled={switching}
                  className="text-xs text-blue-700 hover:underline mt-1 disabled:opacity-50"
                >
                  {switching ? 'Clearing…' : 'Import a different organization'}
                </button>
              </div>
              <Link
                href="/dashboard/next-cycle-prep"
                className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 text-sm font-semibold"
              >
                Next-Cycle Prep Report
              </Link>
            </div>

            {findings.length === 0 ? (
              <div className="bg-white rounded-lg border p-8 text-center">
                <p className="font-semibold mb-1">No findings on record</p>
                <p className="text-sm text-gray-600 max-w-md mx-auto">
                  The Federal Audit Clearinghouse has audit submissions for this
                  organization, but none of them reported findings. There is
                  nothing to track yet &mdash; which is the outcome you want.
                </p>
              </div>
            ) : (
              years.map((year) => (
                <div key={year} className="bg-white rounded-lg border p-6">
                  <h3 className="font-bold mb-4 pb-2 border-b">
                    Fiscal year ending {year}
                    <span className="ml-2 font-normal text-sm text-gray-500">
                      {byYear[year].length} finding
                      {byYear[year].length === 1 ? '' : 's'}
                    </span>
                  </h3>

                  <div className="space-y-5">
                    {byYear[year].map((finding) => {
                      const items = capItems[finding.id] || [];
                      const isOpen = expanded[finding.id];
                      const isEditing = editingFinding === finding.id;

                      return (
                        <div
                          key={finding.id}
                          className={`border-l-4 pl-4 py-3 rounded-r ${
                            finding.isRepeatFinding
                              ? 'border-red-500 bg-red-50'
                              : 'border-blue-400 bg-blue-50'
                          }`}
                        >
                          <div className="flex justify-between items-start gap-4 mb-2">
                            <div>
                              <h4 className="font-bold">
                                {finding.facFindingId}
                              </h4>
                              <p className="text-sm text-gray-700">
                                {finding.category}
                              </p>
                            </div>
                            {finding.questionedCosts ? (
                              <span className="text-sm font-semibold whitespace-nowrap">
                                ${finding.questionedCosts.toLocaleString()}
                              </span>
                            ) : null}
                          </div>

                          {finding.isRepeatFinding && (
                            <div className="bg-red-100 border border-red-300 rounded p-2 mb-3">
                              <p className="text-sm font-semibold text-red-800">
                                Repeat finding &mdash; flagged to federal
                                agencies
                              </p>
                              {finding.priorRefs.length > 0 && (
                                <p className="text-xs text-red-700 mt-0.5">
                                  Prior: {finding.priorRefs.join(', ')}
                                </p>
                              )}
                            </div>
                          )}

                          {finding.description && (
                            <div className="mb-3">
                              <p
                                className={`text-sm text-gray-800 whitespace-pre-line ${
                                  isOpen ? '' : 'line-clamp-3'
                                }`}
                              >
                                {finding.description}
                              </p>
                              <button
                                onClick={() =>
                                  setExpanded((p) => ({
                                    ...p,
                                    [finding.id]: !p[finding.id],
                                  }))
                                }
                                className="text-xs text-blue-700 hover:underline mt-1"
                              >
                                {isOpen ? 'Show less' : 'Read full finding'}
                              </button>
                            </div>
                          )}

                          {finding.plannedAction && (
                            <details className="mb-3">
                              <summary className="text-xs font-semibold text-gray-700 cursor-pointer">
                                Corrective action filed with the FAC
                              </summary>
                              <p className="text-sm text-gray-800 whitespace-pre-line mt-2 p-3 bg-white rounded border">
                                {finding.plannedAction}
                              </p>
                            </details>
                          )}

                          <div className="mt-3 p-3 bg-white rounded border">
                            <p className="text-sm font-semibold mb-2">
                              Tracked CAP items
                            </p>

                            {isEditing ? (
                              <div className="space-y-2">
                                <input
                                  type="text"
                                  placeholder="Owner name"
                                  value={formData.owner}
                                  onChange={(e) =>
                                    setFormData({
                                      ...formData,
                                      owner: e.target.value,
                                    })
                                  }
                                  // Explicit bg-white/text-gray-900 —
                                  // see app/waitlist-form.tsx for why.
                                  className="w-full px-2 py-1 border rounded text-sm bg-white text-gray-900"
                                />
                                <input
                                  type="date"
                                  value={formData.dueDate}
                                  onChange={(e) =>
                                    setFormData({
                                      ...formData,
                                      dueDate: e.target.value,
                                    })
                                  }
                                  // Explicit bg-white/text-gray-900 —
                                  // see app/waitlist-form.tsx for why.
                                  className="w-full px-2 py-1 border rounded text-sm bg-white text-gray-900"
                                />
                                <select
                                  value={formData.status}
                                  onChange={(e) =>
                                    setFormData({
                                      ...formData,
                                      status: e.target.value,
                                    })
                                  }
                                  // Explicit bg-white/text-gray-900 —
                                  // see app/waitlist-form.tsx for why.
                                  className="w-full px-2 py-1 border rounded text-sm bg-white text-gray-900"
                                >
                                  <option value="open">Open</option>
                                  <option value="in_progress">
                                    In Progress
                                  </option>
                                  <option value="resolved">Resolved</option>
                                </select>
                                <textarea
                                  placeholder="Notes (optional)"
                                  value={formData.notes}
                                  onChange={(e) =>
                                    setFormData({
                                      ...formData,
                                      notes: e.target.value,
                                    })
                                  }
                                  // Explicit bg-white/text-gray-900 —
                                  // see app/waitlist-form.tsx for why.
                                  className="w-full px-2 py-1 border rounded text-sm bg-white text-gray-900"
                                  rows={2}
                                />
                                <div className="flex gap-2">
                                  <button
                                    onClick={() =>
                                      handleSaveCapItem(finding.id)
                                    }
                                    disabled={
                                      savingFinding === finding.id ||
                                      !formData.owner.trim()
                                    }
                                    className="flex-1 bg-blue-600 text-white py-1 rounded text-sm hover:bg-blue-700 disabled:opacity-50"
                                  >
                                    {savingFinding === finding.id
                                      ? 'Saving…'
                                      : 'Save CAP Item'}
                                  </button>
                                  <button
                                    onClick={() => {
                                      setEditingFinding(null);
                                      setFormData(emptyForm);
                                    }}
                                    className="flex-1 bg-gray-200 text-gray-800 py-1 rounded text-sm hover:bg-gray-300"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <>
                                {items.length > 0 ? (
                                  items.map((item) => (
                                    <div
                                      key={item.id}
                                      className="p-2 bg-gray-50 rounded text-sm mb-2"
                                    >
                                      <p className="font-semibold">
                                        {item.owner || '(No owner)'}
                                      </p>
                                      <p className="text-xs text-gray-600">
                                        Due:{' '}
                                        {item.due_date
                                          ? new Date(
                                              item.due_date
                                            ).toLocaleDateString()
                                          : 'Not set'}
                                      </p>
                                      <p className="text-xs">
                                        Status:{' '}
                                        <span className="font-semibold">
                                          {STATUS_LABELS[item.status] ||
                                            item.status}
                                        </span>
                                      </p>
                                      {item.notes && (
                                        <p className="text-xs mt-1 italic text-gray-700">
                                          {item.notes}
                                        </p>
                                      )}
                                    </div>
                                  ))
                                ) : (
                                  <p className="text-xs text-gray-500 italic mb-2">
                                    Nothing tracked yet for this finding.
                                  </p>
                                )}
                                <button
                                  onClick={() => {
                                    setEditingFinding(finding.id);
                                    setFormData(emptyForm);
                                  }}
                                  className="w-full bg-blue-600 text-white py-1 rounded text-sm hover:bg-blue-700 mb-2"
                                >
                                  + Add CAP Item
                                </button>
                                <button
                                  disabled
                                  title="Coming next"
                                  className="w-full bg-gray-100 text-gray-400 py-1 rounded text-sm cursor-not-allowed"
                                >
                                  Generate Draft
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </main>
    </div>
  );
}
