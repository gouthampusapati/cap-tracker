import Link from 'next/link';
import { Metadata } from 'next';
import { SITE_URL } from '@/lib/site-url';
import { Footer } from '@/app/footer';
import { WaitlistForm } from '@/app/waitlist-form';
import { PricingViewTracker } from './pricing-view-tracker';

const title = 'Pricing';
const description =
  'Single Audit Intelligence is free to research: organization findings, portfolio view, the auditor directory, and the compliance guide. Continuous monitoring of the Federal Audit Clearinghouse — new-audit, new-finding and management-decision-deadline alerts across a portfolio of up to 100 organizations — is the paid product: founding customers pay $3,600 for the first year (renewing at a locked $6,000/year), and a limited initial cohort is onboarding now.';

export const metadata: Metadata = {
  title: `${title} — Free Research + Founding Customer Program | Single Audit Intelligence`,
  description,
  alternates: { canonical: `${SITE_URL}/pricing` },
  openGraph: {
    title: `${title} | Single Audit Intelligence`,
    description,
    type: 'website',
    url: `${SITE_URL}/pricing`,
  },
};

function Check() {
  return (
    <svg className="h-4 w-4 shrink-0 text-green-600 mt-0.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
      <path
        fillRule="evenodd"
        d="M16.7 5.3a1 1 0 010 1.4l-8 8a1 1 0 01-1.4 0l-4-4a1 1 0 011.4-1.4L8 12.6l7.3-7.3a1 1 0 011.4 0z"
        clipRule="evenodd"
      />
    </svg>
  );
}

const ALERTS = [
  'A new FAC audit is accepted for a monitored organization',
  'A new audit finding appears',
  'A management-decision deadline is approaching',
];

