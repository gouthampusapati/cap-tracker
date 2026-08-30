import Link from 'next/link';
import { Metadata } from 'next';
import { SITE_URL } from '@/lib/site-url';
import { Footer } from '@/app/footer';

const title = 'Contact';
const description =
  'How to reach Single Audit Intelligence — general inquiries, product support, and data-correction requests.';

export const metadata: Metadata = {
  title: `${title} | Single Audit Intelligence`,
  description,
  alternates: { canonical: `${SITE_URL}/contact` },
  openGraph: { title: `${title} | Single Audit Intelligence`, description, type: 'website', url: `${SITE_URL}/contact` },
};

function Card({
  heading,
  email,
  children,
}: {
  heading: string;
  email: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5">
      <h2 className="text-lg font-bold text-gray-900 mb-1">{heading}</h2>
      <p className="text-sm text-gray-700 mb-3">{children}</p>
      <a
        href={`mailto:${email}`}
        className="text-blue-600 hover:text-blue-800 font-semibold text-sm"
      >
        {email}
      </a>
    </div>
  );
}

export default function ContactPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
          <Link href="/" className="text-blue-600 hover:text-blue-800 text-sm">
            ← Back to home
          </Link>
          <h1 className="text-3xl font-bold text-gray-900 mt-3">{title}</h1>
          <p className="text-gray-600 mt-2">
            Email is the fastest way to reach us. We read every message and usually reply within
            two business days.
          </p>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-8 sm:px-6 lg:px-8 space-y-4">
        <Card heading="General inquiries" email="contact@singleauditintel.com">
          Questions about the site, feedback, partnership or press, and anything about the
          Founding Customer Program.
        </Card>

        <Card heading="Product support" email="support@singleauditintel.com">
          Something not working, a page that won&apos;t load, a question about how to use the
          portfolio or dashboard, or an account issue.
        </Card>

        <Card heading="Data corrections" email="contact@singleauditintel.com">
          If a figure or finding looks wrong, it is almost certainly wrong in the underlying
          Federal Audit Clearinghouse filing — this site mirrors FAC, it isn&apos;t the source
          of record. Corrections are made at the{' '}
          <a
            href="https://www.fac.gov"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:text-blue-800 underline"
          >
            FAC
          </a>{' '}
          by the auditee or auditor via resubmission, and flow here on the next refresh. If you
          think we&apos;re misrepresenting a filing we received correctly, tell us and
          we&apos;ll look into it.
        </Card>

        <p className="text-sm text-gray-500 pt-2">
          Single Audit Intelligence is an independent tool and is not affiliated with any
          federal agency or audit firm. See{' '}
          <Link href="/about" className="text-blue-600 hover:text-blue-800 underline">
            About
          </Link>{' '}
          for how the data is sourced.
        </p>
      </div>

      <Footer />
    </div>
  );
}
