import Link from 'next/link';
import { Metadata } from 'next';
import { SITE_URL } from '@/lib/site-url';
import { Footer } from '@/app/footer';

const title = 'Subrecipient Monitoring Under 2 CFR 200.332';
const description =
  "What a pass-through entity must do for every subrecipient it funds under 2 CFR 200.332: the 14 required subaward data elements, risk assessment, ongoing monitoring, and verifying the subrecipient's audit happened.";

export const metadata: Metadata = {
  title: `${title} | Single Audit Intelligence`,
  description,
  alternates: { canonical: `${SITE_URL}/guide/subrecipient-monitoring` },
  openGraph: {
    title: `${title} | Single Audit Intelligence`,
    description,
    type: 'article',
    url: `${SITE_URL}/guide/subrecipient-monitoring`,
    // Explicit openGraph here suppresses Next's automatic fallback to
    // app/opengraph-image.png for this route — without this, guide pages
    // shared with no image and twitter:card fell back to "summary".
    images: [{ url: `${SITE_URL}/opengraph-image.png`, width: 1200, height: 630 }],
  },
};

const subawardElements = [
  "Subrecipient's name (must match the name associated with its unique entity identifier)",
  "Subrecipient's unique entity identifier (UEI)",
  'Federal Award Identification Number (FAIN)',
  'Federal award date',
  'Subaward period of performance start and end date',
  'Subaward budget period start and end date',
  'Amount of federal funds obligated in the subaward',
  "Total amount of federal funds obligated to the subrecipient, including the current obligation",
  'Total amount of the federal award committed to the subrecipient',
  'Federal award project description, as required by FFATA',
  'Name of the federal agency, pass-through entity, and awarding official contact information',
  'Assistance Listings title and number, with the dollar amount made available under each',
  'Identification of whether the federal award is for research and development',
  'Indirect cost rate for the federal award, including whether a de minimis rate is used',
];

// Grounded in content that's actually on this page — the "14 required
// subaward data elements" section below — not written to match a
// keyword. Fabricated FAQ markup that doesn't match visible content
// risks a manual action from Google, so only mark up what's genuinely
// answered here.
const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'How many data elements does § 200.332 require for each subaward?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: "14 required data elements under § 200.332(b)(1) for every subaward — the subrecipient's identity, federal award identification, funding amounts, and Assistance Listings information. See the full itemized list on this page.",
      },
    },
  ],
};