const INCLUDED: { label: string; body: string }[] = [
  {
    label: 'Up to 100 monitored organizations',
    body: 'Keep your own organization, your subrecipients, or any other organizations you are responsible for in one monitored portfolio.',
  },
  {
    label: 'Continuous monitoring',
    body: "Single Audit Intel checks the Federal Audit Clearinghouse for relevant changes so your team doesn't have to keep searching it.",
  },
  {
    label: 'Actionable alerts',
    body: 'Know when a new audit, a new finding, or a management-decision deadline needs attention.',
  },
  {
    label: 'Monthly portfolio exception report',
    body: 'A consolidated summary of the organizations that need attention, in a format you can share with leadership.',
  },
  {
    label: 'Founding customer onboarding',
    body: 'We help configure your initial monitoring portfolio and make sure the service fits your workflow.',
  },
];

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <PricingViewTracker />
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
          <Link href="/" className="text-blue-600 hover:text-blue-800 text-sm">
            ← Back to home
          </Link>
          <h1 className="text-3xl font-bold text-gray-900 mt-3">Pricing</h1>
          <p className="text-gray-600 mt-2 max-w-2xl">
            <strong>Free to research. Paid to monitor.</strong> Everything you can look up on this
            site is free and needs no account. The paid product is continuous monitoring of the
            Federal Audit Clearinghouse across a portfolio of organizations. We&apos;re onboarding
            a limited initial cohort of founding customers now.
          </p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        <div className="grid md:grid-cols-2 gap-6 items-start">
          {/* Free — Research */}
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <h2 className="text-xl font-bold text-gray-900">Research</h2>
            <p className="text-2xl font-bold text-gray-900 mt-2">
              Free <span className="text-sm font-normal text-gray-500">· no account</span>
            </p>
            <p className="text-sm text-gray-600 mt-2">Find the information. Look anything up, as often as you want.</p>
            <ul className="mt-4 space-y-2 text-sm text-gray-700">
              {[
                'Every organization’s audit findings and corrective action plans',
                'Per-year opinions, going-concern and low-risk-auditee flags',
                'Federal award / SEFA detail and risk assessment',
                'Portfolio view — many EINs at once, with management-decision deadlines',
                'The full auditor-firm directory',
                'The compliance guide and calendar',
              ].map((f) => (
                <li key={f} className="flex gap-2">
                  <Check />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <div className="mt-6 flex gap-3">
              <Link
                href="/portfolio"
                className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-semibold px-4 py-2 rounded text-sm"
              >
                Open the portfolio
              </Link>
              <Link
                href="/auditors"
                className="inline-block border border-gray-300 hover:border-gray-400 text-gray-700 font-semibold px-4 py-2 rounded text-sm"
              >
                Auditor directory
              </Link>
            </div>
          </div>

          {/* Paid — Monitoring / Founding Customer Program */}
          <div id="founding" className="bg-white border-2 border-blue-300 rounded-lg p-6 scroll-mt-6">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-gray-900">Monitoring</h2>
              <span className="text-[11px] font-bold uppercase tracking-wide text-blue-700 bg-blue-50 border border-blue-200 rounded-full px-2 py-0.5">
                Founding Customer Program
              </span>
            </div>

            <p className="text-3xl font-bold text-gray-900 mt-3">
              $3,600 <span className="text-base font-semibold text-gray-500">first year</span>
            </p>
            <p className="text-sm text-gray-500 mt-1">
              Billed annually · about half off your first year
            </p>
            <p className="text-sm text-gray-500">
              Renews at $6,000/year — your founding rate, locked for as long as you stay
              subscribed.
            </p>

            <p className="text-base font-semibold text-gray-900 mt-5">
              Continuously monitor up to 100 organizations for Single Audit changes that need
              your attention.
            </p>
            <p className="text-sm text-gray-600 mt-2">
              Built for compliance, finance, and program teams responsible for more than one
              organization.
            </p>

            <p className="text-sm font-semibold text-gray-900 mt-5">
              Single Audit Intel watches the Federal Audit Clearinghouse for you — so your team
              doesn&apos;t have to keep checking it manually.
            </p>
            <p className="text-sm font-semibold text-gray-700 mt-4">Get alerted when:</p>
            <ul className="mt-2 space-y-2 text-sm text-gray-700">
              {ALERTS.map((f) => (
                <li key={f} className="flex gap-2">
                  <Check />
                  <span>{f}</span>
                </li>
              ))}
            </ul>

            <p className="mt-5 rounded-md bg-blue-50 border border-blue-200 px-3 py-2 text-sm font-semibold text-blue-900">
              The data is public. The monitoring is the service.
            </p>

            <a
              href="#founding-form"
              className="mt-5 block w-full text-center bg-accent hover:opacity-90 text-white font-semibold px-4 py-2.5 rounded-md text-sm"
            >
              Request Founding Access
            </a>
            <p className="text-xs text-gray-500 mt-2 text-center">
              Limited initial cohort · The form isn&apos;t a checkout — it starts a conversation.
            </p>
          </div>
        </div>

        {/* What's included — full width, detail is visually secondary to the card above */}
        <div className="bg-white border border-gray-200 rounded-lg p-6 mt-6">
          <h2 className="text-lg font-bold text-gray-900">What founding customers get</h2>
          <div className="grid sm:grid-cols-2 gap-x-8 gap-y-4 mt-4">
            {INCLUDED.map((item) => (
              <div key={item.label}>
                <p className="text-sm font-semibold text-gray-900">{item.label}</p>
                <p className="text-sm text-gray-600 mt-0.5">{item.body}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Request Founding Access form — the conversion action */}
        <div
          id="founding-form"
          className="bg-white border-2 border-blue-300 rounded-lg p-6 mt-6 scroll-mt-6"
        >
          <h2 className="text-lg font-bold text-gray-900">Request Founding Access</h2>
          <p className="text-sm text-gray-600 mt-1">
            This isn&apos;t a checkout. Tell us what you need to monitor and we&apos;ll set up a
            short call: we&apos;ll review your needs, walk you through the monitoring service, and
            &mdash; if it&apos;s a fit &mdash; get your founding subscription started. No payment
            or commitment to book the call.
          </p>
          <div className="mt-5 max-w-xl">
            <WaitlistForm source="pricing-page" variant="light" qualifying />
          </div>
          <p className="text-xs text-gray-500 mt-4 italic">
            Best suited for teams monitoring multiple organizations or subrecipients.
          </p>
        </div>

        <div className="bg-gray-50 border border-gray-200 rounded-lg p-5 mt-6 text-sm text-gray-700">
          <strong className="text-gray-900">What does &ldquo;founding customer&rdquo; mean?</strong>{' '}
          We&apos;re working with a limited initial cohort to shape the alerts and the exception
          report around what compliance teams actually need. In exchange, founding customers get
          roughly half off the first year, a renewal rate locked at $6,000/year for as long as
          they stay subscribed, and a direct say in the roadmap. Prefer email?{' '}
          <a
            href="mailto:contact@singleauditintel.com"
            className="underline font-semibold text-blue-700 hover:text-blue-800"
          >
            contact@singleauditintel.com
          </a>
          .
        </div>
      </div>

      <Footer />
    </div>
  );
}
