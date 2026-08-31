'use client';

import { useEffect, useState } from 'react';

// The hero sample card's management-decision countdown. Kept as a
// rolling "N days from today" rather than a hardcoded date so it never
// goes stale (a fixed "Due October 15, 2026 — 47 days from today" reads
// as a live figure and turns into a past date within weeks).
//
// Client-only: the homepage is statically prerendered, so a
// server-computed date would freeze at build time. Server render (and
// the first client render) shows the relative fallback; useEffect fills
// in the concrete date after mount. Both branches are coherent prose, so
// there's no hydration mismatch and no jarring layout shift.
const DAYS_AWAY = 47;

export function HeroDeadlineLine() {
  const [dateStr, setDateStr] = useState<string | null>(null);

  useEffect(() => {
    const d = new Date();
    d.setDate(d.getDate() + DAYS_AWAY);
    setDateStr(d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }));
  }, []);

  return (
    <p className="mt-1 text-small leading-relaxed text-amber-900">
      {dateStr ? (
        <>
          Due <strong>{dateStr}</strong> — {DAYS_AWAY} days from today.
        </>
      ) : (
        <>
          Due <strong>in about {Math.round(DAYS_AWAY / 7)} weeks</strong>.
        </>
      )}{' '}
      Under 2 CFR 200.521(d), the pass-through entity that funded this organization must act by
      then.
    </p>
  );
}
