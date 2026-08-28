import Link from 'next/link';
import { Metadata } from 'next';
import { SITE_URL } from '@/lib/site-url';
import { Footer } from '@/app/footer';

const description =
  'What Single Audit Intelligence is, where its data comes from, how current it is, and who maintains it. An independent tool built on public Federal Audit Clearinghouse data.';

export const metadata: Metadata = {
  title: 'About | Single Audit Intelligence',
  description,
  alternates: { canonical: `${SITE_URL}/about` },
  openGraph: { title: 'About Single Audit Intelligence', description, type: 'website', url: `${SITE_URL}/about` },
};

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">{children}</h2>;
}

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
          <Link href="/" className="text-blue-600 hover:text-blue-800 text-sm">
            ← Back to home
          </Link>
          <h1 className="text-3xl font-bold text-gray-900 mt-3">About Single Audit Intelligence</h1>
        </div>
      </div>

      <article className="max-w-3xl mx-auto px-4 py-8 sm:px-6 lg:px-8 text-gray-700 leading-relaxed">
        <p className="text-lg text-gray-800">
          Single Audit Intelligence makes the Federal Audit Clearinghouse (FAC) usable. The
          FAC holds every Single Audit filed under the Uniform Guidance (2 CFR 200 Subpart F),
          but its search is built for finding one report at a time. This site turns that same
          public data into something you can actually monitor: audit findings and corrective
          action plans by organization, a portfolio view across many subrecipients at once,
          management-decision deadlines, federal award detail, and a directory of the CPA
          firms that perform these audits.
        </p>

        <H2>Who it&apos;s for</H2>
        <ul className="list-disc pl-6 space-y-1.5">
          <li>
            <strong>Pass-through entities</strong> (states, cities, universities, foundations)
            monitoring the subrecipients they fund — 2 CFR 200.332 requires it.
          </li>
          <li>
            <strong>Organizations preparing for their own Single Audit</strong>, checking prior
            findings and what a repeat finding would mean.
          </li>
          <li>
            <strong>Anyone choosing or vetting a Single Audit firm</strong> — see the{' '}
            <Link href="/auditors" className="text-blue-600 hover:text-blue-800 underline">
              auditor directory
            </Link>
            .
          </li>
        </ul>

        <H2>Where the data comes from</H2>
        <p>
          Everything on this site — organization names, EINs, UEIs, findings, corrective action
          plans, federal award schedules, auditor names and contact details — comes directly
          from the{' '}
          <a
            href="https://www.fac.gov"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:text-blue-800 underline"
          >
            Federal Audit Clearinghouse
          </a>
          . All of it is public record, published by the federal government. We don&apos;t add
          to it, score it, or editorialize about named organizations — the site describes what
          the filings say, and every page links back to the original record at fac.gov so you
          can verify it.
        </p>

        <H2>How current it is</H2>
        <p>
          Most lookups are served from a local mirror of FAC&apos;s complete bulk data export,
          refreshed weekly. When an organization is within roughly two months of its own filing
          deadline (nine months after fiscal year-end, per 2 CFR 200.512), the site fetches
          that record live from FAC&apos;s API instead, so a just-accepted audit shows up
          without waiting for the next mirror sync. Award-level detail and a few smaller fields
          are always fetched live on demand. Each page shows the date its data was last
          refreshed.
        </p>

        <H2>Who maintains it</H2>
        <p>
          Single Audit Intelligence is independently built and maintained. It is{' '}
          <strong>not affiliated with</strong> the U.S. General Services Administration, the
          Office of Management and Budget, the Federal Audit Clearinghouse, or any federal
          agency, and it is not affiliated with any audit firm listed in the directory.
        </p>
        <p className="mt-3">
          Questions, corrections, or feedback:{' '}
          <a href="mailto:contact@singleauditintel.com" className="text-blue-600 hover:text-blue-800 underline">
            contact@singleauditintel.com
          </a>
          . Help with the tool itself:{' '}
          <a href="mailto:support@singleauditintel.com" className="text-blue-600 hover:text-blue-800 underline">
            support@singleauditintel.com
          </a>
          .
        </p>

        <H2>Correcting the data</H2>
        <p>
          If something on a page is wrong, it is almost certainly wrong in the underlying FAC
          filing — this site is a mirror, not a source of record. Corrections have to be made
          at the FAC (by the auditee or auditor, through a resubmission); once FAC accepts the
          change, it flows here on the next refresh. If you believe this site is
          misrepresenting a filing it received correctly, email{' '}
          <a href="mailto:contact@singleauditintel.com" className="text-blue-600 hover:text-blue-800 underline">
            contact@singleauditintel.com
          </a>{' '}
          and we&apos;ll look into it.
        </p>

        <div className="mt-10 flex flex-wrap gap-x-5 gap-y-2 text-sm">
          <Link href="/faq" className="text-blue-600 hover:text-blue-800 font-semibold">
            FAQ →
          </Link>
          <Link href="/guide" className="text-blue-600 hover:text-blue-800 font-semibold">
            Compliance guide →
          </Link>
          <Link href="/contact" className="text-blue-600 hover:text-blue-800 font-semibold">
            Contact →
          </Link>
        </div>
      </article>

      <Footer />
    </div>
  );
}
