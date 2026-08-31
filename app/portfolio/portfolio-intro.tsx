import Link from 'next/link';

/**
 * Shown on /portfolio when no EINs have been entered yet — a direct
 * visitor (SEO, a shared link to the bare page) otherwise sees just the
 * paste box and a button, with no sense of the payoff. This section
 * spells out what the table returns and offers a one-click example run.
 *
 * Static illustration, not live data: the sample table uses invented
 * figures (same choice as app/home-sample-card.tsx). Column labels and
 * the amber "due soon" treatment mirror the real
 * app/portfolio/portfolio-table.tsx so what a visitor learns here
 * matches what they get after running a real list.
 */

const EXAMPLE_EINS = '916001236,411916337,421079767';

const WHAT_YOU_GET: { label: string; body: string }[] = [
  {
    label: 'Total findings, per organization',
    body: 'How many audit findings each organization has in its most recent Single Audit — the fastest read on which subrecipients need a closer look.',
  },
  {
    label: 'Repeat findings',
    body: 'Findings the auditor flagged as a repeat of a prior year. A pattern of repeats is a stronger risk signal than a one-off.',
  },
  {
    label: 'Material weaknesses',
    body: 'The most serious internal-control findings, counted separately from the total.',
  },
  {
    label: 'Management-decision deadline',
    body: 'The date the pass-through entity must issue a management decision (six months after the FAC accepts the audit, per 2 CFR 200.521), with the ones coming due soon highlighted.',
  },
  {
    label: 'Most recent audit year',
    body: 'The fiscal year of the latest accepted audit, so you can see at a glance whose audit is current and whose is behind.',
  },
  {
    label: '“Not found” detection',
    body: 'Organizations with no audit in the Federal Audit Clearinghouse are called out explicitly — a meaningful answer when you’re checking whether a subrecipient was audited at all.',
  },
];

function Check() {
  return (
    <svg className="h-4 w-4 shrink-0 text-green-600 mt-0.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
      <path
        fillRule="evenodd"
        d="M16.7 5.3a1 1 0 010 1.4l-8 8a1 1 0 01-1.4 0l-4-4a1 1 0 011.4-1.4L8 12.6l7.3-7.3a1 1 0 011.4 0z"
        clipRule="evenodd"
      />
    </svg>
  );
}

export function PortfolioIntro() {
  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-xl font-bold text-gray-900">What you&apos;ll get back</h2>
        <p className="text-gray-600 mt-1 max-w-2xl text-sm">
          One row per organization, sortable by any column, in a link you can share with your
          team. Everything comes from the Federal Audit Clearinghouse — free, no account.
        </p>
        <div className="grid sm:grid-cols-2 gap-x-8 gap-y-4 mt-5">
          {WHAT_YOU_GET.map((item) => (
            <div key={item.label} className="flex gap-2">
              <Check />
              <div>
                <p className="text-sm font-semibold text-gray-900">{item.label}</p>
                <p className="text-sm text-gray-600 mt-0.5">{item.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="flex items-center gap-2 mb-3">
          <span className="rounded bg-gray-100 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Example
          </span>
          <span className="text-xs text-gray-500">what the table looks like</span>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                {['Organization', 'Most recent audit FY', 'Total findings', 'Repeat findings', 'Material weaknesses', 'Management decision due'].map(
                  (h) => (
                    <th key={h} className="px-4 py-3 text-left font-semibold text-gray-900 whitespace-nowrap">
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 text-gray-700">
              <tr>
                <td className="px-4 py-3 font-medium text-gray-900">Riverside Community Action</td>
                <td className="px-4 py-3 whitespace-nowrap">2025</td>
                <td className="px-4 py-3">3</td>
                <td className="px-4 py-3">1</td>
                <td className="px-4 py-3">1</td>
                <td className="px-4 py-3 whitespace-nowrap text-amber-700 font-semibold">In 47 days</td>
              </tr>
              <tr>
                <td className="px-4 py-3 font-medium text-gray-900">Northgate Housing Authority</td>
                <td className="px-4 py-3 whitespace-nowrap">2024</td>
                <td className="px-4 py-3">0</td>
                <td className="px-4 py-3">0</td>
                <td className="px-4 py-3">0</td>
                <td className="px-4 py-3 whitespace-nowrap text-gray-400">—</td>
              </tr>
              <tr className="bg-gray-50">
                <td colSpan={6} className="px-4 py-3 text-gray-500 italic">
                  <span className="font-mono not-italic">27-1234567</span> — not found in the Federal
                  Audit Clearinghouse
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-gray-400">Illustration. Run a real list below for cited figures.</p>
      </section>

      <section>
        <Link
          href={`/portfolio?eins=${EXAMPLE_EINS}`}
          className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-semibold px-5 py-2.5 rounded-lg text-sm"
        >
          Try it with three example organizations →
        </Link>
      </section>
    </div>
  );
}
