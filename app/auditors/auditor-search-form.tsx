'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { US_STATES } from '@/lib/auditors-shared';

const STATE_OPTIONS = Object.entries(US_STATES).sort((a, b) => a[1].localeCompare(b[1]));

export function AuditorSearchForm({
  initialState,
  initialQuery,
}: {
  initialState: string;
  initialQuery: string;
}) {
  const router = useRouter();
  const [state, setState] = useState(initialState);
  const [q, setQuery] = useState(initialQuery);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();
    if (state) params.set('state', state);
    if (q.trim()) params.set('q', q.trim());
    router.push(params.toString() ? `/auditors?${params}` : '/auditors');
  }

  return (
    <form onSubmit={submit} className="flex flex-col sm:flex-row gap-3 items-stretch">
      <select
        value={state}
        onChange={(e) => setState(e.target.value)}
        className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white sm:w-56"
        aria-label="Filter by state"
      >
        <option value="">All states</option>
        {STATE_OPTIONS.map(([code, name]) => (
          <option key={code} value={code}>
            {name}
          </option>
        ))}
      </select>
      <input
        type="text"
        value={q}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Firm name or city (e.g. CliftonLarsonAllen, or St. Louis)"
        className="border border-gray-300 rounded-lg px-3 py-2 text-sm flex-1"
        aria-label="Search by firm name or city"
      />
      <button
        type="submit"
        className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-5 py-2 rounded-lg text-sm"
      >
        Search
      </button>
    </form>
  );
}
