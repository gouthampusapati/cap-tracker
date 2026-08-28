'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { AuditorSearchRow } from '@/lib/auditors-shared';

type SortKey = 'name' | 'location' | 'audits' | 'clients' | 'year';

const COLUMNS: { key: SortKey; label: string; num?: boolean }[] = [
  { key: 'name', label: 'Firm' },
  { key: 'location', label: 'Location' },
  { key: 'audits', label: 'Single Audits filed', num: true },
  { key: 'clients', label: 'Distinct clients', num: true },
  { key: 'year', label: 'Most recent', num: true },
];

function value(r: AuditorSearchRow, k: SortKey): string | number {
  switch (k) {
    case 'name':
      return r.name.toLowerCase();
    case 'location':
      return `${r.state ?? ''} ${r.city ?? ''}`.toLowerCase();
    case 'audits':
      return r.auditCount;
    case 'clients':
      return r.clientCount;
    case 'year':
      return r.mostRecentYear ?? '';
  }
}

export function AuditorResultsTable({ rows }: { rows: AuditorSearchRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('audits');
  const [dir, setDir] = useState<1 | -1>(-1);

  const sorted = [...rows].sort((a, b) => {
    const av = value(a, sortKey);
    const bv = value(b, sortKey);
    if (av < bv) return -dir;
    if (av > bv) return dir;
    return 0;
  });

  function toggle(k: SortKey) {
    if (k === sortKey) setDir((d) => (d === 1 ? -1 : 1));
    else {
      setSortKey(k);
      setDir(k === 'name' || k === 'location' ? 1 : -1);
    }
  }

  return (
    <div className="overflow-x-auto border border-gray-200 rounded-lg bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50">
            {COLUMNS.map((c) => (
              <th
                key={c.key}
                onClick={() => toggle(c.key)}
                className={`px-3 py-2 font-semibold text-gray-600 cursor-pointer select-none whitespace-nowrap ${
                  c.num ? 'text-right' : 'text-left'
                }`}
              >
                {c.label}
                {sortKey === c.key ? (dir === 1 ? ' ▲' : ' ▼') : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.ein} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
              <td className="px-3 py-2">
                <Link
                  href={`/auditors/${r.ein}`}
                  className="text-blue-600 hover:text-blue-800 font-medium"
                >
                  {r.name}
                </Link>
              </td>
              <td className="px-3 py-2 text-gray-600 whitespace-nowrap">
                {[r.city, r.state].filter(Boolean).join(', ') || '—'}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">{r.auditCount.toLocaleString()}</td>
              <td className="px-3 py-2 text-right tabular-nums">{r.clientCount.toLocaleString()}</td>
              <td className="px-3 py-2 text-right tabular-nums text-gray-600">
                {r.mostRecentYear ?? '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
