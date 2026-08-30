import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { SITE_URL } from '@/lib/site-url';
import { Footer } from '@/app/footer';
import { JsonLd } from '@/app/json-ld';
import { breadcrumbList } from '@/lib/structured-data';
import { getStateOrgIndex, US_STATES, stateName } from '@/lib/orgs';

// The mirror refreshes weekly; a day-old state index is fine. Prerendered
// for every state via generateStaticParams below.
export const revalidate = 86400;
export const dynamicParams = false;

const MAX_ROWS = 250;

export function generateStaticParams() {
  return Object.keys(US_STATES).map((code) => ({ state: code.toLowerCase() }));
}

function usd(n: number | null): string {
  if (!n || n <= 0) return '—';
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: 'compact',
    maximumFractionDigits: 1,
  });
}

export async function generateMetadata(props: {
  params: Promise<{ state: string }>;
}): Promise<Metadata> {
  const { state: raw } = await props.params;
  const code = raw.toUpperCase();
  const name = stateName(code);
  if (!name) return { title: 'Not Found' };

  const { total } = await getStateOrgIndex(code, 1);
  const title = `Single Audit Organizations in ${name} | Single Audit Intelligence`;
  const description =
    `${total.toLocaleString()} organization${total === 1 ? '' : 's'} in ${name} that have filed a ` +
    `Single Audit with the Federal Audit Clearinghouse — ranked by federal awards expended, with ` +
    `findings and going-concern flags.`;
  const canonical = `${SITE_URL}/single-audit/state/${raw.toLowerCase()}`;

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      type: 'website',
      url: canonical,
      // og:image comes from this route's opengraph-image.tsx (per-state
      // card with the org count) — omitted here so Next attaches it.
    },
  };
}

export default async function StateOrgIndexPage(props: {
  params: Promise<{ state: string }>;
}) {
  const { state: raw } = await props.params;
  const code = raw.toUpperCase();
  const name = stateName(code);
  if (!name) notFound();

  const { orgs, total, withFindings, goingConcern } = await getStateOrgIndex(code, MAX_ROWS);
  if (total === 0) notFound();

  const canonical = `${SITE_URL}/single-audit/state/${raw.toLowerCase()}`;
  const structuredData = [
    breadcrumbList([
      { name: 'Single Audit Intelligence', url: SITE_URL },
      { name: 'Single Audit Organizations', url: `${SITE_URL}/single-audit` },
      { name, url: canonical },
    ]),
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <JsonLd data={structuredData} />

      <div className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
          <Link href="/single-audit" className="text-blue-600 hover:text-blue-800 text-sm">
            ← All states
          </Link>
          <h1 className="text-3xl font-bold text-gray-900 mt-3">
            Single Audit Organizations in {name}
          </h1>
          <p className="text-gray-600 mt-2 max-w-2xl">
            <strong>{total.toLocaleString()}</strong> organization{total === 1 ? '' : 's'} in {name}{' '}
            have filed a Single Audit with the{' '}
            <a
              href="https://www.fac.gov"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              Federal Audit Clearinghouse
            </a>
            . {withFindings.toLocaleString()} have findings on record
            {goingConcern > 0 && (
              <>
                ; {goingConcern.toLocaleString()} carry a going-concern opinion in their most recent
                audit
              </>
            )}
            . Ranked by federal awards expended in the most recent audited year.
          </p>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
        {orgs.length === MAX_ROWS && (
          <p className="text-sm text-gray-500 mb-3">
            Showing the top {MAX_ROWS} of {total.toLocaleString()} by federal awards expended.
          </p>
        )}

        <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-gray-900">Organization</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-900">City</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-900">
                  Federal awards<span className="hidden sm:inline"> (latest FY)</span>
                </th>
                <th className="px-4 py-3 text-right font-semibold text-gray-900">Audits</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-900">Findings</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {orgs.map((o) => (
                <tr key={o.ein} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Link
                      href={`/single-audit/${o.ein}`}
                      className="font-medium text-blue-600 hover:text-blue-800"
                    >
                      {o.name}
                    </Link>
                    <div className="mt-0.5 flex flex-wrap gap-1.5">
                      {o.isGoingConcern && (
                        <span className="rounded border border-severity-critical/30 bg-severity-critical/10 px-1.5 py-0.5 text-[10px] font-bold text-severity-critical">
                          GOING CONCERN
                        </span>
                      )}
                      {o.isLowRisk && (
                        <span className="rounded border border-green-200 bg-green-50 px-1.5 py-0.5 text-[10px] font-bold text-green-700">
                          LOW-RISK
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{o.city ?? '—'}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-900">
                    {usd(o.totalExpended)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-600">{o.auditCount}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-600">
                    {o.findingsCount}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-6 text-sm text-blue-900">
          Every figure here comes from public Federal Audit Clearinghouse filings. "Federal awards"
          is the total expended in each organization&apos;s most recent audited fiscal year; "findings"
          is the total across all its audits on file. Open any organization for the full year-by-year
          history and finding text.
        </div>

        <div className="mt-6">
          <Link href="/single-audit" className="text-blue-600 hover:text-blue-800 font-semibold text-sm">
            Browse another state →
          </Link>
        </div>
      </div>

      <Footer />
    </div>
  );
}
