'use client';

import { useState } from 'react';

type Segment = 'recipient' | 'passthrough' | 'other';

// recipient-vs-pass-through is the question the whole product strategy
// hangs on, and this form is the one moment a visitor is motivated to
// answer it — an unsegmented email list tells you nothing. Kept in sync
// with VALID_SEGMENTS in app/api/waitlist/route.ts.
const SEGMENT_OPTIONS: { value: Segment; label: string }[] = [
  { value: 'recipient', label: "I track my own organization's findings" },
  { value: 'passthrough', label: 'I monitor organizations we fund' },
  { value: 'other', label: 'Something else' },
];

/**
 * Shared inline email-capture form. See the UI/branding overhaul plan,
 * Phase 1.5, and the homepage-refinement plan's Phase 1.2 for the
 * segment question. Always-visible (no hide/reveal toggle) — matches
 * the site's "precise, institutional" tone better than a trick
 * interaction.
 *
 * The goal is real first users giving feedback through actual product
 * usage, not a list of names to follow up with later — so every CTA
 * that could plausibly identify a real recipient or pass-through
 * organization (the org page's "Are you this organization?", the
 * homepage's "For Recipients"/"For Pass-Throughs" cards) links straight
 * into sign-in or /portfolio instead of using this form. This is left
 * for the one CTA that's genuinely just capturing general interest —
 * the homepage's closing waitlist band, for a visitor who hasn't
 * identified as anything in particular yet.
 *
 * `source` must be one of the values app/api/waitlist/route.ts's
 * VALID_SOURCES allowlist accepts — keep the two in sync when adding a
 * new call site. Styled for its one current context (a dark bg-primary
 * band) — revisit label/input colors if this ever gets reused on a
 * light background.
 */
export function WaitlistForm({
  source,
  ein,
  ctaLabel = 'Notify me',
  className = '',
}: {
  source: 'homepage-cta-band';
  ein?: string;
  ctaLabel?: string;
  className?: string;
}) {
  const [email, setEmail] = useState('');
  const [segment, setSegment] = useState<Segment | ''>('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!segment) {
      setError('Please choose which describes you.');
      setStatus('error');
      return;
    }
    setStatus('submitting');
    setError('');

    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, source, ein, segment }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || 'Something went wrong. Try again.');
        setStatus('error');
        return;
      }

      setStatus('success');
    } catch {
      setError('Could not reach the server. Try again.');
      setStatus('error');
    }
  };

  if (status === 'success') {
    return (
      <p className={`text-sm font-semibold text-white ${className}`}>
        Thanks — we&apos;ll be in touch.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className={`text-left ${className}`}>
      <fieldset className="mb-3">
        <legend className="text-sm font-semibold text-white mb-2">Which describes you?</legend>
        <div className="space-y-1.5">
          {SEGMENT_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className="flex items-center gap-2 text-sm text-white/80 cursor-pointer"
            >
              <input
                type="radio"
                name="segment"
                value={opt.value}
                checked={segment === opt.value}
                onChange={() => {
                  setSegment(opt.value);
                  if (status === 'error') {
                    setStatus('idle');
                    setError('');
                  }
                }}
                required
                className="accent-accent"
              />
              {opt.label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-col sm:flex-row gap-2">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="your@organization.org"
          aria-label="Email address"
          className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-accent"
        />
        <button
          type="submit"
          disabled={status === 'submitting'}
          className="bg-accent hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent text-white font-semibold px-4 py-2 rounded-md text-sm whitespace-nowrap disabled:opacity-50"
        >
          {status === 'submitting' ? 'Sending…' : ctaLabel}
        </button>
      </div>
      {status === 'error' && <p className="text-xs text-red-300 mt-2">{error}</p>}
    </form>
  );
}
