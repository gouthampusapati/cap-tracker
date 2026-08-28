import Link from 'next/link';
import { Metadata } from 'next';
import { SITE_URL } from '@/lib/site-url';
import { Footer } from '@/app/footer';

const title = 'Single Audit FAQ';
const description =
  'Plain answers to common questions about the Single Audit: who needs one, the $1 million threshold, the Federal Audit Clearinghouse, findings and repeat findings, and how to find an audit firm.';

export const metadata: Metadata = {
  title: `${title} — What It Is, Who Needs One | Single Audit Intelligence`,
  description,
  alternates: { canonical: `${SITE_URL}/faq` },
  openGraph: {
    title: `${title} | Single Audit Intelligence`,
    description,
    type: 'website',
    url: `${SITE_URL}/faq`,
  },
};

/** Q/A pairs — plain-text answers feed the FAQPage JSON-LD; the JSX
 * version below can carry links. Keep the two in sync. */
const FAQS: { q: string; a: string; jsx: React.ReactNode }[] = [
  {
    q: 'What is a Single Audit?',
    a: 'A Single Audit (formerly the "OMB A-133 audit," now governed by 2 CFR 200 Subpart F, the Uniform Guidance) is an organization-wide audit of an entity that expends federal award funds. It covers both the financial statements and compliance with the rules attached to the federal money — one audit instead of a separate audit for every grant.',
    jsx: (
      <>
        A Single Audit (formerly the &ldquo;OMB A-133 audit,&rdquo; now governed by{' '}
        <a
          href="https://www.ecfr.gov/current/title-2/subtitle-A/chapter-II/part-200/subpart-F"
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 hover:text-blue-800 underline"
        >
          2 CFR 200 Subpart F
        </a>
        , the Uniform Guidance) is an organization-wide audit of an entity that expends federal
        award funds. It covers both the financial statements and compliance with the rules
        attached to the federal money — one audit instead of a separate audit for every grant.
      </>
    ),
  },
  {
    q: 'Who needs a Single Audit?',
    a: 'A non-federal entity (state, local government, tribe, university, or non-profit) that expends $1,000,000 or more in federal award funds in its fiscal year must have a Single Audit for that year. The threshold was $750,000 for fiscal years beginning before October 1, 2024. It is based on funds expended, not received or awarded, and it aggregates across all federal programs.',
    jsx: (
      <>
        A non-federal entity — state or local government, tribe, university, or non-profit —
        that <strong>expends $1,000,000 or more</strong> in federal award funds in its fiscal
        year must have a Single Audit for that year. The threshold was <strong>$750,000</strong>{' '}
        for fiscal years beginning before October 1, 2024. It&apos;s based on funds{' '}
        <em>expended</em>, not received or awarded, and it aggregates across every federal
        program. For-profit subrecipients aren&apos;t subject to the Single Audit but the
        pass-through entity still has to ensure an audit of the federal funds.
      </>
    ),
  },
  {
    q: 'What is the difference between a Single Audit and a regular financial statement audit?',
    a: 'A financial statement audit only opines on whether the financials are fairly stated. A Single Audit adds a second dimension: testing whether the organization followed the compliance requirements for its major federal programs (allowable costs, eligibility, reporting, subrecipient monitoring, and so on), plus an opinion on internal control over compliance. An organization over the threshold needs the Single Audit; the financial statement audit alone is not enough.',
    jsx: (
      <>
        A financial statement audit only opines on whether the financials are fairly stated. A
        Single Audit adds a second dimension: testing whether the organization followed the
        compliance requirements for its <em>major federal programs</em> — allowable costs,
        eligibility, reporting,{' '}
        <Link
          href="/guide/subrecipient-monitoring"
          className="text-blue-600 hover:text-blue-800 underline"
        >
          subrecipient monitoring
        </Link>
        , and so on — plus an opinion on internal control over compliance. Over the threshold,
        the financial statement audit alone isn&apos;t enough.
      </>
    ),
  },
  {
    q: 'What is the Federal Audit Clearinghouse (FAC)?',
    a: 'The FAC (fac.gov) is the federal government’s official repository for Single Audit reports. Every Single Audit must be submitted there, and the data — auditee identity, audit findings, corrective action plans, the schedule of federal awards — is public record. This site is built on that public data.',
    jsx: (
      <>
        The{' '}
        <a
          href="https://www.fac.gov"
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 hover:text-blue-800 underline"
        >
          FAC
        </a>{' '}
        is the federal government&apos;s official repository for Single Audit reports. Every
        Single Audit must be submitted there, and the data — auditee identity, findings,
        corrective action plans, the schedule of federal awards — is public record. This site
        is built on that public data, and every page links back to the original FAC record.
      </>
    ),
  },
  {
    q: 'What is an audit finding?',
    a: 'A finding is a specific problem the auditor identified — a compliance violation, an internal control weakness, questioned costs, or a combination. Findings are numbered (e.g. 2024-001) and each one gets a written condition, cause, effect, and recommendation, plus a corrective action plan from the auditee. Findings are the core of what this site surfaces per organization.',
    jsx: (
      <>
        A finding is a specific problem the auditor identified — a compliance violation, an
        internal control weakness, questioned costs, or a combination. Each is numbered (e.g.
        2024-001) with a written condition, cause, effect, and recommendation, plus a
        corrective action plan from the auditee. Findings are the core of what each{' '}
        <Link href="/portfolio" className="text-blue-600 hover:text-blue-800 underline">
          organization page
        </Link>{' '}
        surfaces.
      </>
    ),
  },
  {
    q: 'What is a repeat finding, and why does it matter?',
    a: 'A repeat finding is one that was also reported in a prior audit and not fully resolved. Repeat findings are a red flag for pass-through entities monitoring subrecipients, and a pattern of them can cost an organization its "low-risk auditee" status — which roughly doubles the share of federal expenditures the auditor has to test (from 20% to 40%), a real recurring cost.',
    jsx: (
      <>
        A repeat finding is one also reported in a prior audit and not fully resolved.
        It&apos;s a red flag for pass-through monitoring, and a pattern of them can cost an
        organization its{' '}
        <strong>low-risk auditee</strong> status — which roughly doubles the share of federal
        expenditures the auditor must test (20% &rarr; 40%), a real recurring cost. This site
        shows the prior-year reference on each repeat finding.
      </>
    ),
  },
  {
    q: 'What is a management decision and when is it due?',
    a: 'When a subrecipient has an audit finding on a federal program, the pass-through entity (or the cognizant/oversight federal agency) must issue a written "management decision" — accepting, rejecting, or modifying the finding and the corrective action — within six months of the audit report being accepted by the FAC (2 CFR 200.521). This site computes that deadline for each finding.',
    jsx: (
      <>
        When a subrecipient has an audit finding, the pass-through entity (or the
        cognizant/oversight agency) must issue a written{' '}
        <Link
          href="/guide/management-decisions"
          className="text-blue-600 hover:text-blue-800 underline"
        >
          management decision
        </Link>{' '}
        — accepting, rejecting, or modifying the finding and corrective action — within{' '}
        <strong>six months</strong> of the FAC accepting the audit report (2 CFR 200.521). The
        portfolio view computes and tracks that deadline.
      </>
    ),
  },
  {
    q: 'How do I find a firm to perform a Single Audit?',
    a: 'The auditor must be an independent CPA firm experienced with the Uniform Guidance. This site has a directory of every firm that has filed a Single Audit with the FAC, searchable by state, showing how many each has filed and which organizations they audited. It is a starting point for a shortlist, not a rating — always confirm licensure and independence with the firm.',
    jsx: (
      <>
        The auditor must be an independent CPA firm experienced with the Uniform Guidance. The{' '}
        <Link href="/auditors" className="text-blue-600 hover:text-blue-800 underline">
          auditor directory
        </Link>{' '}
        lists every firm that has filed a Single Audit with the FAC, searchable by state, with
        how many each has filed and which organizations they audited. It&apos;s a starting
        point for a shortlist, not a rating — confirm licensure and independence directly with
        the firm.
      </>
    ),
  },
  {
    q: 'How current is the data on this site?',
    a: 'Most lookups come from a weekly-refreshed local mirror of the FAC bulk export. Organizations within about two months of their filing deadline are fetched live from the FAC API instead. Award-level detail is always fetched live on demand. Every page shows when its data was last refreshed.',
    jsx: (
      <>
        Most lookups come from a weekly-refreshed local mirror of the FAC bulk export.
        Organizations within about two months of their filing deadline are fetched live from
        the FAC API instead, and award-level detail is always live. Every page shows when its
        data was last refreshed. More detail on{' '}
        <Link href="/about" className="text-blue-600 hover:text-blue-800 underline">
          the About page
        </Link>
        .
      </>
    ),
  },
  {
    q: 'Is Single Audit Intelligence affiliated with the government?',
    a: 'No. It is an independent tool built on public FAC data. It is not affiliated with the GSA, OMB, the Federal Audit Clearinghouse, or any federal agency, and not affiliated with any audit firm in the directory.',
    jsx: (
      <>
        No. It&apos;s an independent tool built on public FAC data — not affiliated with the
        GSA, OMB, the Federal Audit Clearinghouse, any federal agency, or any audit firm in the
        directory.
      </>
    ),
  },
];

