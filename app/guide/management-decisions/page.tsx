import Link from 'next/link';
import { Metadata } from 'next';
import { SITE_URL } from '@/lib/site-url';

const title = 'The Management Decision Deadline Nobody Tracks (2 CFR 200.521)';
const description =
  "A pass-through entity must issue a management decision on a subrecipient's audit finding within six months of the FAC accepting the audit report. No system publicly tracks whether that deadline is met.";

export const metadata: Metadata = {
  title: `${title} | Single Audit Intelligence`,
  description,
  alternates: { canonical: `${SITE_URL}/guide/management-decisions` },
  openGraph: {
    title: `${title} | Single Audit Intelligence`,
    description,
    type: 'article',
    url: `${SITE_URL}/guide/management-decisions`,
  },
};

export default function ManagementDecisionsGuide() {
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
        <h2 className="text-xl font-bold text-gray-900 mt-2 mb-3">The six-month clock</h2>
        <div className="bg-white p-6 rounded-lg border border-gray-200 mb-6">
          <p className="text-gray-800 leading-relaxed mb-3">
            When a subrecipient's Single Audit turns up a finding tied to money you passed
            through, you don't get to leave it open indefinitely.{' '}
            <a
              href="https://www.ecfr.gov/current/title-2/subtitle-A/chapter-II/part-200/subpart-F/subject-group-ECFR4424206eaecf751/section-200.521"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 underline hover:text-blue-800"
            >
              2 CFR 200.521(d)
            </a>{' '}
            requires the pass-through entity to issue a <strong>management decision</strong> —
            a formal statement of whether the finding is sustained, why, and what the auditee
            must do about it — within{' '}
            <strong>six months of the Federal Audit Clearinghouse accepting the audit report</strong>.
            Not six months from when you first saw the finding, not six months from your own
            fiscal year. Six months from the FAC's acceptance date, which is public record for
            every submitted audit.
          </p>
        </div>

        <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">
          A concrete example of the clock running
        </h2>
        <div className="bg-white p-6 rounded-lg border border-gray-200 mb-6">
          <p className="text-gray-800 leading-relaxed mb-3">
            <Link
              href="/single-audit/421079767"
              className="text-blue-600 underline hover:text-blue-800"
            >
              Grinnell Low Rent Housing Authority
            </Link>
            's most recent audit report was accepted by the FAC on{' '}
            <strong>October 17, 2025</strong>. Under § 200.521(d), any pass-through entity that
            funded that audit period and has a management decision to issue on a finding from it
            had until <strong>April 17, 2026</strong> — six months later. Neither the FAC nor this
            site tracks whether that deadline was met for any given finding; the acceptance date
            is public, but the compliance clock it starts isn't tracked or published anywhere. If
            you fund this organization, that calculation is yours to make and yours to keep
            evidence of.
          </p>
        </div>

        <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">
          Why no system tracks this
        </h2>
        <div className="bg-white p-6 rounded-lg border border-gray-200 mb-6">
          <p className="text-gray-800 leading-relaxed mb-3">
            The FAC records what an audit found. It does not record whether the pass-through
            entity(ies) on the other end of those findings issued a management decision, or when.
            That's not a gap this site invented — it's the actual finding of{' '}
            <a
              href="https://www.gao.gov/products/gao-24-106173"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 underline hover:text-blue-800"
            >
              GAO-24-106173, "Single Audits: Improving Federal Audit Clearinghouse Information
              and Usability Could Strengthen Federal Award Oversight"
            </a>{' '}
            (April 2024), which examined FAC data quality and usability and recommended OMB take
            a more active role in improving both.
          </p>
          <p className="text-gray-800 leading-relaxed">
            In practice, this means a pass-through entity funding dozens of subrecipients has to
            build and maintain its own tracker of FAC acceptance dates and six-month deadlines —
            because no public system does it, and a missed deadline doesn't announce itself
            anywhere.
          </p>
        </div>

        <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">Where this fits</h2>
        <div className="bg-white p-6 rounded-lg border border-gray-200 mb-6">
          <p className="text-gray-800 leading-relaxed">
            Issuing management decisions on time is one piece of the broader{' '}
            <Link
              href="/guide/subrecipient-monitoring"
              className="text-blue-600 underline hover:text-blue-800"
            >
              subrecipient monitoring obligation under 2 CFR 200.332
            </Link>
            . For the full sequence of dates — audit due date, FAC submission, this six-month
            clock, and record retention — see the{' '}
            <Link
              href="/guide/compliance-calendar"
              className="text-blue-600 underline hover:text-blue-800"
            >
              Single Audit compliance calendar
            </Link>
            .
          </p>
        </div>

        <div className="bg-gray-100 border border-gray-200 rounded-lg p-6 mb-6">
          <p className="text-sm text-gray-700">
            <strong>Not legal advice.</strong> Verify against{' '}
            <a
              href="https://www.ecfr.gov/current/title-2/subtitle-A/chapter-II/part-200/subpart-F/subject-group-ECFR4424206eaecf751/section-200.521"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold hover:text-gray-900"
            >
              the current text of 2 CFR 200.521 at eCFR.gov
            </a>{' '}
            before relying on this page. The Grinnell example above is illustrative of how the
            deadline is calculated — it is not a claim about whether any deadline was met or
            missed.
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
