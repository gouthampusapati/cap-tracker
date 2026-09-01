import Link from 'next/link';

/**
 * Homepage repositioning §B + §C — the "why isn't FAC enough?" argument.
 *
 * §B: the manual monitoring loop vs. the monitored one, side by side.
 *     This describes a *process* (what a compliance team does by hand vs.
 *     what the product would do), not a shipped feature, so it's honest
 *     ahead of the monitoring backend existing.
 *
 * §C: a capability table — deliberately framed as "Free research vs
 *     Founding monitoring" with the paid column headed "Founding Customer
 *     Program", NOT "what's live today". Every ✓ in the monitoring column
 *     reads as "what founding customers get / help shape", matching the
 *     /pricing framing (validation plan, Core Rule #1: don't claim the
 *     monitoring product is ready).
 *
 * Static server component, no runtime cost — homepage stays `○` (Static).
 */

function Check() {
  return (
    <svg
      className="h-4 w-4 shrink-0 text-green-600 mt-0.5"
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M16.7 5.3a1 1 0 010 1.4l-8 8a1 1 0 01-1.4 0l-4-4a1 1 0 011.4-1.4L8 12.6l7.3-7.3a1 1 0 011.4 0z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function Dash() {
  return (
    <span
      aria-hidden="true"
      className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center text-gray-400"
    >
      –
    </span>
  );
}

const MANUAL = [
  'Keep a list of your subrecipients',
  'Check the Federal Audit Clearinghouse, repeatedly',
  'Search organizations one at a time',
  'Compare each new audit against the previous one',
  'Work out which findings are new, and which are repeats',
  'Track management-decision and corrective-action deadlines',
  'Figure out what actually changed since last time',
  'Keep your own tracking spreadsheet up to date',
  'Do all of it again next month',
];

const MONITORED = [
  'Add your organizations once',
  'We watch the Federal Audit Clearinghouse for you',
  'New audits and findings are detected automatically',
  'Repeat findings are surfaced, not buried',
  'Approaching deadlines are flagged',
  'Everything is prioritised — what needs attention, what can wait',
  'One portfolio view for the whole list',
  'You review the exceptions, not all 100 organizations',
];

type Cell = 'yes' | 'no';
const CAPABILITIES: { label: string; free: Cell; founding: Cell }[] = [
  { label: 'Search audit records', free: 'yes', founding: 'yes' },
  { label: 'Search findings and corrective action plans', free: 'yes', founding: 'yes' },
  { label: 'Portfolio view — paste EINs, up to the batch cap', free: 'yes', founding: 'yes' },
  { label: 'Save a monitored portfolio (up to 100 organizations)', free: 'no', founding: 'yes' },
  { label: 'Automatic change detection', free: 'no', founding: 'yes' },
  { label: 'Exception alerts — new audit, new finding, repeat finding', free: 'no', founding: 'yes' },
  { label: 'Management-decision deadline monitoring', free: 'no', founding: 'yes' },
  { label: 'Monthly portfolio exception report', free: 'no', founding: 'yes' },
];

function Mark({ cell }: { cell: Cell }) {
  return cell === 'yes' ? (
    <span className="inline-flex justify-center">
      <Check />
    </span>
  ) : (
    <span aria-hidden="true" className="text-gray-300">
      —
    </span>
  );
}

export function HomeFacVsMonitoring() {
  return (
    <section className="border-y border-border bg-surface-alt">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20 space-y-16">
        {/* §B — the manual loop vs. the monitored one */}
        <div>
          <h2 className="text-h3 sm:text-h2 font-medium tracking-tight text-gray-900">
            FAC is a database. Your portfolio needs monitoring.
          </h2>
          <p className="mt-3 max-w-2xl text-lg font-light text-gray-600">
            The Federal Audit Clearinghouse gives you the data. Single Audit Intelligence watches
            it for you.
          </p>

          <div className="mt-8 grid gap-6 md:grid-cols-2">
            {/* Manual — the longer, heavier list, on purpose */}
            <div className="rounded-xl border border-gray-200 bg-white p-6">
              <p className="text-caption font-semibold uppercase tracking-wide text-muted">
                Doing it by hand
              </p>
              <ul className="mt-4 space-y-2.5 text-sm text-gray-600">
                {MANUAL.map((item, i) => (
                  <li key={item} className="flex gap-2.5">
                    <Dash />
                    <span className={i === MANUAL.length - 1 ? 'font-medium text-gray-900' : undefined}>
                      {item}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Monitored — shorter, and it ends */}
            <div className="rounded-xl border-2 border-accent/30 bg-accent/5 p-6">
              <p className="text-caption font-semibold uppercase tracking-wide text-accent">
                With continuous monitoring
              </p>
              <ul className="mt-4 space-y-2.5 text-sm text-gray-700">
                {MONITORED.map((item, i) => (
                  <li key={item} className="flex gap-2.5">
                    <Check />
                    <span className={i === MONITORED.length - 1 ? 'font-medium text-gray-900' : undefined}>
                      {item}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <p className="mt-8 text-xl sm:text-h3 font-medium tracking-tight text-balance text-gray-900">
            You&apos;re not paying for access to FAC. You&apos;re paying to stop checking it.
          </p>
        </div>

        {/* §C — capability table, framed as Free vs Founding */}
        <div>
          <h2 className="text-h3 sm:text-h2 font-medium tracking-tight text-gray-900">
            Free research vs Founding monitoring
          </h2>

          <div className="mt-6 overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="w-full min-w-[34rem] text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-gray-900">
                  <th scope="col" className="px-5 py-3 font-semibold sm:px-6">
                    Capability
                  </th>
                  <th scope="col" className="px-4 py-3 text-center font-semibold whitespace-nowrap">
                    Free research
                  </th>
                  <th scope="col" className="px-4 py-3 text-center font-semibold whitespace-nowrap">
                    Founding Customer Program
                  </th>
                </tr>
              </thead>
              <tbody>
                {CAPABILITIES.map((row) => (
                  <tr key={row.label} className="border-b border-gray-100 last:border-0">
                    <td className="px-5 py-3 text-gray-700 sm:px-6">{row.label}</td>
                    <td className="px-4 py-3 text-center">
                      <Mark cell={row.free} />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Mark cell={row.founding} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-3 text-caption text-gray-500">
            The Founding Customer Program column is what founding customers get as we build the
            monitoring service with them —{' '}
            <Link href="/pricing" className="underline font-semibold hover:text-accent">
              see founding pricing
            </Link>
            .
          </p>
        </div>
      </div>
    </section>
  );
}
