import Link from 'next/link';
import { Metadata } from 'next';
import { SITE_URL } from '@/lib/site-url';
import { REQUIREMENT_LETTER_ORDER, REQUIREMENT_INFO } from '@/lib/compliance-requirements';

const title = 'Single Audit Compliance Requirements (A–N)';
const description =
  "What each compliance requirement letter on a Single Audit finding means — the FAC's own category codes, explained in plain language.";

export const metadata: Metadata = {
  title: `${title} | Single Audit Intelligence`,
  description,
  alternates: { canonical: `${SITE_URL}/guide/compliance-requirements` },
  openGraph: {
    title: `${title} | Single Audit Intelligence`,
    description,
    type: 'article',
    url: `${SITE_URL}/guide/compliance-requirements`,
  },
};

interface Section {
  letter: string;
  summary: string;
  extra?: React.ReactNode;
}

const sections: Section[] = [
  {
    letter: 'A',
    summary:
      "Whether the recipient spent federal funds only on activities the specific program actually authorizes — money awarded for one purpose used for another.",
  },
  {
    letter: 'B',
    summary:
      'Whether costs charged to the federal award meet the cost principles in 2 CFR 200 Subpart E — reasonable, allocable to the award, and treated consistently with the recipient\'s other costs.',
  },
  {
    letter: 'C',
    summary:
      "Whether the recipient minimized the time between drawing down federal funds and actually spending them, rather than holding federal cash longer than needed.",
  },
  {
    letter: 'E',
    summary:
      'Whether the recipient provided funds, services, or benefits only to the individuals or groups the program rules actually allow.',
  },
  {
    letter: 'F',
    summary:
      'Whether equipment and real property bought with federal funds were tracked, used for their intended purpose, and disposed of according to the program\'s rules.',
  },
  {
    letter: 'G',
    summary:
      "Whether the recipient met a required non-federal matching contribution, sustained a required level of program activity, or kept spending on specific elements within required minimums or maximums.",
  },
  {
    letter: 'H',
    summary: "Whether costs were incurred only within the award's authorized start and end dates.",
  },
  {
    letter: 'I',
    summary:
      'Whether the recipient followed required procurement standards, and verified that contractors and — where the recipient is itself a pass-through entity — subrecipients were not suspended or debarred from federal work.',
  },
  {
    letter: 'J',
    summary:
      "Whether income the recipient earned from federally funded activities (fees, sale of items produced under the award, and similar) was accounted for and used according to the program's rules.",
  },
  {
    letter: 'L',
    summary:
      'Whether the recipient submitted accurate, complete, and timely financial and performance reports required by the federal award.',
  },
  {
    letter: 'M',
    summary:
      "Whether a pass-through entity met its obligations under 2 CFR 200.332 for every subrecipient it funded — subaward information, risk assessment, ongoing monitoring, and verifying the subrecipient was actually audited.",
    extra: (
      <Link
        href="/guide/subrecipient-monitoring"
        className="text-blue-600 underline hover:text-blue-800 text-sm font-semibold"
      >
        Full treatment of this requirement →
      </Link>
    ),
  },
  {
    letter: 'N',
    summary:
      "Program-specific compliance requirements that don't fit the categories above — set by the individual federal program rather than by 2 CFR 200 itself, so what this actually covers varies award to award.",
  },
  {
    letter: 'P',
    summary: "A finding the auditor tagged as not fitting any of the categories above.",
  },
];

export default function ComplianceRequirementsGuide() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
          <div className="mb-4">
            <Link href="/guide" className="text-blue-600 hover:text-blue-800 text-sm">
              ← Back to guides
            </Link>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">{title}</h1>
          <p className="text-gray-600">{description}</p>
        </div>
      </div>

      <article className="max-w-3xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        <div className="bg-white p-6 rounded-lg border border-gray-200 mb-6">
          <p className="text-gray-800 leading-relaxed">
            Every Single Audit finding the FAC publishes is tagged with one or more of these
            letters — <code className="text-sm bg-gray-100 px-1 rounded">type_requirement</code>{' '}
            in the FAC's own data. A finding tagged just a bare letter on an org page doesn't tell
            you much on its own; this page is what each letter actually means. Letters D, K, and O
            aren't used — D and K are reserved (retired categories), and O is explicitly invalid
            in the FAC's own submission system.
          </p>
        </div>

        <div className="space-y-6">
          {REQUIREMENT_LETTER_ORDER.map((letter) => {
            const section = sections.find((s) => s.letter === letter)!;
            const info = REQUIREMENT_INFO[letter];
            return (
              <div
                key={letter}
                id={info.slug}
                className="bg-white p-6 rounded-lg border border-gray-200 scroll-mt-4"
              >
                <h2 className="text-lg font-bold text-gray-900 mb-2">
                  <span className="font-mono text-blue-600 mr-2">{letter}</span>
                  {info.name}
                </h2>
                <p className="text-gray-700 leading-relaxed mb-2">{section.summary}</p>
                {section.extra}
              </div>
            );
          })}
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mt-8">
          <p className="text-sm text-blue-900">
            Looking at findings across more than one organization?{' '}
            <Link href="/portfolio" className="underline font-semibold hover:text-blue-700">
              The portfolio view
            </Link>{' '}
            shows findings, repeat-finding counts, and management-decision deadlines across a
            list of EINs at once.
          </p>
        </div>

        <div className="bg-gray-100 border border-gray-200 rounded-lg p-6 mt-6">
          <p className="text-sm text-gray-700">
            <strong>Not legal advice.</strong> These are plain-language summaries, not the
            regulatory text itself. The compliance requirements are set out in detail in{' '}
            <a
              href="https://www.fac.gov/compliance/"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold hover:text-gray-900"
            >
              OMB's Compliance Supplement
            </a>{' '}
            and, for cost principles specifically, in{' '}
            <a
              href="https://www.ecfr.gov/current/title-2/subtitle-A/chapter-II/part-200"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold hover:text-gray-900"
            >
              2 CFR Part 200
            </a>
            .
          </p>
        </div>
      </article>

      <div className="bg-gray-100 border-t border-gray-200 py-6 mt-8">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-xs text-gray-600">
            Single Audit Intelligence is an independent tool powered by Federal Audit
            Clearinghouse data. Not affiliated with GSA, OMB, or any federal agency.
          </p>
        </div>
      </div>
    </div>
  );
}
