import Link from 'next/link';
import { Metadata } from 'next';
import { SITE_URL } from '@/lib/site-url';
import { Footer } from '@/app/footer';

const title = 'Single Audit Compliance Guide';
const description =
  'Plain-language explanations of Single Audit compliance obligations under 2 CFR 200 — subrecipient monitoring, management decision deadlines, and the full compliance calendar.';

export const metadata: Metadata = {
  title: `${title} | Single Audit Intelligence`,
  description,
  alternates: { canonical: `${SITE_URL}/guide` },
  openGraph: {
    title: `${title} | Single Audit Intelligence`,
    description,
    type: 'website',
    url: `${SITE_URL}/guide`,
  },
};

const guides = [
  {
    href: '/guide/compliance-requirements',
    title: 'Compliance Requirements (A–P)',
    description:
      "What each compliance requirement letter on a Single Audit finding means — every finding on this site links here for its category, letter by letter.",
  },
  {
    href: '/guide/subrecipient-monitoring',
    title: 'Subrecipient Monitoring (2 CFR 200.332)',
    description:
      "What a pass-through entity must do for every subrecipient it funds: the 14 required subaward data elements, risk assessment, ongoing monitoring, and verifying the subrecipient's audit actually happened.",
  },
  {
    href: '/guide/management-decisions',
    title: 'Management Decision Deadlines (2 CFR 200.521)',
    description:
      'The six-month clock that starts the moment the FAC accepts an audit report — and why almost nobody is actually tracking it.',
  },
  {
    href: '/guide/compliance-calendar',
    title: 'Single Audit Compliance Calendar',
    description:
      'Every deadline in one place: audit due date, FAC submission, the management-decision clock, and record retention — each tied to its CFR section.',
  },
];

export default function GuideIndexPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
          <div className="mb-4">
            <Link href="/" className="text-blue-600 hover:text-blue-800 text-sm">
              ← Back to home
            </Link>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">{title}</h1>
          <p className="text-gray-600">{description}</p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        <div className="space-y-4">
          {guides.map((g) => (
            <Link
              key={g.href}
              href={g.href}
              className="block bg-white p-6 rounded-lg border border-gray-200 hover:border-blue-300 hover:shadow-sm transition"
            >
              <h2 className="text-lg font-bold text-gray-900 mb-2">{g.title}</h2>
              <p className="text-sm text-gray-600">{g.description}</p>
            </Link>
          ))}
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mt-8">
          <p className="text-sm text-blue-900 mb-3">
            Looking at more than one organization?{' '}
            <Link href="/portfolio" className="underline font-semibold hover:text-blue-700">
              The portfolio view
            </Link>{' '}
            shows findings and management-decision deadlines across a pasted list of EINs at
            once — no login required.
          </p>
          <p className="text-sm text-blue-900">
            These guides explain regulatory obligations under 2 CFR 200 (the OMB Uniform
            Guidance). They are independent explanations, not legal advice and not an official
            publication of OMB, GSA, or any federal agency — verify anything that matters against{' '}
            <a
              href="https://www.ecfr.gov/current/title-2/subtitle-A/chapter-II/part-200"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold hover:text-blue-700"
            >
              the current text at eCFR.gov
            </a>
            .
          </p>
        </div>
      </div>

      <Footer />
    </div>
  );
}
