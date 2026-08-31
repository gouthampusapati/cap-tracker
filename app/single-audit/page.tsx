import Link from 'next/link';
import type { Metadata } from 'next';
import { SITE_URL } from '@/lib/site-url';
import { Footer } from '@/app/footer';
import { JsonLd } from '@/app/json-ld';
import { breadcrumbList, webSite } from '@/lib/structured-data';
import EinSearchForm from '@/app/ein-search-form';
import { getStateOrgCounts, getGoingConcernOrgs, US_STATES, stateName } from '@/lib/orgs';

// Mirror-backed, refreshes weekly — cache tracks that cadence.
export const revalidate = 604800;

const title = 'Single Audit Lookup — Search Any Federal Award Recipient';
const description =
  'Look up the Single Audit history, findings, and corrective action plans for any organization ' +
  'that receives federal awards — or browse by state. Built on public Federal Audit Clearinghouse data.';
const canonical = `${SITE_URL}/single-audit`;

export const metadata: Metadata = {
  title: `${title} | Single Audit Intelligence`,
  description,
  alternates: { canonical },
  openGraph: {
    title: `${title} | Single Audit Intelligence`,
    description,
    type: 'website',
    url: canonical,
    images: [{ url: `${SITE_URL}/opengraph-image.png`, width: 1200, height: 630 }],
  },
};

function usd(n: number | null): string {
  if (!n || n <= 0) return '—';
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: 'compact',
    maximumFractionDigits: 1,
  });
}

const structuredData = [
  breadcrumbList([
    { name: 'Single Audit Intelligence', url: SITE_URL },
    { name: 'Single Audit Organizations', url: canonical },
  ]),
  // Shared builder — same shape as the homepage's WebSite node rather
  // than a second hand-rolled one that could drift.
  webSite(),
];

export default async function SingleAuditHubPage() {
  const [counts, goingConcern] = await Promise.all([
    getStateOrgCounts(),
    getGoingConcernOrgs(12),
  ]);

  const states = Object.keys(US_STATES)
    .filter((code) => (counts[code] ?? 0) > 0)
    .sort((a, b) => US_STATES[a].localeCompare(US_STATES[b]));

  return (
    <div className="min-h-screen bg-gray-50">
      <JsonLd data={structuredData} />

      <div className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
          <Link href="/" className="text-blue-600 hover:text-blue-800 text-sm">
            ← Back to home
          </Link>
          <h1 className="text-3xl font-bold text-gray-900 mt-3">Single Audit lookup</h1>
          <p className="text-gray-600 mt-2 max-w-2xl">
            Any organization that expends $1,000,000 or more in federal awards in a year must have a
            Single Audit under 2 CFR 200 Subpart F. Enter an EIN to see its full audit history,
            findings, and corrective action plans — or browse by state.
          </p>
          <div className="mt-5">
            <EinSearchForm />
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        {/* Browse by state */}
        <h2 className="text-h4 font-semibold text-gray-900">Browse organizations by state</h2>
        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm">
          {states.map((code) => (
            <Link
              key={code}
              href={`/single-audit/state/${code.toLowerCase()}`}
              className="text-blue-600 hover:underline"
            >
              {US_STATES[code]}{' '}
              <span className="text-gray-400 tabular-nums">
                {(counts[code] ?? 0).toLocaleString()}
              </span>
            </Link>
          ))}
        </div>

        {/* One notable list — going concern */}
        {goingConcern.length > 0 && (
          <section className="mt-12">
            <h2 className="text-h4 font-semibold text-gray-900">
              Organizations with a going-concern opinion
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              An auditor raised substantial doubt about the organization&apos;s ability to keep
              operating — in its most recent audited year. Largest federal recipients first.
            </p>
            <ul className="mt-4 divide-y divide-gray-200 rounded-lg border border-gray-200 bg-white">
              {goingConcern.map((o) => (
                <li key={o.ein} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
                  <Link
                    href={`/single-audit/${o.ein}`}
                    className="min-w-0 truncate font-medium text-blue-600 hover:text-blue-800"
                  >
                    {o.name}
                    {o.state && stateName(o.state) && (
                      <span className="ml-2 font-normal text-gray-400">{stateName(o.state)}</span>
                    )}
                  </Link>
                  <span className="shrink-0 tabular-nums text-gray-600">{usd(o.totalExpended)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="mt-12 flex flex-wrap gap-x-5 gap-y-2 text-sm">
          <Link href="/auditors" className="font-semibold text-blue-600 hover:text-blue-800">
            Audit firm directory →
          </Link>
          <Link href="/guide" className="font-semibold text-blue-600 hover:text-blue-800">
            Compliance guide →
          </Link>
          <Link href="/portfolio" className="font-semibold text-blue-600 hover:text-blue-800">
            Check multiple organizations →
          </Link>
        </div>
      </div>

      <Footer />
    </div>
  );
}
