import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Metadata } from 'next';
import { SITE_URL } from '@/lib/site-url';
import { Footer } from '@/app/footer';
import { getFederalAwardsForOrg } from '@/lib/federal-awards';
import { breadcrumbList } from '@/lib/structured-data';
import { JsonLd } from '@/app/json-ld';
import { AwardTable } from './award-table';
import { BackLinks } from './back-links';

// federal_awards is fetched live (not mirrored — see
// lib/fac-api.ts:getFederalAwardsForReports). ISR caches the rendered
// page per EIN; SEFA/federal-award data changes at most weekly (the FAC
// bulk-export cadence), so match the org page's 7-day window — ~7x fewer
// live award fetches than the old 24h value, which was re-fetching every
// distinct EIN daily and keeping lib/fac-budget.ts pinned.
export const revalidate = 604800;

// Prerender nothing at build, but opt into the ISR / full-route cache:
// without an explicit generateStaticParams a dynamic segment is rendered
// from scratch on every request and the `revalidate` above is ignored —
// meaning a live FAC fetch (federal_awards isn't mirrored) on every hit.
// With this, the first hit per EIN renders live and the rest of the hour
// is served from cache. dynamicParams stays true (default) so any EIN
// still works on demand. Same pattern as the parent org page.
export function generateStaticParams() {
  return [];
}

// One live FAC call (plus a mirror-backed getPublicOrg that's usually
// free). 30s keeps headroom for FAC latency on a big state agency's SEFA
// while staying under the Hobby 60s ceiling.
export const maxDuration = 30;

export async function generateMetadata(props: {
  params: Promise<{ ein: string }>;
}): Promise<Metadata> {
  const { ein } = await props.params;

  let result;
  try {
    result = await getFederalAwardsForOrg(ein);
  } catch {
    return { title: 'Temporarily Unavailable' };
  }

  if (result.kind === 'not-found') {
    return { title: 'Organization Not Found' };
  }
  if (result.kind === 'unavailable') {
    return {
      title: 'Federal Awards — Temporarily Unavailable',
      description: 'This page could not be loaded right now. Try again shortly.',
    };
  }

  const { name } = result.data;
  const title = `${name} — Federal Awards & Risk Assessment | Single Audit Intelligence`;
  const description = `Schedule of Expenditures of Federal Awards for ${name} (EIN: ${ein}) — major programs, award opinions, pass-through funding, and findings by award.`;
  const canonical = `${SITE_URL}/single-audit/${ein}/risk-assessment`;

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      type: 'website',
      url: canonical,
      images: [{ url: `${SITE_URL}/opengraph-image.png`, width: 1200, height: 630 }],
    },
  };
}

export default async function RiskAssessmentPage(props: {
  params: Promise<{ ein: string }>;
}) {
  const { ein } = await props.params;
  const result = await getFederalAwardsForOrg(ein);

  if (result.kind === 'not-found') notFound();

  if (result.kind === 'unavailable') {
    // Throw rather than render a fallback: `revalidate` would otherwise
    // cache this "not loaded" state for a week, so a single budget blip
    // would leave the page broken long after the budget recovered. A
    // thrown error is not ISR-cached — Next re-renders on the next
    // request — and ./error.tsx shows a retry-able message. With the
    // two-key budget in lib/fac-budget.ts this branch is now rare.
    throw new Error('FEDERAL_AWARDS_UNAVAILABLE');
  }

  const { data } = result;

  const orgUrl = `${SITE_URL}/single-audit/${ein}`;
  const breadcrumb = breadcrumbList([
    { name: 'Single Audit Intelligence', url: SITE_URL },
    { name: data.name, url: orgUrl },
    { name: 'Federal Awards & Risk Assessment', url: `${orgUrl}/risk-assessment` },
  ]);

  return (
    <div className="min-h-screen bg-gray-50">
      <JsonLd data={breadcrumb} />
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
          <Suspense
            fallback={
              <Link
                href={`/single-audit/${ein}`}
                className="inline-block text-sm text-blue-600 hover:text-blue-800 font-semibold mb-3"
              >
                ← Back to audit history
              </Link>
            }
          >
            <BackLinks ein={ein} />
          </Suspense>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">{data.name}</h1>
          <p className="text-gray-600 text-lg mb-1">Federal awards & risk assessment</p>
          <div className="text-gray-600 space-y-1">
            <p>
              <span className="font-semibold">EIN:</span> {data.ein}
            </p>
            {data.stale ? (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 inline-block">
                Audit history shown from{' '}
                {data.syncedAt.toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}{' '}
                — could not be refreshed. Award lines below were fetched live just now.
              </p>
            ) : (
              <p className="text-xs text-gray-400">
                Data as of{' '}
                {data.syncedAt.toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
        <p className="text-sm text-gray-600 max-w-prose mb-6">
          Every federal award line from this organization&apos;s Schedule of Expenditures of Federal
          Awards (SEFA), by audit year. <strong>Major programs</strong> are those the auditor
          selected for in-depth compliance testing; the opinion shown is the auditor&apos;s opinion
          on that program&apos;s compliance. <strong>Pass-through</strong> marks funds this
          organization distributed to subrecipients.
        </p>

        {data.years.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">No award detail on file</h2>
            <p className="text-gray-600">
              The Federal Audit Clearinghouse has no Schedule of Expenditures of Federal Awards rows
              for this EIN&apos;s reports. This can happen for audits filed before FAC captured
              award-level data, or for filings still being processed.{' '}
              <a
                href={`https://app.fac.gov/dissemination/search/?query={"_search_term":"${data.ein}"}`}
                target="_blank"
                rel="noopener noreferrer"
                className="underline font-semibold hover:text-gray-900"
              >
                Verify at fac.gov →
              </a>
            </p>
          </div>
        ) : (
          <div className="space-y-10">
            {data.years.map((year) => (
              <AwardTable
                key={year.reportId}
                year={year}
                ein={data.ein}
                findingAnchorsByAward={data.findingAnchorsByAward}
              />
            ))}
          </div>
        )}

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 my-8">
          <p className="text-sm text-blue-900">
            <strong>Data source:</strong> Award detail comes from the{' '}
            <a
              href="https://app.fac.gov/dissemination/search/"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold hover:text-blue-700"
            >
              Federal Audit Clearinghouse
            </a>{' '}
            <code>federal_awards</code> table. All data is public domain.{' '}
            <a
              href={`https://app.fac.gov/dissemination/search/?query={"_search_term":"${data.ein}"}`}
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold hover:text-blue-700"
            >
              Verify this organization at fac.gov
            </a>
            .
          </p>
        </div>
      </div>

      <Footer />
    </div>
  );
}
