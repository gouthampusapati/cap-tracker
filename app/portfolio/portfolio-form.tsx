'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { track } from '@vercel/analytics';
// Import from lib/ein-list, NOT lib/portfolio — this is a 'use client'
// component, and lib/portfolio.ts is guarded with `import 'server-only'`
// specifically because importing anything from it here previously pulled
// the DB client into the browser bundle and crashed this page in
// production. See lib/ein-list.ts's comment for the full story.
import { PORTFOLIO_MAX_EINS, parseEinList } from '@/lib/ein-list';
import { EVENT_PORTFOLIO_SUBMIT, bucketEinCount } from '@/lib/analytics-events';

export default function PortfolioForm({ initialValue }: { initialValue: string }) {
  const [value, setValue] = useState(initialValue);
  const router = useRouter();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;

    // The bucketed count, not the EINs themselves, is the signal the
    // brief calls out: one EIN suggests a recipient looking up itself,
    // twenty suggests a pass-through monitoring a portfolio.
    const { eins } = parseEinList(trimmed);
    if (eins.length > 0) {
      track(EVENT_PORTFOLIO_SUBMIT, { einCountBucket: bucketEinCount(eins.length) });
    }

    // Encoding the list into the URL is what makes results shareable —
    // a colleague can open the same link and see the same table.
    router.push(`/portfolio?eins=${encodeURIComponent(trimmed)}`);
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl">
      <label htmlFor="ein-list" className="block text-sm font-semibold text-gray-700 mb-2">
        Paste EINs — one per line, or comma-separated
      </label>
      <textarea
        id="ein-list"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={'916001236\n742089103\n421079767'}
        rows={6}
        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
      />
      <div className="flex items-center justify-between mt-3">
        <p className="text-xs text-gray-500">
          Up to {PORTFOLIO_MAX_EINS} EINs per lookup. Duplicates and formatting (hyphens, extra
          spaces) are handled automatically.
        </p>
        <button
          type="submit"
          className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-2.5 rounded-lg whitespace-nowrap ml-4"
        >
          View portfolio →
        </button>
      </div>
    </form>
  );
}
