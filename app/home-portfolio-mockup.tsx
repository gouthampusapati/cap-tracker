import { HomeMockupViewTracker } from './home-mockup-view-tracker';

/**
 * Portfolio monitoring mockup — the homepage's single most important
 * product visual. It shows what the monitoring product produces: a whole
 * portfolio collapsed to the handful of organizations that actually
 * changed this month.
 *
 * Honesty constraint (validation plan, Core Rule #1): the monitoring
 * backend does not exist yet. So this is explicitly labelled
 * "Illustrative — example monitoring report" and every organization name
 * is invented, in the same "Riverside Community Action" style as
 * app/home-sample-card.tsx. Nothing here is a customer statistic.
 *
 * Static server component — same pattern as home-sample-card.tsx, no
 * runtime cost, homepage stays `○` (Static) in the build. The only
 * client island is <HomeMockupViewTracker>, which fires the
 * home_mockup_view analytics event once when the section scrolls into
 * view (same spirit as app/pricing/pricing-view-tracker.tsx).
 *
 * Colours reuse the severity tokens from
 * app/single-audit/[ein]/finding-card.tsx / the org-page risk strip so a
 * visitor learns the same red/amber language the real product uses.
 */

type ExceptionRow = {
  org: string;
  changed: string;
  priority: 'High' | 'Review' | 'None';
};

const ROWS: ExceptionRow[] = [
  { org: 'Riverside Community Action', changed: 'New repeat finding', priority: 'High' },
  { org: 'Cascade County', changed: 'Management-decision deadline in 21 days', priority: 'High' },
  { org: 'Northgate University', changed: 'New Single Audit filed', priority: 'Review' },
  { org: 'Willamette Foundation', changed: 'No changes', priority: 'None' },
];

const PRIORITY_STYLES: Record<ExceptionRow['priority'], string> = {
  High: 'border-severity-critical/30 bg-severity-critical/10 text-severity-critical',
  Review: 'border-severity-warning/30 bg-severity-warning/10 text-severity-warning',
  None: 'border-gray-200 bg-surface-alt text-muted',
};

const PRIORITY_LABEL: Record<ExceptionRow['priority'], string> = {
  High: '🔴 High',
  Review: '🟡 Review',
  None: '🟢 None',
};

export function HomePortfolioMockup() {
  return (
    <section
      id="how-monitoring-works"
      className="scroll-mt-20 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20"
    >
      <HomeMockupViewTracker />

      <h2 className="text-h3 sm:text-h2 font-medium tracking-tight text-gray-900">
        See how portfolio monitoring works
      </h2>
      <p className="mt-3 text-lg text-gray-600 font-light max-w-2xl">
        Add your organizations once. We watch the Federal Audit Clearinghouse for you and surface
        only the ones that changed — new audits, new findings, approaching deadlines.
      </p>

      <div className="mt-8 rounded-xl border border-gray-200 bg-white shadow-card">
        {/* Card header — label first so the illustrative framing is read
            before any of the numbers. */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 px-5 py-4 sm:px-6">
          <div>
            <span className="rounded bg-surface-alt px-2 py-1 text-caption font-semibold uppercase tracking-wide text-muted">
              Illustrative — example monitoring report
            </span>
            <h3 className="mt-2 text-lg font-semibold text-gray-900">Your portfolio this month</h3>
          </div>
        </div>

        {/* Summary row — portfolio count first, attention count second,
            then the two lower-priority buckets. Triage in under 5s. */}
        <dl className="grid grid-cols-2 gap-4 px-5 py-4 sm:grid-cols-4 sm:px-6">
          <div>
            <dt className="text-h3 font-semibold tabular-nums text-gray-900">73</dt>
            <dd className="mt-0.5 text-caption text-gray-600">organizations monitored</dd>
          </div>
          <div>
            <dt className="text-h3 font-semibold tabular-nums text-severity-critical">🔴 3</dt>
            <dd className="mt-0.5 text-caption text-gray-600">need attention</dd>
          </div>
          <div>
            <dt className="text-h3 font-semibold tabular-nums text-gray-900">🟡 7</dt>
            <dd className="mt-0.5 text-caption text-gray-600">new records</dd>
          </div>
          <div>
            <dt className="text-h3 font-semibold tabular-nums text-gray-900">🟢 63</dt>
            <dd className="mt-0.5 text-caption text-gray-600">unchanged</dd>
          </div>
        </dl>

        {/* Exception list. Scrolls inside its own container on narrow
            screens so the page body never scrolls horizontally. */}
        <div className="overflow-x-auto border-t border-gray-200">
          <table className="w-full min-w-[36rem] text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-caption uppercase tracking-wide text-muted">
                <th scope="col" className="px-5 py-3 font-semibold sm:px-6">
                  Organization
                </th>
                <th scope="col" className="px-5 py-3 font-semibold sm:px-6">
                  What changed
                </th>
                <th scope="col" className="px-5 py-3 font-semibold sm:px-6">
                  Priority
                </th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => (
                <tr key={row.org} className="border-b border-gray-100 last:border-0">
                  <td className="px-5 py-3 font-medium text-gray-900 sm:px-6">{row.org}</td>
                  <td className="px-5 py-3 text-gray-600 sm:px-6">{row.changed}</td>
                  <td className="px-5 py-3 sm:px-6">
                    <span
                      className={`inline-block whitespace-nowrap rounded border px-2 py-1 text-xs font-bold ${PRIORITY_STYLES[row.priority]}`}
                    >
                      {PRIORITY_LABEL[row.priority]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* The largest product message on the page. */}
      <p className="mt-6 text-xl sm:text-h3 font-medium tracking-tight text-balance text-gray-900">
        Instead of reviewing 73 organizations, your team reviews 3 exceptions.
      </p>
    </section>
  );
}
