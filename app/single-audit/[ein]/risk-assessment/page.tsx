import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Metadata } from 'next';
import { SITE_URL } from '@/lib/site-url';
import { Footer } from '@/app/footer';
import { getFederalAwardsForOrg } from '@/lib/federal-awards';
import { AwardTable } from './award-table';

// federal_awards is fetched live (not mirrored — see
// lib/fac-api.ts:getFederalAwardsForReports). ISR caches the rendered
// page for an hour per EIN, so a popular org costs at most one live FAC
// fetch per hour and zero DB writes.
export const revalidate = 3600;

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
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white border border-gray-200 rounded-lg p-8 text-center">
          <h1 className="text-xl font-bold text-gray-900 mb-3">Federal awards not loaded</h1>
          <p className="text-gray-600 mb-6">
            The shared Federal Audit Clearinghouse request budget is fully used for this hour, so
            the award-level detail couldn&apos;t be fetched right now. Check back in a little while.
          </p>
          <Link
            href={`/single-audit/${ein}`}
            className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-semibold px-5 py-2.5 rounded-lg"
          >
            Back to audit history
          </Link>
        </div>
      </div>
    );
  }

  const { data } = result;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
          <Link
            href={`/single-audit/${ein}`}
            className="inline-block text-sm text-blue-600 hover:text-blue-800 font-semibold mb-3"
          >
            ← Back to audit history
          </Link>
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
