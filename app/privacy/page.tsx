import Link from 'next/link';
import { Metadata } from 'next';
import { SITE_URL } from '@/lib/site-url';
import { Footer } from '@/app/footer';

const title = 'Privacy Policy';
const description = 'How Single Audit Intelligence handles data.';

export const metadata: Metadata = {
  title: `${title} | Single Audit Intelligence`,
  description,
  alternates: { canonical: `${SITE_URL}/privacy` },
};

export default function PrivacyPage() {
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
            grow into a complete privacy policy as the product does; in the meantime, here's
            the plain-language version of where things stand.
          </p>
          <h2 className="text-lg font-bold text-gray-900 mt-6 mb-2">Public audit data</h2>
          <p className="text-gray-700 leading-relaxed mb-4">
            Organization names, EINs, UEIs, audit findings, and corrective action plan text
            shown on this site come directly from the Federal Audit Clearinghouse — all of it
            is already public record, published by the federal government. We don't add,
            infer, or publish anything about an organization beyond what the FAC itself
            already discloses.
          </p>
          <h2 className="text-lg font-bold text-gray-900 mt-6 mb-2">
            Account &amp; Founding Customer information
          </h2>
          <p className="text-gray-700 leading-relaxed mb-4">
            If you sign in or request Founding Customer access, we store the email address you
            provide and, where relevant, which organization or page you were interested in and
            the answers you give on the form (your role, how many organizations you monitor, and
            how you track them today). We use this to follow up about the product and, for
            signed-in accounts, to save your tracked findings and corrective action items. We
            don't sell this information or share it with third parties for marketing.
          </p>
          <h2 className="text-lg font-bold text-gray-900 mt-6 mb-2">Analytics</h2>
          <p className="text-gray-700 leading-relaxed">
            We use privacy-respecting, cookie-free analytics (Vercel Analytics and Speed
            Insights) to understand traffic patterns and page performance. This doesn't track
            you individually across sites.
          </p>
        </div>

        <div className="bg-gray-100 border border-gray-200 rounded-lg p-6">
          <p className="text-sm text-gray-700">
            Questions about your data? Email{' '}
            <a href="mailto:contact@singleauditintel.com" className="underline font-semibold hover:text-gray-900">
              contact@singleauditintel.com
            </a>
            .
          </p>
        </div>
      </article>

      <Footer />
    </div>
  );
}
