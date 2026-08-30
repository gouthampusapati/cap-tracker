import { ImageResponse } from 'next/og';
import { getAuditorFirmSummary, stateName } from '@/lib/auditors';
import { OgCard, OG_SIZE, OG_CONTENT_TYPE, loadOgFonts, ogTruncate, type OgStat } from '@/lib/og';

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = 'Single Audit firm — filings, clients, and findings on Single Audit Intelligence';

export const revalidate = 86400;

export default async function Image({ params }: { params: Promise<{ ein: string }> }) {
  const { ein } = await params;
  const [firm, fonts] = await Promise.all([getAuditorFirmSummary(ein), loadOgFonts()]);

  if (!firm) {
    return new ImageResponse(
      <OgCard eyebrow="Single Audit firm" title="Audit firm profile" subtitle={`EIN ${ein}`} />,
      { ...size, fonts }
    );
  }

  const region = firm.state ? stateName(firm.state) : null;
  const location = [firm.city, region].filter(Boolean).join(', ');

  const stats: OgStat[] = [
    { value: firm.auditCount.toLocaleString(), label: 'Single Audits filed' },
    { value: firm.clientCount.toLocaleString(), label: 'organizations audited' },
  ];
  if (firm.mostRecentYear) stats.push({ value: `FY ${firm.mostRecentYear}`, label: 'most recent' });

  return new ImageResponse(
    (
      <OgCard
        eyebrow="Single Audit firm"
        title={ogTruncate(firm.name, 64)}
        subtitle={location || undefined}
        stats={stats}
      />
    ),
    { ...size, fonts }
  );
}
