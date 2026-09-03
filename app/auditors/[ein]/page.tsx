import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { SITE_URL } from '@/lib/site-url';
import { Footer } from '@/app/footer';
import { getAuditorProfile, stateName } from '@/lib/auditors';
import { JsonLd } from '@/app/json-ld';
import { breadcrumbList } from '@/lib/structured-data';
import { AuditorClientsTable } from './auditor-clients-table';
import { AuditorContact } from './auditor-contact';

export const revalidate = 604800; // 7 days — tracks the weekly mirror sync
export const maxDuration = 30;

// Opt this dynamic segment into the full-route ISR cache. Without SOME
// generateStaticParams, Next renders it from scratch on every request
// and ignores `revalidate` above — meaning ~8.3K firm pages re-render
// (React + metadata) on every crawler hit. Prerender none at build
// (the profile query is heavy and unstable_cache already persists it);
// the first hit per EIN fills the route cache for the week. No
// searchParams here, so the shell is fully cacheable.
export function generateStaticParams() {
  return [];
}

export async function generateMetadata(props: {
  params: Promise<{ ein: string }>;
}): Promise<Metadata> {
  const { ein } = await props.params;
  const firm = await getAuditorProfile(ein);
  if (!firm) return { title: 'Auditor Not Found' };

  const loc = [firm.city, firm.state].filter(Boolean).join(', ');
  const title = `${firm.name} — Single Audit Firm${loc ? ` in ${loc}` : ''} | Single Audit Intelligence`;
  const description =
    `${firm.name}${loc ? ` (${loc})` : ''} has filed ${firm.auditCount.toLocaleString()} Single ` +
    `Audits for ${firm.clientCount.toLocaleString()} organizations with the Federal Audit ` +
    `Clearinghouse${firm.mostRecentYear ? `, most recently for FY ${firm.mostRecentYear}` : ''}. ` +
    `See the organizations audited and their findings.`;
  const canonical = `${SITE_URL}/auditors/${ein}`;

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      type: 'website',
      url: canonical,
      // The per-firm dynamic OG image was removed (Vercel compute cost);
      // point at the static site image explicitly — an inherited
      // file-convention image isn't merged into a custom openGraph block.
      images: [{ url: `${SITE_URL}/opengraph-image.png`, width: 1200, height: 630 }],
    },
  };
}

export default async function AuditorProfilePage(props: {
  params: Promise<{ ein: string }>;
}) {
  const { ein } = await props.params;
  const firm = await getAuditorProfile(ein);
  if (!firm) notFound();

  const stName = stateName(firm.state);
  const canonical = `${SITE_URL}/auditors/${ein}`;

  const jsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'AccountingService',
    name: firm.name,
    url: canonical,
    identifier: firm.ein,
    description: `CPA firm that performs Single Audits under 2 CFR 200 Subpart F (Uniform Guidance).`,
  };
  if (firm.addressLine1 || firm.city || firm.state) {
    jsonLd.address = {
      '@type': 'PostalAddress',
      streetAddress: firm.addressLine1 || undefined,
      addressLocality: firm.city || undefined,
      addressRegion: firm.state || undefined,
      postalCode: firm.zip || undefined,
      addressCountry: 'US',
    };
  }
  // firm.phone is deliberately NOT in the structured data — it's sign-in
  // gated now (see AuditorContact), so it must not sit in the cached,
  // anonymously-served page in any form.

  const breadcrumb = breadcrumbList([
    { name: 'Single Audit Intelligence', url: SITE_URL },
    { name: 'Single Audit Firms', url: `${SITE_URL}/auditors` },
    { name: firm.name, url: canonical },
  ]);

  return (
    <div className="min-h-screen bg-gray-50">
      <JsonLd data={[jsonLd, breadcrumb]} />

      <div className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
          <Link
            href="/auditors"
            className="inline-block text-sm text-blue-600 hover:text-blue-800 font-semibold mb-3"
          >
            ← All Single Audit firms
          </Link>
          <h1 className="text-3xl font-bold text-gray-900 mb-1">{firm.name}</h1>
          <p className="text-gray-600">
            Single Audit firm{stName ? ` · ${firm.city ? `${firm.city}, ` : ''}${stName}` : ''}
          </p>
          {firm.altNames.length > 0 && (
            <p className="text-xs text-gray-400 mt-1">
              Also filed as: {firm.altNames.join(' · ')}
            </p>
          )}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
        {/* Stat row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          <div className="bg-white p-4 rounded-lg border border-gray-200">
            <div className="text-2xl font-bold text-gray-900">{firm.auditCount.toLocaleString()}</div>
            <div className="text-sm text-gray-600">Single Audits filed</div>
          </div>
          <div className="bg-white p-4 rounded-lg border border-gray-200">
            <div className="text-2xl font-bold text-gray-900">
              {firm.clientCount.toLocaleString()}
            </div>
            <div className="text-sm text-gray-600">Organizations audited</div>
          </div>
          <div className="bg-white p-4 rounded-lg border border-gray-200">
            <div className="text-2xl font-bold text-gray-900">
              {firm.totalFindings.toLocaleString()}
            </div>
            <div className="text-sm text-gray-600">Findings across those audits</div>
          </div>
          <div className="bg-white p-4 rounded-lg border border-gray-200">
            <div className="text-2xl font-bold text-gray-900">{firm.mostRecentYear ?? '—'}</div>
            <div className="text-sm text-gray-600">Most recent audit year</div>
          </div>
        </div>

        {/* Contact — all from the firm's FAC filings, public record.
            Phone + email are sign-in gated (AuditorContact); address and
            contact name stay public. */}
        {(firm.addressLine1 || firm.city || firm.contactName || firm.phone || firm.email) && (
          <div className="bg-white border border-gray-200 rounded-lg p-5 mb-8">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">
              Contact (as reported to the Federal Audit Clearinghouse)
            </h2>
            <div className="text-sm text-gray-700 space-y-1">
              {(firm.addressLine1 || firm.city) && (
                <p>
                  {[firm.addressLine1, [firm.city, firm.state].filter(Boolean).join(', '), firm.zip]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              )}
              {firm.contactName && (
                <p>
                  <span className="font-semibold">Contact on file:</span> {firm.contactName}
                </p>
              )}
              <AuditorContact ein={ein} hasPhone={!!firm.phone} hasEmail={!!firm.email} />
            </div>
            <p className="text-xs text-gray-400 mt-3">
              From this firm&apos;s Single Audit submissions
              {firm.multiState
                ? ` — this firm has filed from multiple states, so the address above is its most common office, not its only one`
                : ''}
              . Contact details can change — verify with the firm directly.
            </p>
          </div>
        )}

        <h2 className="text-lg font-bold text-gray-900 mb-1">
          Organizations audited by {firm.name}
        </h2>
        <p className="text-sm text-gray-500 mb-4">
          Every organization this firm filed a Single Audit for, newest first
          {firm.clientsTruncated ? ` (showing the first ${firm.clients.length})` : ''}. Findings
          counts are from those filings.
        </p>
        <AuditorClientsTable clients={firm.clients} />

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-5 my-8 text-sm text-blue-900">
          <strong>Data source:</strong> Everything on this page comes from public Single Audit
          filings in the{' '}
          <a href="https://www.fac.gov" target="_blank" rel="noopener noreferrer" className="underline">
            Federal Audit Clearinghouse
          </a>
          . Audit and finding counts describe the filings on record — they are not a rating of the
          firm&apos;s work. This site is not affiliated with the firm or with the FAC.
        </div>
      </div>

      <Footer />
    </div>
  );
}
