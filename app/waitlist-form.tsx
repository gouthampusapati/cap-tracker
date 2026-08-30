'use client';

import { useEffect, useState } from 'react';
import { track } from '@vercel/analytics';
import { EVENT_FOUNDING_SUBMIT, EVENT_FOUNDING_FORM_START } from '@/lib/analytics-events';

type Segment = 'recipient' | 'passthrough' | 'adviser' | 'other';
type InterestLevel = 'pay-now' | 'after-demo' | 'test-first' | 'free-only';
type OrgCount = '1-5' | '6-25' | '26-100' | '101-500' | '500+';
type CurrentMethod =
  | 'spreadsheet'
  | 'manual-fac'
  | 'internal-system'
  | 'email-calendar'
  | 'audit-software'
  | 'none'
  | 'other';

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

// The one qualifier that decides whether a submission is a sales
// conversation or a free-tools user. There is deliberately no "what
// would you expect to pay?" question — that signal comes from the
// conversation, not a radio button. Kept in sync with VALID_INTEREST
// in app/api/waitlist/route.ts.
const INTEREST_OPTIONS: { value: InterestLevel; label: string }[] = [
  { value: 'pay-now', label: 'I would pay for this now' },
  { value: 'after-demo', label: "I'd consider paying after a demo" },
  { value: 'test-first', label: "I'd like to test it first" },
  { value: 'free-only', label: "I'm only interested in the free tools" },
];

const ORG_COUNT_OPTIONS: { value: OrgCount; label: string }[] = [
  { value: '1-5', label: '1–5' },
  { value: '6-25', label: '6–25' },
  { value: '26-100', label: '26–100' },
  { value: '101-500', label: '101–500' },
  { value: '500+', label: '500+' },
];

const METHOD_OPTIONS: { value: CurrentMethod; label: string }[] = [
  { value: 'spreadsheet', label: 'Spreadsheet' },
  { value: 'manual-fac', label: 'Manual FAC searches' },
  { value: 'internal-system', label: 'Internal system' },
  { value: 'email-calendar', label: 'Email / calendar reminders' },
  { value: 'audit-software', label: 'Audit / compliance software' },
  { value: 'none', label: "We don't currently monitor them" },
  { value: 'other', label: 'Other' },
];

/**
 * Founding Customer capture — the form behind "Request founding access"
 * on the homepage closing band and the /pricing page. Supersedes the
 * earlier generic "early access / waitlist" framing: this is now
 * explicitly the way into a paid founding subscription, not a notify-me
 * list.
 *
 * NOTE — no auto-reply email: Resend is configured now (magic-link +
 * owner notification both send), but there is still deliberately no
 * confirmation email to the person who submits. The success state and
 * confirmation copy below are worded so they don't imply one is coming
 * — the next-steps list is the acknowledgement. Revisit if the founding
 * funnel gets enough volume that a branded confirmation is worth the
 * template + unsubscribe work.
 *
 * `qualifying` controls form depth:
 *   - true  (pricing page): role + optional organization name + interest
 *     + org count + optional current method. This is a higher-intent
 *     surface — someone reading a pricing page — so the questions earn
 *     their friction.
 *   - false (homepage band, dashboard draft CTA): role + email only.
 *     The homepage closing band catches a low-intent scroller; a
 *     four-question form there would tank completion.
 * The API stores whatever it gets; the extra fields are nullable.
 *
 * `source` must be one of app/api/waitlist/route.ts's VALID_SOURCES.
 * Every CTA that could plausibly identify a real recipient or
 * pass-through org from an org page still routes into sign-in /
 * /portfolio instead of this form — see that allowlist's comment and
 * app/single-audit/[ein]/page.tsx. 'generate-draft-cta'
 * (app/dashboard/page.tsx) is unrelated feature-demand capture, not a
 * founding signal, and keeps the generic success copy.
 *
 * `variant` controls text color only (light vs dark background).
 */