export default function FaqPage() {
  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQS.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />

      <div className="bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
          <Link href="/" className="text-blue-600 hover:text-blue-800 text-sm">
            ← Back to home
          </Link>
          <h1 className="text-3xl font-bold text-gray-900 mt-3">Single Audit FAQ</h1>
          <p className="text-gray-600 mt-2 max-w-2xl">
            Common questions about the Single Audit, the Federal Audit Clearinghouse, and how
            to use this site. For a deeper walkthrough, see the{' '}
            <Link href="/guide" className="text-blue-600 hover:text-blue-800 underline">
              compliance guide
            </Link>
            .
          </p>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-8 sm:px-6 lg:px-8 space-y-3">
        {FAQS.map((f) => (
          <details
            key={f.q}
            className="group bg-white border border-gray-200 rounded-lg [&_summary]:list-none"
          >
            <summary className="cursor-pointer p-4 font-semibold text-gray-900 flex justify-between items-center gap-3">
              {f.q}
              <span className="text-gray-400 group-open:rotate-180 transition-transform">▾</span>
            </summary>
            <div className="px-4 pb-4 text-gray-700 leading-relaxed">{f.jsx}</div>
          </details>
        ))}

        <div className="pt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm">
          <Link href="/guide" className="text-blue-600 hover:text-blue-800 font-semibold">
            Compliance guide →
          </Link>
          <Link href="/auditors" className="text-blue-600 hover:text-blue-800 font-semibold">
            Auditor directory →
          </Link>
          <Link href="/about" className="text-blue-600 hover:text-blue-800 font-semibold">
            About the data →
          </Link>
        </div>
      </div>

      <Footer />
    </div>
  );
}
