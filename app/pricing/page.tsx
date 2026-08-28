import Link from 'next/link';
import { Metadata } from 'next';
import { SITE_URL } from '@/lib/site-url';
import { Footer } from '@/app/footer';
import { WaitlistForm } from '@/app/waitlist-form';

const title = 'Pricing';
const description =
  'Single Audit Intelligence is free to search: organization findings, portfolio monitoring, the auditor directory, and the compliance guide. The Single Audit Watchlist — continuous subrecipient monitoring with alerts — is in early access.';

export const metadata: Metadata = {
  title: `${title} — Free Search + Single Audit Watchlist | Single Audit Intelligence`,
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

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
          <Link href="/" className="text-blue-600 hover:text-blue-800 text-sm">
            ← Back to home
          </Link>
          <h1 className="text-3xl font-bold text-gray-900 mt-3">Pricing</h1>
          <p className="text-gray-600 mt-2 max-w-2xl">
            Everything you can search on this site today is free and needs no account. The one
            paid product — the Single Audit Watchlist — is in early access.
          </p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        <div className="grid md:grid-cols-2 gap-6">
          {/* Free */}
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <h2 className="text-xl font-bold text-gray-900">Search</h2>
            <p className="text-2xl font-bold text-gray-900 mt-2">
              Free <span className="text-sm font-normal text-gray-500">· no account</span>
            </p>
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

          {/* Watchlist */}
          <div className="bg-white border-2 border-blue-300 rounded-lg p-6">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-gray-900">Single Audit Watchlist</h2>
              <span className="text-xs font-bold uppercase tracking-wide text-blue-700 bg-blue-50 border border-blue-200 rounded-full px-2 py-0.5">
                Early access
              </span>
            </div>
            <p className="text-2xl font-bold text-gray-900 mt-2">
              Pricing TBD
              <span className="block text-sm font-normal text-gray-500 mt-1">
                Early-access users help set it.
              </span>
            </p>
            <p className="text-sm text-gray-700 mt-4">
              Continuous monitoring for pass-through entities. Track up to 100 named
              subrecipients and get alerted when:
            </p>
            <ul className="mt-3 space-y-2 text-sm text-gray-700">
              {[
                'A new FAC audit is accepted for a subrecipient you monitor',
                'A new finding appears',
                'A management-decision deadline is approaching',
              ].map((f) => (
                <li key={f} className="flex gap-2">
                  <Check />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <p className="text-sm text-gray-700 mt-3">
              Plus a monthly portfolio exception report you can hand to leadership.
            </p>
            <div className="mt-6">
              <p className="font-semibold text-gray-900 mb-3 text-sm">Join the early-access list</p>
              <WaitlistForm source="pricing-page" variant="light" />
            </div>
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mt-8 text-sm text-blue-900">
          <strong>Why is the Watchlist not priced yet?</strong> Billing isn&apos;t live. The
          monitoring backend is being built with early-access users so the alerts and the
          exception report match what pass-through compliance teams actually need. If that&apos;s
          you, the list above is the way in — or email{' '}
          <a
            href="mailto:contact@singleauditintel.com"
            className="underline font-semibold hover:text-blue-700"
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