export function WaitlistForm({
  source,
  ein,
  ctaLabel = 'Request Founding Access',
  className = '',
  variant = 'dark',
  defaultEmail = '',
  qualifying = false,
}: {
  source: 'homepage-cta-band' | 'generate-draft-cta' | 'pricing-page';
  ein?: string;
  ctaLabel?: string;
  className?: string;
  variant?: 'dark' | 'light';
  // Prefills (but doesn't lock) the email field for a caller that
  // already knows a real address — app/dashboard/page.tsx passes the
  // signed-in Google session's email here. Deliberately NOT the guest
  // identity (a guest-xxx@anonymous.local string) even though the
  // dashboard always has *some* identity — nobody can be followed up
  // with at that address, so leaving the field blank for a guest is
  // more correct than prefilling something useless.
  defaultEmail?: string;
  qualifying?: boolean;
}) {
  const isLight = variant === 'light';
  const isFeatureDemand = source === 'generate-draft-cta';
  const [email, setEmail] = useState(defaultEmail);

  // useState(defaultEmail) alone only takes effect on the very first
  // render — the dashboard's useSession() can still be resolving (async)
  // at the moment this form mounts, so defaultEmail may arrive as ''
  // and then become a real email a tick later. Re-syncs when that
  // happens; harmless no-op once the visitor has actually typed
  // something, since defaultEmail itself doesn't change after that.
  useEffect(() => {
    if (defaultEmail) setEmail(defaultEmail);
  }, [defaultEmail]);
  const [segment, setSegment] = useState<Segment | ''>('');
  const [organization, setOrganization] = useState('');
  const [interest, setInterest] = useState<InterestLevel | ''>('');
  const [orgCount, setOrgCount] = useState<OrgCount | ''>('');
  const [method, setMethod] = useState<CurrentMethod | ''>('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [error, setError] = useState('');
  const [started, setStarted] = useState(false);

  // First interaction only — not per keystroke. Pairs with
  // EVENT_FOUNDING_SUBMIT for a start→finish completion rate.
  const markStarted = () => {
    if (started) return;
    setStarted(true);
    track(EVENT_FOUNDING_FORM_START, { source });
  };

  const clearErrorState = () => {
    if (status === 'error') {
      setStatus('idle');
      setError('');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!segment) {
      setError('Please choose which best describes your role.');
      setStatus('error');
      return;
    }
    if (qualifying && !interest) {
      setError('Please choose which best describes your interest.');
      setStatus('error');
      return;
    }
    if (qualifying && !orgCount) {
      setError('Please choose roughly how many organizations you need to monitor.');
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
        body: JSON.stringify({
          email,
          source,
          ein,
          segment,
          organization: qualifying && organization.trim() ? organization.trim() : undefined,
          interest: qualifying ? interest : undefined,
          orgCount: qualifying ? orgCount : undefined,
          method: qualifying && method ? method : undefined,
          referrer: document.referrer,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || 'Something went wrong. Try again.');
        setStatus('error');
        return;
      }

      setStatus('success');
      // Buckets only — never the email. See lib/analytics-events.ts.
      track(EVENT_FOUNDING_SUBMIT, {
        role: segment,
        ...(qualifying ? { interest, orgCount } : {}),
      });
    } catch {
      setError('Could not reach the server. Try again.');
      setStatus('error');
    }
  };

  if (status === 'success') {
    if (isFeatureDemand) {
      return (
        <p className={`text-sm font-semibold ${isLight ? 'text-gray-900' : 'text-white'} ${className}`}>
          Thanks — we&apos;ve got your details. We&apos;ll follow up soon.
        </p>
      );
    }
    return (
      <div className={`text-left ${className}`}>
        <p className={`text-sm font-semibold ${isLight ? 'text-gray-900' : 'text-white'}`}>
          You&apos;re on the Founding Customer list.
        </p>
        <p className={`text-sm mt-1 ${isLight ? 'text-gray-700' : 'text-white/80'}`}>
          We&apos;ll review your use case and email you to set up a conversation. What happens
          next:
        </p>
        <ol
          className={`text-sm mt-2 space-y-1 list-decimal list-outside pl-5 ${
            isLight ? 'text-gray-700' : 'text-white/80'
          }`}
        >
          <li>We learn which organizations you need to monitor.</li>
          <li>We give you a walkthrough of the monitoring service.</li>
          <li>If it&apos;s a fit, we get your founding subscription started.</li>
          <li>You get the founding rate locked in and a say in the roadmap.</li>
        </ol>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} onFocusCapture={markStarted} className={`text-left ${className}`}>
      <fieldset className="mb-3">
        <legend className={`text-sm font-semibold mb-2 ${isLight ? 'text-gray-900' : 'text-white'}`}>
          Which best describes your role?
        </legend>
        <div className="space-y-1.5">
          {SEGMENT_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className={`flex items-center gap-2 text-sm cursor-pointer ${isLight ? 'text-gray-700' : 'text-white/80'}`}
            >
              <input
                type="radio"
                name="segment"
                value={opt.value}
                checked={segment === opt.value}
                onChange={() => {
                  setSegment(opt.value);
                  clearErrorState();
                }}
                required
                className={`accent-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${isLight ? 'focus-visible:outline-accent' : 'focus-visible:outline-white'}`}
              />
              {opt.label}
            </label>
          ))}
        </div>
      </fieldset>

      {qualifying && (
        <>
          <div className="mb-3">
            <label
              htmlFor="founding-organization"
              className={`block text-sm font-semibold mb-2 ${isLight ? 'text-gray-900' : 'text-white'}`}
            >
              Organization{' '}
              <span className={`font-normal ${isLight ? 'text-gray-500' : 'text-white/60'}`}>
                (optional)
              </span>
            </label>
            <input
              id="founding-organization"
              type="text"
              value={organization}
              onChange={(e) => {
                setOrganization(e.target.value);
                clearErrorState();
              }}
              placeholder="Your organization or firm"
              maxLength={200}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>

          <fieldset className="mb-3">
            <legend className={`text-sm font-semibold mb-2 ${isLight ? 'text-gray-900' : 'text-white'}`}>
              Which best describes your interest?
            </legend>
            <div className="space-y-1.5">
              {INTEREST_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className={`flex items-center gap-2 text-sm cursor-pointer ${isLight ? 'text-gray-700' : 'text-white/80'}`}
                >
                  <input
                    type="radio"
                    name="interest"
                    value={opt.value}
                    checked={interest === opt.value}
                    onChange={() => {
                      setInterest(opt.value);
                      clearErrorState();
                    }}
                    required
                    className={`accent-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${isLight ? 'focus-visible:outline-accent' : 'focus-visible:outline-white'}`}
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="mb-3">
            <legend className={`text-sm font-semibold mb-2 ${isLight ? 'text-gray-900' : 'text-white'}`}>
              Roughly how many organizations do you need to monitor?
            </legend>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
              {ORG_COUNT_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className={`flex items-center gap-2 text-sm cursor-pointer ${isLight ? 'text-gray-700' : 'text-white/80'}`}
                >
                  <input
                    type="radio"
                    name="orgCount"
                    value={opt.value}
                    checked={orgCount === opt.value}
                    onChange={() => {
                      setOrgCount(opt.value);
                      clearErrorState();
                    }}
                    required
                    className={`accent-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${isLight ? 'focus-visible:outline-accent' : 'focus-visible:outline-white'}`}
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="mb-3">
            <legend className={`text-sm font-semibold mb-2 ${isLight ? 'text-gray-900' : 'text-white'}`}>
              How do you track this today?{' '}
              <span className={`font-normal ${isLight ? 'text-gray-500' : 'text-white/60'}`}>
                (optional)
              </span>
            </legend>
            <div className="space-y-1.5">
              {METHOD_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className={`flex items-center gap-2 text-sm cursor-pointer ${isLight ? 'text-gray-700' : 'text-white/80'}`}
                >
                  <input
                    type="radio"
                    name="method"
                    value={opt.value}
                    checked={method === opt.value}
                    onChange={() => {
                      setMethod(opt.value);
                      clearErrorState();
                    }}
                    className={`accent-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${isLight ? 'focus-visible:outline-accent' : 'focus-visible:outline-white'}`}
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </fieldset>
        </>
      )}

      {/* Real label, not just placeholder+aria-label — a placeholder
          disappears the moment someone starts typing, which leaves a
          sighted user unsure what the field wanted once it's no longer
          empty. aria-label alone covers assistive tech but not this. */}
      <label
        htmlFor="early-access-email"
        className={`block text-sm font-semibold mb-2 ${isLight ? 'text-gray-900' : 'text-white'}`}
      >
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
      {status === 'error' && (
        <p className={`text-xs mt-2 ${isLight ? 'text-red-600' : 'text-red-300'}`}>{error}</p>
      )}
      <p className={`text-xs mt-2 ${isLight ? 'text-gray-500' : 'text-white/60'}`}>
        We&apos;ll only use this to follow up about the Founding Customer Program — never shared,
        never sold.
      </p>
    </form>
  );
}
