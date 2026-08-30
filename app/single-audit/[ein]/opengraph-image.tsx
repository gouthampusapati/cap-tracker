import { ImageResponse } from 'next/og';
import { getOrgSummary, stateName } from '@/lib/orgs';
import { OgCard, OG_SIZE, OG_CONTENT_TYPE, loadOgFonts, ogTruncate, type OgStat, type OgBadge } from '@/lib/og';

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = 'Single Audit history and findings — Single Audit Intelligence';

// Same weekly cadence as the page itself — the summary row this reads
// only changes on a mirror sync.
export const revalidate = 86400;

export default async function Image({ params }: { params: Promise<{ ein: string }> }) {
  const { ein } = await params;
  const [org, fonts] = await Promise.all([getOrgSummary(ein), loadOgFonts()]);

  if (!org) {
    return new ImageResponse(
      (
        <OgCard
          eyebrow="Single Audit record"
          title="Organization audit history"
          subtitle={`EIN ${ein}`}
        />
      ),
      { ...size, fonts }
    );
  }

  const region = org.state ? stateName(org.state) : null;
  const stats: OgStat[] = [
    { value: String(org.auditCount), label: org.auditCount === 1 ? 'audit on file' : 'audits on file' },
    { value: String(org.findingsCount), label: org.findingsCount === 1 ? 'finding' : 'findings' },
  ];
  if (org.mostRecentYear) stats.push({ value: `FY ${org.mostRecentYear}`, label: 'most recent' });

  const badge: OgBadge | undefined = org.isGoingConcern
    ? { text: 'GOING CONCERN', tone: 'critical' }
    : org.isLowRisk
      ? { text: 'LOW-RISK AUDITEE', tone: 'good' }
      : undefined;

  return new ImageResponse(
    (
      <OgCard
        eyebrow="Single Audit record"
        title={ogTruncate(org.name, 64)}
        subtitle={[`EIN ${org.ein}`, region].filter(Boolean).join('  ·  ')}
        stats={stats}
        badge={badge}
      />
    ),
    { ...size, fonts }
  );
}