export default function SubrecipientMonitoringGuide() {
  return (
    <div className="min-h-screen bg-gray-50">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
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

      <article className="max-w-3xl mx-auto px-4 py-8 sm:px-6 lg:px-8 prose-like">
        <div className="bg-white p-6 rounded-lg border border-gray-200 mb-6">
          <p className="text-gray-800 leading-relaxed">
            If your organization passes federal award money through to another organization — a
            subgrant, a subcontract under a grant, a pass-through to a partner agency — you're a{' '}
            <strong>pass-through entity</strong>, and{' '}
            <a
              href="https://www.ecfr.gov/current/title-2/subtitle-A/chapter-II/part-200/subpart-D/subject-group-ECFR031321e29ac5bbd/section-200.332"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 underline hover:text-blue-800"
            >
              2 CFR 200.332
            </a>{' '}
            spells out exactly what you owe each subrecipient. This isn't optional paperwork —
            it's the obligation auditors test against every year, and it's where a large share of
            Single Audit findings originate.
          </p>
        </div>

        <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">
          1. The 14 required subaward data elements
        </h2>
        <p className="text-gray-700 mb-4">
          Every subaward you issue must clearly identify itself as a subaward (not a vendor
          contract) and must include the following, per § 200.332(b)(1). Where information isn't
          available at the time of the subaward, provide the best information available and
          update it once it is:
        </p>
        <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
          <ol className="list-decimal list-inside space-y-2 text-gray-800">
            {subawardElements.map((el) => (
              <li key={el} className="leading-relaxed">
                {el}
              </li>
            ))}
          </ol>
        </div>
        <p className="text-sm text-gray-600 mb-6">
          § 200.332(b) has additional paragraphs beyond this list covering subaward terms and
          conditions, closeout requirements, and indirect cost rate negotiation — this list is
          specifically the "Federal award identification" elements under (b)(1). Paragraph
          lettering in Part 200 has shifted before and can shift again in future revisions even
          when the substance stays the same — the count and content here were checked against the
          current eCFR text as of this writing, but always confirm the letter/number against{' '}
          <a
            href="https://www.ecfr.gov/current/title-2/subtitle-A/chapter-II/part-200/subpart-D/subject-group-ECFR031321e29ac5bbd/section-200.332"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 underline hover:text-blue-800"
          >
            the live section
          </a>{' '}
          rather than this page if you're citing it somewhere that matters.
        </p>

        <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">2. Risk assessment</h2>
        <div className="bg-white p-6 rounded-lg border border-gray-200 mb-6">
          <p className="text-gray-800 leading-relaxed">
            Before and during the subaward, you must evaluate each subrecipient's risk of
            noncompliance — including fraud risk — to decide how closely to monitor it. Factors
            typically considered include the subrecipient's prior experience with federal awards,
            results of previous audits, whether it has new staff or a new system, and the size and
            complexity of the award. A subrecipient with a clean audit history and experienced
            staff warrants lighter monitoring than one that's new, has had findings before, or is
            managing an unusually large award relative to its size.
          </p>
        </div>

        <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">3. Ongoing monitoring</h2>
        <div className="bg-white p-6 rounded-lg border border-gray-200 mb-6">
          <p className="text-gray-800 leading-relaxed mb-3">
            Monitoring isn't a one-time check at award setup. § 200.332(e) requires you to
            monitor the subrecipient's activities throughout the award period, which includes:
          </p>
          <ul className="list-disc list-inside space-y-2 text-gray-800">
            <li>Reviewing financial and performance reports the subrecipient submits</li>
            <li>
              Following up when a report reveals significant problems, and ensuring the
              subrecipient takes appropriate corrective action
            </li>
            <li>
              Issuing a{' '}
              <Link
                href="/guide/management-decisions"
                className="text-blue-600 underline hover:text-blue-800"
              >
                management decision
              </Link>{' '}
              for audit findings that pertain to the subaward you issued
            </li>
            <li>Following up to ensure the subrecipient actually resolves audit findings</li>
          </ul>
        </div>

        <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">
          4. Verify the subrecipient was actually audited
        </h2>
        <div className="bg-white p-6 rounded-lg border border-gray-200 mb-6">
          <p className="text-gray-800 leading-relaxed">
            § 200.332(g) requires you to verify that a subrecipient meeting the Single Audit
            threshold (
            <Link href="/guide/compliance-calendar" className="text-blue-600 underline hover:text-blue-800">
              $1,000,000 in federal expenditures in a fiscal year
            </Link>
            ) actually got audited as required under Subpart F, and to follow up when it didn't.
            This is one of the easier checks to automate: the subrecipient's audit history is
            public in the Federal Audit Clearinghouse under its EIN.
          </p>
        </div>

        <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">
          The threshold just moved — fewer subrecipients will show up in the FAC
        </h2>
        <div className="bg-white p-6 rounded-lg border border-gray-200 mb-6">
          <p className="text-gray-800 leading-relaxed mb-3">
            For fiscal years beginning on or after October 1, 2024, the Single Audit expenditure
            threshold rose from $750,000 to <strong>$1,000,000</strong> (2 CFR 200.501, revised
            April 2024). A subrecipient whose federal expenditures fall between those two figures
            no longer triggers a Single Audit at all.
          </p>
          <p className="text-gray-800 leading-relaxed">
            That has a direct consequence for the monitoring obligation above:{' '}
            <strong>
              fewer subrecipients will have a Single Audit for you to verify in the first place.
            </strong>{' '}
            The free, independent assurance a Single Audit used to provide disappears for
            everyone now under the higher threshold — meaning your own direct monitoring under
            § 200.332(d)–(e) is doing more of the work it used to share with an auditor.
          </p>
        </div>

        <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">See it in a real finding</h2>
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
          <p className="text-sm text-blue-900">
            <Link
              href="/single-audit/362614971"
              className="underline font-semibold hover:text-blue-700"
            >
              Moraine Valley Community College District Number 524
            </Link>{' '}
            has an audit finding tagged against this exact requirement. Reading the actual
            condition and corrective action plan alongside the regulation is often clearer than
            the regulation alone.
          </p>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
          <p className="text-sm text-blue-900">
            Monitoring more than one subrecipient?{' '}
            <Link href="/portfolio" className="underline font-semibold hover:text-blue-700">
              The portfolio view
            </Link>{' '}
            shows findings, repeat-finding counts, and management-decision deadlines across a
            list of EINs at once — paste your subrecipients' EINs to see them all in one table.
          </p>
        </div>

        <div className="bg-gray-100 border border-gray-200 rounded-lg p-6 mb-6">
          <p className="text-sm text-gray-700">
            <strong>Not legal advice.</strong> This page explains the regulation in plain language
            but isn't a substitute for reading{' '}
            <a
              href="https://www.ecfr.gov/current/title-2/subtitle-A/chapter-II/part-200/subpart-D/subject-group-ECFR031321e29ac5bbd/section-200.332"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold hover:text-gray-900"
            >
              the current text of 2 CFR 200.332 at eCFR.gov
            </a>{' '}
            or consulting your cognizant or oversight agency. Regulatory text changes; always
            verify against the current version before relying on it.
          </p>
        </div>
      </article>

      <Footer />
    </div>
  );
}
