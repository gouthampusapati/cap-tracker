'use client';

import { useState } from 'react';

/**
 * Shared inline email-capture form, replacing every CTA that used to
 * point at /auth/signin for a private workspace with no real onboarding
 * yet — see the UI/branding overhaul plan, Phase 1.5. Always-visible
 * (email input + submit button), not a hide/reveal toggle — matches the
 * site's "precise, institutional" tone better than a trick interaction.
 *
 * `source` must be one of the values app/api/waitlist/route.ts's
 * VALID_SOURCES allowlist accepts — keep the two in sync when adding a
 * new call site.
 */
export function WaitlistForm({
  source,
  ein,
  ctaLabel = 'Notify me',
  className = '',
}: {
  source: 'homepage-recipients' | 'homepage-passthroughs' | 'homepage-cta-band' | 'org-page-are-you-this-org';
  ein?: string;
  ctaLabel?: string;
  className?: string;
}) {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('submitting');
    setError('');

    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, source, ein }),
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
      <p className={`text-sm font-semibold text-primary ${className}`}>
        Thanks — we&apos;ll be in touch.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className={`flex flex-col sm:flex-row gap-2 ${className}`}>
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="your@organization.org"
        aria-label="Email address"
        className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-accent"
      />
      <button
        type="submit"
        disabled={status === 'submitting'}
        className="bg-accent hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent text-white font-semibold px-4 py-2 rounded-md text-sm whitespace-nowrap disabled:opacity-50"
      >
        {status === 'submitting' ? 'Sending…' : ctaLabel}
      </button>
      {status === 'error' && <p className="text-xs text-red-600 sm:basis-full">{error}</p>}
    </form>
  );
}
