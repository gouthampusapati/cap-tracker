import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { SITE_URL } from '@/lib/site-url';
import { Footer } from '@/app/footer';
import { getAuditorProfile, stateName } from '@/lib/auditors';
import { AuditorClientsTable } from './auditor-clients-table';

export const revalidate = 86400;
export const maxDuration = 30;

function formatPhone(raw: string | null): string | null {
  if (!raw) return null;
  const d = raw.replace(/\D/g, '');
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  return raw;
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
    openGraph: { title, description, type: 'website', url: canonical },
  };
}

export default async function AuditorProfilePage(props: {
  params: Promise<{ ein: string }>;
}) {
  const { ein } = await props.params;
  const firm = await getAuditorProfile(ein);
  if (!firm) notFound();

  const phone = formatPhone(firm.phone);
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
  if (phone) jsonLd.telephone = phone;

  return (
    <div className="min-h-screen bg-gray-50">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

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

        {/* Contact — all from the firm's FAC filings, public record. */}
        {(firm.addressLine1 || phone || firm.contactName || firm.email) && (
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
              {phone && (
                <p>
                  <span className="font-semibold">Phone:</span>{' '}
                  <a href={`tel:${firm.phone?.replace(/\D/g, '')}`} className="text-blue-600 hover:underline">
                    {phone}
                  </a>
                </p>
              )}
              {firm.contactName && (
                <p>
                  <span className="font-semibold">Contact on file:</span> {firm.contactName}
                </p>
              )}
              {firm.email && (
                <p>
                  <span className="font-semibold">Email on file:</span> {firm.email}
                </p>
              )}
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
