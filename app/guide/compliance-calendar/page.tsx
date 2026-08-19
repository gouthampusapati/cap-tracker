import Link from 'next/link';
import { Metadata } from 'next';
import { SITE_URL } from '@/lib/site-url';

const title = 'Single Audit Compliance Calendar';
const description =
  'Every Single Audit deadline in one place: audit due date, FAC submission, the management-decision clock, and record retention — each tied to its 2 CFR 200 citation.';

export const metadata: Metadata = {
  title: `${title} | Single Audit Intelligence`,
  description,
  alternates: { canonical: `${SITE_URL}/guide/compliance-calendar` },
  openGraph: {
    title: `${title} | Single Audit Intelligence`,
    description,
    type: 'article',
    url: `${SITE_URL}/guide/compliance-calendar`,
  },
};

interface Row {
  milestone: string;
  deadline: string;
  cite: string;
  citeUrl: string;
  note: string;
}

const rows: Row[] = [
  {
    milestone: 'Audit threshold',
    deadline: '$1,000,000 or more in federal expenditures in the fiscal year triggers the requirement',
    cite: '§ 200.501',
    citeUrl:
      'https://www.ecfr.gov/current/title-2/subtitle-A/chapter-II/part-200/subpart-F/subject-group-ECFRfd0932e473d10ba/section-200.501',
    note: 'Raised from $750,000 for fiscal years beginning on or after October 1, 2024. An FY that began before that date is still measured against $750,000.',
  },
  {
    milestone: 'Audit report + reporting package due to the FAC',
    deadline:
      'The earlier of: 30 calendar days after receiving the auditor\'s report, or 9 months after the end of the audit period',
    cite: '§ 200.512',
    citeUrl:
      'https://www.ecfr.gov/current/title-2/subtitle-A/chapter-II/part-200/subpart-F/subject-group-ECFRc3bd6ae97de5a40/section-200.512',
    note: 'A cognizant or oversight agency can authorize an extension if the 9-month timeframe is an undue burden. If the due date falls on a weekend or federal holiday, it moves to the next business day.',
  },
  {
    milestone: 'Management decision on any subrecipient finding',
    deadline: "Within 6 months of the FAC's acceptance of the audit report",
    cite: '§ 200.521(d)',
    citeUrl:
      'https://www.ecfr.gov/current/title-2/subtitle-A/chapter-II/part-200/subpart-F/subject-group-ECFR4424206eaecf751/section-200.521',
    note: 'Measured from FAC acceptance, not from the audit report date or your own fiscal year. See the management decision guide for a worked example.',
  },
  {
    milestone: 'Federal award record retention',
    deadline: '3 years from the date of submission of the related final financial report',
    cite: '§ 200.334',
    citeUrl:
      'https://www.ecfr.gov/current/title-2/subtitle-A/chapter-II/part-200/subpart-D/subject-group-ECFR4acc10e7e3b676f/section-200.334',
    note: 'Extends automatically if litigation, a claim, or an audit involving the records is still open when the 3 years would otherwise end.',
  },
];

export default function ComplianceCalendarPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
          <div className="mb-4">
            <Link href="/guide" className="text-blue-600 hover:text-blue-800 text-sm">
              ← Back to guides
            </Link>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">{title}</h1>
          <p className="text-gray-600">{description}</p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto mb-6">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-gray-900">Milestone</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-900">Deadline</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-900">CFR</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {rows.map((r) => (
                <tr key={r.milestone}>
                  <td className="px-4 py-4 font-medium text-gray-900 align-top">{r.milestone}</td>
                  <td className="px-4 py-4 text-gray-700 align-top">
                    <p>{r.deadline}</p>
                    <p className="text-xs text-gray-500 mt-1">{r.note}</p>
                  </td>
                  <td className="px-4 py-4 align-top whitespace-nowrap">
                    <a
                      href={r.citeUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 underline hover:text-blue-800 font-mono text-xs"
                    >
                      {r.cite}
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">Worked example</h2>
        <div className="bg-white p-6 rounded-lg border border-gray-200 mb-6">
          <p className="text-gray-800 leading-relaxed mb-3">
            An organization with a <strong>June 30</strong> fiscal year end that expends
            $1,000,000+ in federal awards:
          </p>
          <ul className="list-disc list-inside space-y-1 text-gray-800">
            <li>Fiscal year ends June 30</li>
            <li>
              Reporting package is due to the FAC by <strong>March 31</strong> of the following
              year (9 months out) — sooner if the auditor's report arrives earlier, since the
              30-day clock can land first
            </li>
            <li>
              Once the FAC accepts the report, any pass-through entity funding this organization
              has until <strong>6 months later</strong> to issue a management decision on any
              finding affecting its award
            </li>
            <li>
              Records related to that reporting package must be kept for{' '}
              <strong>3 years from the date it was submitted</strong>, longer if litigation or an
              open audit finding extends it
            </li>
          </ul>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
          <p className="text-sm text-blue-900">
            See these obligations explained in full:{' '}
            <Link
              href="/guide/subrecipient-monitoring"
              className="underline font-semibold hover:text-blue-700"
            >
              Subrecipient Monitoring (§ 200.332)
            </Link>{' '}
            and{' '}
            <Link
              href="/guide/management-decisions"
              className="underline font-semibold hover:text-blue-700"
            >
              Management Decision Deadlines (§ 200.521)
            </Link>
            .
          </p>
        </div>

        <div className="bg-gray-100 border border-gray-200 rounded-lg p-6 mb-6">
          <p className="text-sm text-gray-700">
            <strong>Not legal advice.</strong> Deadlines summarized here are drawn from 2 CFR 200
            Subparts D and F as currently in effect. Verify against{' '}
            <a
              href="https://www.ecfr.gov/current/title-2/subtitle-A/chapter-II/part-200"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold hover:text-gray-900"
            >
              the current text at eCFR.gov
            </a>{' '}
            before relying on any date here, and consult your cognizant or oversight agency for
            anything organization-specific.
          </p>
        </div>
      </div>

      <div className="bg-gray-100 border-t border-gray-200 py-6 mt-8">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-xs text-gray-600">
            Single Audit Intelligence is an independent tool powered by Federal Audit
            Clearinghouse data. Not affiliated with GSA, OMB, or any federal agency.
          </p>
        </div>
      </div>
    </div>
  );
}
