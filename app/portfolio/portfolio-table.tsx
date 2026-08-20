'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { PortfolioRow } from '@/lib/portfolio';

type SortKey = 'org' | 'fy' | 'total' | 'repeat' | 'material' | 'decision';

const columns: { key: SortKey; label: string }[] = [
  { key: 'org', label: 'Organization' },
  { key: 'fy', label: 'Most recent audit FY' },
  { key: 'total', label: 'Total findings' },
  { key: 'repeat', label: 'Repeat findings' },
  { key: 'material', label: 'Material weaknesses' },
  { key: 'decision', label: 'Management decision due' },
];

function sortValue(row: PortfolioRow, key: SortKey): string | number {
  switch (key) {
    case 'org':
      return row.orgName ?? row.ein;
    case 'fy':
      return row.mostRecentFyEnd ?? '';
    case 'total':
      return row.totalFindings;
    case 'repeat':
      return row.repeatFindings;
    case 'material':
      return row.materialWeaknesses;
    case 'decision':
      // Nulls (no findings / no deadline) sort last regardless of direction.
      return row.managementDecisionDays ?? Number.POSITIVE_INFINITY;
  }
}

export default function PortfolioTable({ initialRows }: { initialRows: PortfolioRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<1 | -1>(1);

  const rows = sortKey
    ? [...initialRows].sort((a, b) => {
        const av = sortValue(a, sortKey);
        const bv = sortValue(b, sortKey);
        if (av < bv) return -1 * sortDir;
        if (av > bv) return 1 * sortDir;
        return 0;
      })
    : initialRows; // server already applied the spec's default sort

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 1 ? -1 : 1));
    } else {
      setSortKey(key);
      setSortDir(1);
    }
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50">
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                onClick={() => toggleSort(col.key)}
                className="px-4 py-3 text-left font-semibold text-gray-900 cursor-pointer select-none hover:bg-gray-100 whitespace-nowrap"
              >
                {col.label}
                {sortKey === col.key ? (sortDir === 1 ? ' ↑' : ' ↓') : ''}
              </th>
            ))}
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {rows.map((row) => (
            <tr key={row.ein} className={row.status === 'found' ? '' : 'bg-gray-50'}>
              {row.status === 'found' ? (
                <>
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {row.orgName}
                    {row.stale && (
                      <span
                        title={
                          row.syncedAt
                            ? `High demand on the FAC right now — showing data from ${row.syncedAt.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}, not necessarily today's.`
                            : undefined
                        }
                        className="ml-2 inline-block text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 align-middle cursor-help"
                      >
                        not refreshed today
                      </span>
                    )}
                    <div className="text-xs text-gray-500 font-mono">{row.ein}</div>
                  </td>
                  <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                    {row.mostRecentFyEnd || '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-700">{row.totalFindings}</td>
                  <td className="px-4 py-3 text-gray-700">{row.repeatFindings}</td>
                  <td className="px-4 py-3 text-gray-700">{row.materialWeaknesses}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {row.managementDecisionLabel ? (
                      <span
                        className={
                          row.managementDecisionDays !== null && row.managementDecisionDays < 0
                            ? 'text-gray-600'
                            : row.managementDecisionDays !== null && row.managementDecisionDays <= 30
                              ? 'text-amber-700 font-semibold'
                              : 'text-gray-700'
                        }
                      >
                        {row.managementDecisionLabel}
                      </span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/single-audit/${row.ein}`}
                      className="text-blue-600 hover:text-blue-800 font-semibold whitespace-nowrap"
                    >
                      View →
                    </Link>
                  </td>
                </>
              ) : row.status === 'error' ? (
                <td colSpan={7} className="px-4 py-3 text-amber-700 italic">
                  <span className="font-mono not-italic">{row.ein}</span> — couldn't be checked
                  right now (the FAC may be rate-limited or briefly unavailable); this doesn't
                  mean it has no findings, only that we couldn't look
                </td>
              ) : (
                <td colSpan={7} className="px-4 py-3 text-gray-500 italic">
                  <span className="font-mono not-italic">{row.ein}</span> — not found in the
                  Federal Audit Clearinghouse
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
