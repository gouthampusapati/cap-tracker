import Link from 'next/link';
import type { Metadata } from 'next';
import { SITE_URL } from '@/lib/site-url';
import { Footer } from '@/app/footer';
import { searchAuditorFirms, US_STATES, stateName } from '@/lib/auditors';
import { AuditorSearchForm } from './auditor-search-form';
import { AuditorResultsTable } from './auditor-results-table';

// Mirror-only reads, 0 FAC calls. Daily revalidation is plenty — the
// mirror itself only refreshes weekly.
export const revalidate = 86400;

const BASE_TITLE = 'Single Audit Firms — CPA Firm Directory';
const BASE_DESC =
  'Find a CPA firm that performs Single Audits (2 CFR 200 Subpart F / Uniform Guidance). ' +
  'Search 8,000+ firms by state and name, with the number of Single Audits each has filed with ' +
  'the Federal Audit Clearinghouse.';

function cleanState(v: string | undefined): string {
  const s = (v ?? '').trim().toUpperCase();
  return US_STATES[s] ? s : '';
}

export async function generateMetadata(props: {
  searchParams: Promise<{ state?: string; q?: string }>;
}): Promise<Metadata> {
  const sp = await props.searchParams;
  const state = cleanState(sp.state);
  const q = (sp.q ?? '').trim();

  let title = `${BASE_TITLE} | Single Audit Intelligence`;
  let description = BASE_DESC;
  // Only the state facet gets its own canonical/indexable variant — a
  // free-text query is a search result, not a landing page.
  let canonical = `${SITE_URL}/auditors`;

  if (state && !q) {
    const name = stateName(state)!;
    title = `Single Audit Firms in ${name} — CPA Firm Directory | Single Audit Intelligence`;
    description = `CPA firms in ${name} that perform Single Audits under 2 CFR 200 Subpart F (Uniform Guidance), ranked by the number of Single Audits filed with the Federal Audit Clearinghouse.`;
    canonical = `${SITE_URL}/auditors?state=${state}`;
  }

  return {
    title,
    description,
    alternates: { canonical },
    robots: q ? { index: false, follow: true } : undefined,
    openGraph: { title, description, type: 'website', url: canonical },
  };
}

export default async function AuditorsDirectoryPage(props: {
  searchParams: Promise<{ state?: string; q?: string }>;
}) {
  const sp = await props.searchParams;
  const state = cleanState(sp.state);
  const q = (sp.q ?? '').trim().slice(0, 80);

  const rows = await searchAuditorFirms({ state, q, limit: 150 });
  const focusName = state ? stateName(state) : null;

  const itemListJsonLd =
    rows.length > 0
      ? {
          '@context': 'https://schema.org',
          '@type': 'ItemList',
          name: focusName ? `Single Audit firms in ${focusName}` : 'Single Audit firms',
          numberOfItems: rows.length,
          itemListElement: rows.slice(0, 50).map((r, i) => ({
            '@type': 'ListItem',
            position: i + 1,
            url: `${SITE_URL}/auditors/${r.ein}`,
            name: r.name,
          })),
        }
      : null;

  return (
    <div className="min-h-screen bg-gray-50">
      {itemListJsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }}
        />
      )}

      <div className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
          <div className="mb-4 flex justify-between items-center">
            <Link href="/" className="text-blue-600 hover:text-blue-800 text-sm">
              ← Back to home
            </Link>
            <Link href="/guide" className="text-blue-600 hover:text-blue-800 text-sm font-semibold">
              Compliance guide
            </Link>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            {focusName ? `Single Audit Firms in ${focusName}` : 'Single Audit Firm Directory'}
          </h1>
          <p className="text-gray-600 max-w-2xl">
            Any organization that spends <strong>$1,000,000 or more</strong> in federal award funds
            in a fiscal year must have a Single Audit under 2 CFR 200 Subpart F (the Uniform
            Guidance). These are the CPA firms that perform them, ranked by how many Single Audits
            each has filed with the{' '}
            <a
              href="https://www.fac.gov"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              Federal Audit Clearinghouse
            </a>
            . Firm counts come straight from those public filings — not a paid listing or
            endorsement.
          </p>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6">
          <AuditorSearchForm initialState={state} initialQuery={q} />
        </div>

        {rows.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-lg p-6 text-gray-600">
            No firms found{focusName ? ` in ${focusName}` : ''}
            {q ? ` matching “${q}”` : ''}. Try a different state or a shorter name.
          </div>
        ) : (
          <>
            <p className="text-sm text-gray-500 mb-3">
              {rows.length === 150 ? 'Top 150' : rows.length} firm{rows.length === 1 ? '' : 's'}
              {focusName ? ` in ${focusName}` : ''}
              {q ? ` matching “${q}”` : ''}, most Single Audits first.
            </p>
            <AuditorResultsTable rows={rows} />
          </>
        )}

        {/* Crawlable state index — also the fastest way for a visitor to
            narrow down. */}
        <div className="mt-10">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Browse by state</h2>
          <div className="flex flex-wrap gap-x-3 gap-y-1.5 text-sm">
            {Object.entries(US_STATES)
              .sort((a, b) => a[1].localeCompare(b[1]))
              .map(([code, name]) => (
                <Link
                  key={code}
                  href={`/auditors?state=${code}`}
                  className={`hover:underline ${
                    code === state ? 'font-semibold text-gray-900' : 'text-blue-600'
                  }`}
                >
                  {name}
                </Link>
              ))}
          </div>
        </div>

        <div className="mt-10 bg-blue-50 border border-blue-200 rounded-lg p-6 text-sm text-blue-900">
          <strong>Choosing a Single Audit firm?</strong> The number of Single Audits a firm has filed
          is a rough proxy for experience with the Uniform Guidance, but it isn&apos;t a quality
          rating. Each firm page links to the specific organizations it audited and their findings,
          so you can look at the actual work. Always confirm licensure and independence directly with
          the firm.
        </div>
      </div>

      <Footer />
    </div>
  );
}
