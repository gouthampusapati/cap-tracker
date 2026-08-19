'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function Home() {
  const [ein, setEin] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = ein.trim();

    // Validate EIN
    if (!/^\d{9}$/.test(trimmed)) {
      setError('Please enter a valid 9-digit EIN.');
      return;
    }

    setError('');
    router.push(`/single-audit/${trimmed}`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 py-6 sm:px-6 lg:px-8 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900">Single Audit Intelligence</h1>
          <div className="space-x-4">
            <Link href="/guide" className="text-blue-600 hover:text-blue-800 font-semibold">
              Guide
            </Link>
            <Link
              href="/auth/signin"
              className="text-blue-600 hover:text-blue-800 font-semibold"
            >
              Sign in
            </Link>
          </div>
        </div>
      </div>

      {/* Hero */}
      <div className="max-w-5xl mx-auto px-4 py-12 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-4">
            Track Single Audit Findings
          </h2>
          <p className="text-xl text-gray-600 mb-8">
            Search the Federal Audit Clearinghouse. See audit findings and corrective action
            plans for any organization that receives federal awards.
          </p>

          {/* Search Box */}
          <form onSubmit={handleSearch} className="max-w-md mx-auto">
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Enter EIN (9 digits)"
                value={ein}
                onChange={(e) => {
                  setEin(e.target.value);
                  setError('');
                }}
                className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="submit"
                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-3 rounded-lg"
              >
                Search
              </button>
            </div>
            {error && <p className="text-red-600 text-sm mt-2">{error}</p>}
          </form>

          {/* Example links */}
          <div className="mt-8 text-sm text-gray-600">
            <p className="mb-3">Try these examples:</p>
            <div className="space-y-2">
              <Link href="/single-audit/916001236" className="text-blue-600 hover:underline">
                City of Cheney, WA (916001236)
              </Link>
              <br />
              <Link href="/single-audit/742089103" className="text-blue-600 hover:underline">
                Atascosa Health Center (742089103)
              </Link>
              <br />
              <Link href="/single-audit/421079767" className="text-blue-600 hover:underline">
                Grinnell Housing Authority (421079767)
              </Link>
            </div>
          </div>
        </div>

        {/* Info sections */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 my-16">
          <div className="bg-white p-6 rounded-lg border border-gray-200">
            <h3 className="text-lg font-bold text-gray-900 mb-3">For Recipients</h3>
            <p className="text-gray-600 mb-4">
              Track your Single Audit findings across years. Monitor repeat-finding risk. Stay
              on top of corrective action plans.
            </p>
            <Link
              href="/auth/signin"
              className="text-blue-600 hover:text-blue-800 font-semibold"
            >
              Start tracking →
            </Link>
          </div>

          <div className="bg-white p-6 rounded-lg border border-gray-200">
            <h3 className="text-lg font-bold text-gray-900 mb-3">For Pass-Throughs</h3>
            <p className="text-gray-600 mb-4">
              Monitor your subrecipients' audit findings. Check compliance status. Verify audit
              history.
            </p>
            <Link
              href="/auth/signin"
              className="text-blue-600 hover:text-blue-800 font-semibold"
            >
              Start monitoring →
            </Link>
          </div>
        </div>

        {/* What is a Single Audit? */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-8 my-16">
          <h3 className="text-2xl font-bold text-gray-900 mb-4">What is a Single Audit?</h3>
          <p className="text-gray-700 mb-4">
            Organizations that receive $1,000,000 or more in federal awards in a single fiscal
            year must have a Single Audit — a comprehensive audit that includes compliance with
            federal requirements.
          </p>
          <p className="text-gray-700 mb-4">
            When auditors find a problem, they report it as a "finding." The organization must
            respond with a Corrective Action Plan (CAP). If the problem shows up again in the
            next year's audit, it becomes a "repeat finding" — a risk flag for federal agencies.
          </p>
          <p className="text-gray-700">
            All Single Audit data is public domain and lives in the{' '}
            <a
              href="https://www.fac.gov"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold text-blue-600 hover:text-blue-800"
            >
              Federal Audit Clearinghouse
            </a>
            . This site makes it easier to find and understand that data.
          </p>
        </div>

        {/* Features */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 my-16">
          <div>
            <div className="text-3xl mb-2">📊</div>
            <h4 className="font-bold text-gray-900 mb-2">Audit History</h4>
            <p className="text-sm text-gray-600">
              See all years of audit history for any organization.
            </p>
          </div>
          <div>
            <div className="text-3xl mb-2">🚩</div>
            <h4 className="font-bold text-gray-900 mb-2">Findings at a Glance</h4>
            <p className="text-sm text-gray-600">
              View findings by category, flag repeats, and track status.
            </p>
          </div>
          <div>
            <div className="text-3xl mb-2">✍️</div>
            <h4 className="font-bold text-gray-900 mb-2">CAP Text</h4>
            <p className="text-sm text-gray-600">
              Read the corrective action plans organizations filed with auditors.
            </p>
          </div>
        </div>

        {/* CTA Footer */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg p-8 text-center mb-16">
          <h3 className="text-2xl font-bold mb-3">Ready to track findings?</h3>
          <p className="text-blue-100 mb-6">
            Create an account to import your organization and start tracking.
          </p>
          <Link
            href="/auth/signin"
            className="inline-block bg-white text-blue-600 hover:bg-blue-50 font-semibold px-8 py-3 rounded-lg"
          >
            Get started free →
          </Link>
        </div>
      </div>

      {/* Footer */}
      <div className="bg-gray-900 text-gray-300 py-8 border-t border-gray-800">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
            <div>
              <h4 className="font-bold text-white mb-3">Product</h4>
              <ul className="text-sm space-y-2">
                <li>
                  <Link href="/" className="hover:text-white">
                    Home
                  </Link>
                </li>
                <li>
                  <Link href="/guide" className="hover:text-white">
                    Compliance guide
                  </Link>
                </li>
                <li>
                  <Link href="/auth/signin" className="hover:text-white">
                    Sign in
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold text-white mb-3">Resources</h4>
              <ul className="text-sm space-y-2">
                <li>
                  <a href="https://www.fac.gov" target="_blank" rel="noopener noreferrer" className="hover:text-white">
                    Federal Audit Clearinghouse
                  </a>
                </li>
                <li>
                  <a href="https://www.whitehouse.gov/omb/information-regulatory-affairs/circulars/" target="_blank" rel="noopener noreferrer" className="hover:text-white">
                    OMB Circular A-133
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold text-white mb-3">Legal</h4>
              <p className="text-xs">
                Single Audit Intelligence is an independent tool. Not affiliated with GSA, OMB, or
                any federal agency.
              </p>
            </div>
          </div>
          <div className="border-t border-gray-800 pt-8 text-xs text-gray-500 text-center">
            <p>© 2026 Single Audit Intelligence. All data is public domain.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
