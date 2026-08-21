import Link from 'next/link';
import { Metadata } from 'next';
import { SITE_URL } from '@/lib/site-url';
import { Footer } from '@/app/footer';

const title = 'Terms of Use';
const description = 'Terms for using Single Audit Intelligence.';

export const metadata: Metadata = {
  title: `${title} | Single Audit Intelligence`,
  description,
  alternates: { canonical: `${SITE_URL}/terms` },
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
          <div className="mb-4">
            <Link href="/" className="text-blue-600 hover:text-blue-800 text-sm">
              ← Back to home
            </Link>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">{title}</h1>
        </div>
      </div>

      <article className="max-w-3xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        <div className="bg-white p-6 rounded-lg border border-gray-200 mb-6">
          <p className="text-gray-800 leading-relaxed mb-4">
            Single Audit Intelligence is an early, actively developed product. This page will
            grow into complete terms of use as the product does; in the meantime, here's the
            plain-language version.
          </p>
          <h2 className="text-lg font-bold text-gray-900 mt-6 mb-2">What this site is</h2>
          <p className="text-gray-700 leading-relaxed mb-4">
            An independent tool that makes public Federal Audit Clearinghouse data easier to
            search and read. It is not affiliated with GSA, OMB, or any federal agency, and
            nothing on this site is legal, compliance, or audit advice.
          </p>
          <h2 className="text-lg font-bold text-gray-900 mt-6 mb-2">Verify before relying on anything</h2>
          <p className="text-gray-700 leading-relaxed mb-4">
            All audit findings and corrective action plan text should be verified directly at{' '}
            <a
              href="https://app.fac.gov/dissemination/search/"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold text-blue-600 hover:text-blue-800"
            >
              fac.gov
            </a>{' '}
            before you rely on it for anything that matters — a compliance decision, a funding
            decision, or anything you'd want to be able to point back to an authoritative
            source for.
          </p>
          <h2 className="text-lg font-bold text-gray-900 mt-6 mb-2">No warranty</h2>
          <p className="text-gray-700 leading-relaxed">
            This site is provided as-is, without warranty of any kind, while it's under active
            development. Features, including the account/tracking functionality reachable
            through "Sign in," may change as we build based on early user feedback.
          </p>
        </div>

        <div className="bg-gray-100 border border-gray-200 rounded-lg p-6">
          <p className="text-sm text-gray-700">
            Questions? Reach out via the{' '}
            <a href="mailto:hello@singleauditintel.com" className="underline font-semibold hover:text-gray-900">
              contact address
            </a>{' '}
            in the footer.
          </p>
        </div>
      </article>

      <Footer />
    </div>
  );
}
