'use client';

import { useState } from 'react';
import { track } from '@vercel/analytics';
import { EVENT_EARLY_ACCESS_SUBMIT } from '@/lib/analytics-events';

type Segment = 'recipient' | 'passthrough' | 'adviser' | 'other';

// recipient vs. pass-through vs. adviser/auditor is the question the
// whole product strategy hangs on, and this form is the one moment a
// visitor is motivated to answer it — an unsegmented email list tells
// you nothing. Kept in sync with VALID_SEGMENTS in
// app/api/waitlist/route.ts.
const SEGMENT_OPTIONS: { value: Segment; label: string }[] = [
  { value: 'recipient', label: "I track my own organization's findings" },
  { value: 'passthrough', label: 'I monitor organizations we fund (pass-through)' },
  { value: 'adviser', label: 'I advise or audit recipients of federal awards' },
  { value: 'other', label: 'Other' },
];

/**
 * Homepage early-access capture — see EARLY_ACCESS_BLOCK.md and
 * /Users/Bunnu/.claude/plans/merry-enchanting-kay.md. Supersedes the
 * earlier generic "Get notified" waitlist copy with a specific pitch
 * (two named alert types) and a role question precise enough to be
 * useful for positioning/pricing later.
 *
 * NOTE — no auto-reply email: the build order this implements treats a
 * confirmation email as required, but no email-sending infra exists in
 * this repo (no Resend/Postmark/SES, no API key configured) and setting
 * one up requires an account only the site owner can create. Asked the
 * user directly; the explicit answer was to skip the auto-reply
 * entirely rather than stub it. This is a deliberate, approved scope
 * cut, not an oversight — the success copy below is worded to not imply
 * an email is coming.
 *
 * The goal is real first users giving feedback through actual product
 * usage, not a list of names to follow up with later — so every CTA
 * that could plausibly identify a real recipient or pass-through
 * organization (the org page's "Are you this organization?", the
 * homepage's "For Recipients"/"For Pass-Throughs" cards) links straight
 * into sign-in or /portfolio instead of using this form. This is left
 * for the one CTA that's genuinely just capturing general interest —
 * the homepage's closing early-access band, for a visitor who hasn't
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
  ctaLabel = 'Request early access',
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
      setError('Please choose which best describes your role.');
      setStatus('error');
      return;
    }
    setStatus('submitting');
    setError('');

    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // referrer: free qualitative signal for the owner notification
        // (someone converting from a guide page wants something
        // different from someone converting from an org page) — see
        // lib/send-owner-notification.ts. document.referrer is empty for
        // direct navigation/new tabs, which is expected, not a bug.
        body: JSON.stringify({ email, source, ein, segment, referrer: document.referrer }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || 'Something went wrong. Try again.');
        setStatus('error');
        return;
      }

      setStatus('success');
      // Role bucket only — never the email. See lib/analytics-events.ts.
      track(EVENT_EARLY_ACCESS_SUBMIT, { role: segment });
    } catch {
      setError('Could not reach the server. Try again.');
      setStatus('error');
    }
  };

  if (status === 'success') {
    return (
      <p className={`text-sm font-semibold text-white ${className}`}>
        Thanks — we&apos;ve got your details. We&apos;ll follow up soon.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className={`text-left ${className}`}>
      <fieldset className="mb-3">
        <legend className="text-sm font-semibold text-white mb-2">
          Which best describes your role?
        </legend>
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
                className="accent-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              />
              {opt.label}
            </label>
          ))}
        </div>
      </fieldset>

      {/* Real label, not just placeholder+aria-label — a placeholder
          disappears the moment someone starts typing, which leaves a
          sighted user unsure what the field wanted once it's no longer
          empty. aria-label alone covers assistive tech but not this. */}
      <label htmlFor="early-access-email" className="block text-sm font-semibold text-white mb-2">
        Email
      </label>
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          id="early-access-email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="your@organization.org"
          // bg-white explicit, not assumed — the page never declares a
          // light color-scheme, so a browser/OS in dark mode renders
          // native inputs with a dark UA-default background by default.
          // text-gray-900 was already forcing dark text; without an
          // explicit light background too, that's black-on-black in
          // dark mode. Every other bare <input> on the site has the same
          // latent gap — see app/ein-search-form.tsx and
          // app/auth/signin/page.tsx, fixed alongside this one.
          className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-accent"
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
      <p className="text-xs text-white/60 mt-2">
        We&apos;ll only use this to follow up about early access — never shared, never sold.
      </p>
    </form>
  );
}
