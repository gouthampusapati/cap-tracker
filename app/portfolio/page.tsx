import Link from 'next/link';
import { Metadata } from 'next';
import { SITE_URL } from '@/lib/site-url';
import { parseEinList, fetchPortfolio, defaultSort, PORTFOLIO_MAX_EINS } from '@/lib/portfolio';
import { requirePortfolioUser, getMonitoredView } from '@/lib/portfolio-store';
import { Footer } from '@/app/footer';
import PortfolioForm from './portfolio-form';
import PortfolioTable from './portfolio-table';
import { MonitorPortfolioCta } from './monitor-portfolio-cta';
import { PortfolioIntro } from './portfolio-intro';
import { GroupSection } from './group-section';
import { NewGroupButton } from './group-ui';
import type { PortfolioRow } from '@/lib/portfolio';

// A full batch (PORTFOLIO_MAX_EINS EINs, ~6 at a time) is well past the
// single-org page's already-bumped 30s — this needs the Hobby-plan
// ceiling. Left at 60 even after the cap dropped from 50 to 10 (see
// PORTFOLIO_MAX_EINS in lib/ein-list.ts) — a smaller worst-case batch
// just means more headroom, not a reason to tighten this further.
export const maxDuration = 60;

const title = 'Portfolio View — Track Multiple Organizations';
const description =
  'Paste a list of EINs to see audit findings, repeat findings, and management-decision deadlines across an entire portfolio at once. Free, no login, no limit beyond the batch cap.';

export const metadata: Metadata = {
  title: `${title} | Single Audit Intelligence`,
  description,
  alternates: { canonical: `${SITE_URL}/portfolio` },
  openGraph: {
    title: `${title} | Single Audit Intelligence`,
    description,
    type: 'website',
    url: `${SITE_URL}/portfolio`,
  },
};

/** The not-found / error / covering-filing notes above a results table. */
function LookupNotes({ rows }: { rows: PortfolioRow[] }) {
  const notFoundCount = rows.filter((r) => r.status === 'not-found').length;
  const errorCount = rows.filter((r) => r.status === 'error').length;
  const resolvedCount = rows.filter((r) => r.coveringEin).length;
  return (
    <>
      {notFoundCount > 0 && (
        <p className="text-sm text-gray-600 mb-3">
          {notFoundCount} of {rows.length} EINs {notFoundCount === 1 ? 'was' : 'were'} not found in
          the Federal Audit Clearinghouse — that's a meaningful answer if you're checking whether a
          subrecipient was audited at all, not an error.
        </p>
      )}
      {errorCount > 0 && (
        <p className="text-sm text-amber-700 mb-3">
          {errorCount} of {rows.length} EIN{errorCount === 1 ? '' : 's'} couldn't be checked right
          now — the FAC may be rate-limited or briefly unavailable. That's not the same as "not
          found"; try again shortly for those rows.
        </p>
      )}
      {resolvedCount > 0 && (
        <p className="text-sm text-gray-600 mb-3">
          {resolvedCount} of {rows.length} EIN{resolvedCount === 1 ? ' has' : 's have'} no Single
          Audit of their own but {resolvedCount === 1 ? 'is' : 'are'} covered by a parent entity's
          audit — those rows show the covering filing, marked{' '}
          <span className="font-semibold text-blue-700">filed under</span>.
        </p>
      )}
    </>
  );
}

function DataSourceNote() {
  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mt-8">
      <p className="text-sm text-blue-900">
        <strong>Data source:</strong> This information comes from the{' '}
        <a
          href="https://app.fac.gov/dissemination/search/"
          target="_blank"
          rel="noopener noreferrer"
          className="underline font-semibold hover:text-blue-700"
        >
          Federal Audit Clearinghouse
        </a>
        , the official repository of Single Audit data. All data is public domain. Verify anything
        that matters directly at fac.gov before relying on it — if this page shows no findings for
        an organization, verify that at the source rather than assuming it's complete.
      </p>
    </div>
  );
}

export default async function PortfolioPage(props: {
  searchParams: Promise<{ eins?: string }>;
}) {
  const searchParams = await props.searchParams;
  const rawEins = searchParams.eins ?? '';
  const { eins, invalid } = parseEinList(rawEins);
  const overCap = eins.length > PORTFOLIO_MAX_EINS;
  const capped = eins.slice(0, PORTFOLIO_MAX_EINS);

  const gate = await requirePortfolioUser();
  const canMonitor = gate.ok;

  const [rows0, groups] = await Promise.all([
    capped.length > 0 ? fetchPortfolio(capped) : Promise.resolve([]),
    gate.ok ? getMonitoredView(gate.user.userId) : Promise.resolve([]),
  ]);
  const rows = defaultSort(rows0);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
          <Link href="/" className="text-blue-600 hover:text-blue-800 text-sm">
            ← Back to home
          </Link>
          <h1 className="text-3xl font-bold text-gray-900 mt-3">{title}</h1>
          <p className="text-gray-600 mt-2 max-w-2xl">{description}</p>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        <div className="bg-white p-6 rounded-lg border border-gray-200 mb-8">
          <PortfolioForm initialValue={capped.join('\n')} />
        </div>

        {capped.length === 0 && invalid.length === 0 && !canMonitor && <PortfolioIntro />}

        {invalid.length > 0 && (
          <div className="bg-amber-50 border border-amber-300 rounded-lg p-4 mb-6 text-sm text-amber-900">
            <strong>{invalid.length}</strong> entr{invalid.length === 1 ? 'y' : 'ies'} didn't look
            like a 9-digit EIN and{invalid.length === 1 ? " wasn't" : " weren't"} included:{' '}
            <span className="font-mono">{invalid.join(', ')}</span>
          </div>
        )}

        {overCap && (
          <div className="bg-amber-50 border border-amber-300 rounded-lg p-4 mb-6 text-sm text-amber-900">
            {eins.length} EINs were entered; only the first {PORTFOLIO_MAX_EINS} are shown below.
            Run the remainder as a separate lookup.
          </div>
        )}

        {rows.length > 0 && (
          <div className="mb-10">
            {canMonitor && (
              <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                <h2 className="text-lg font-semibold text-gray-900">Lookup results</h2>
                <NewGroupButton
                  eins={capped}
                  label={`Save these ${capped.length} as a group →`}
                />
              </div>
            )}
            <LookupNotes rows={rows} />
            <PortfolioTable initialRows={rows} />

            {/* The "onboarding founding customers" pitch — only for
                visitors who don't already have monitoring access. */}
            {!canMonitor && <MonitorPortfolioCta einCount={rows.length} />}
          </div>
        )}

        {canMonitor && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4 mt-4">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Your portfolio groups</h2>
                <p className="text-sm text-gray-600 mt-1">
                  Each group is checked weekly while <strong>Monitor</strong> is on — you're emailed
                  when a new audit, finding, or management-decision deadline shows up.
                </p>
              </div>
              <NewGroupButton />
            </div>

            {groups.length === 0 ? (
              <p className="text-sm text-gray-600 bg-white border border-gray-200 rounded-lg p-6">
                No groups yet. Create one above, or run a lookup and save it as a group.
              </p>
            ) : (
              groups.map((g) => (
                <GroupSection
                  key={g.id}
                  group={{
                    id: g.id,
                    name: g.name,
                    monitored: g.monitored,
                    eins: g.items.map((i) => i.ein),
                  }}
                />
              ))
            )}
          </>
        )}

        {(rows.length > 0 || canMonitor) && <DataSourceNote />}
      </div>

      <Footer />
    </div>
  );
}
