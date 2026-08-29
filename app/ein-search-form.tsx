'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Split out from app/page.tsx so the page itself can be a Server
 * Component and export metadata (specifically alternates.canonical) —
 * only this form actually needs client-side state/interactivity.
 */
export default function EinSearchForm() {
  const [ein, setEin] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = ein.trim();

    // Validate EIN
    if (!/^\d{9}$/.test(trimmed)) {
      // A concrete example beats an abstract rule — "9 digits" alone
      // doesn't tell a visitor what a valid one actually looks like.
      setError('EINs are 9 digits — try 916001236.');
      return;
    }

    setError('');
    router.push(`/single-audit/${trimmed}`);
  };

  return (
    // Full-width on mobile (search is the core function and should
    // dominate the hero there too), capped at max-w-lg from sm: up —
    // widened from max-w-md as part of the Stripe-inspired pass, to give
    // the search its "clear hero element" presence per the brief.
    <form onSubmit={handleSearch} className="w-full sm:max-w-lg mx-auto lg:mx-0">
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="Enter EIN (9 digits)"
          aria-label="Employer Identification Number"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'ein-search-error' : undefined}
          value={ein}
          onChange={(e) => {
            setEin(e.target.value);
            setError('');
          }}
          // Explicit bg-white/text-gray-900, not left to browser
          // defaults — see app/waitlist-form.tsx for why. Bigger
          // padding + shadow-card at rest + a soft accent-tinted glow on
          // focus (ring-4 at low opacity, not a hard 2px ring) — the
          // "premium search input" the redesign brief calls for, using
          // the existing brand blue rather than Stripe's violet.
          className="flex-1 px-5 py-4 border border-gray-300 rounded-lg bg-white text-gray-900 shadow-card transition-shadow focus:outline-none focus:ring-4 focus:ring-accent/15 focus:border-accent"
        />
        <button
          type="submit"
          className="bg-accent hover:opacity-90 hover:shadow-card-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent text-white font-semibold px-7 py-4 rounded-lg shadow-card transition-shadow"
        >
          Search
        </button>
      </div>
      {error && (
        <p id="ein-search-error" className="text-red-600 text-sm mt-2">
          {error}
        </p>
      )}
    </form>
  );
}
