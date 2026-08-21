'use client';

import { useEffect, useState } from 'react';

type SeverityValue = 'all' | 'material' | 'repeat' | 'questioned';

const OPTIONS: { value: SeverityValue; label: string }[] = [
  { value: 'all', label: 'All findings' },
  { value: 'material', label: 'Material weaknesses' },
  { value: 'repeat', label: 'Repeat findings' },
  { value: 'questioned', label: 'Questioned costs' },
];

/**
 * Filters VISIBILITY only, via a data-severity-filter attribute on
 * #findings-list that globals.css keys off of — every finding stays in
 * the server-rendered HTML no matter which filter is active (SEO-safe).
 * See finding-card.tsx's data-severity attribute on each <details>.
 *
 * Only rendered when a page has more than ~5 findings (see page.tsx) —
 * not worth the chrome on an org with one or two findings.
 */
export function SeverityFilter() {
  const [active, setActive] = useState<SeverityValue>('all');

  useEffect(() => {
    document.getElementById('findings-list')?.setAttribute('data-severity-filter', active);
  }, [active]);

  return (
    <div
      className="no-print flex flex-wrap gap-2 mb-4"
      role="group"
      aria-label="Filter findings by severity"
    >
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => setActive(opt.value)}
          aria-pressed={active === opt.value}
          className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
            active === opt.value
              ? 'bg-accent text-white border-accent'
              : 'bg-surface text-muted border-border hover:border-accent'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
