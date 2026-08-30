import Link from 'next/link';
import { Metadata } from 'next';
import { SITE_URL } from '@/lib/site-url';
import { Footer } from '@/app/footer';
import { WaitlistForm } from '@/app/waitlist-form';
import { PricingViewTracker } from './pricing-view-tracker';

const title = 'Pricing';
const description =
  'Single Audit Intelligence is free to research: organization findings, portfolio view, the auditor directory, and the compliance guide. Continuous monitoring of the Federal Audit Clearinghouse — new-audit, new-finding and deadline alerts — is the paid product, now onboarding founding customers.';

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
            <strong>Stop checking. Start monitoring.</strong> Everything you can research on this
            site is free and needs no account. The paid product is continuous monitoring of the
            Federal Audit Clearinghouse — we&apos;re onboarding a limited number of founding
            customers now.
          </p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        <div className="grid md:grid-cols-2 gap-6">
          {/* Free */}
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <h2 className="text-xl font-bold text-gray-900">Research</h2>
            <p className="text-2xl font-bold text-gray-900 mt-2">
              Free <span className="text-sm font-normal text-gray-500">· no account</span>
            </p>
            <p className="text-sm text-gray-600 mt-2">Look anything up, as often as you want.</p>
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

          {/* Monitoring — Founding Customer Program */}
          <div id="founding" className="bg-white border-2 border-blue-300 rounded-lg p-6 scroll-mt-6">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-gray-900">Monitoring</h2>
              <span className="text-xs font-bold uppercase tracking-wide text-blue-700 bg-blue-50 border border-blue-200 rounded-full px-2 py-0.5">
                Founding Customer Program
              </span>
            </div>
            <p className="text-2xl font-bold text-gray-900 mt-2">
              From $750/mo
              <span className="block text-sm font-normal text-gray-500 mt-1">
                Founding pilot · billed quarterly · credits toward an annual plan
              </span>
            </p>
            <p className="text-sm text-gray-700 mt-4">
              Keep the organizations that matter to you in one watchlist — up to 100 named
              organizations — and let Single Audit Intel watch the Federal Audit Clearinghouse
              for you. Get alerted when:
            </p>
            <ul className="mt-3 space-y-2 text-sm text-gray-700">
              {[
                'A new FAC audit is accepted for an organization you monitor',
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
              <p className="font-semibold text-gray-900 mb-3 text-sm">Request founding access</p>
              <WaitlistForm source="pricing-page" variant="light" qualifying />
            </div>
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mt-8 text-sm text-blue-900">
          <strong>Why isn&apos;t there a public price list yet?</strong> We&apos;re onboarding a
          limited number of founding customers to shape the alerts and the exception report
          around what compliance teams actually need — and to set pricing with real usage behind
          it. Founding customers get founding rates locked in and a say in the roadmap. If
          that&apos;s you, the form above is the way in — or email{' '}
          <a
            href="mailto:contact@singleauditintel.com"
            className="underline font-semibold hover:text-blue-700"
          >
            contact@singleauditintel.com
          </a>
          .
        </div>

        <p className="text-xs text-gray-500 mt-4">
          The data itself is free and public — it lives at the Federal Audit Clearinghouse.
          Researching it here stays free. Remembering it and watching it for you is the product.
        </p>
      </div>

      <Footer />
    </div>
  );
}
