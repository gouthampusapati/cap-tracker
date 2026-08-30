import { ImageResponse } from 'next/og';
import { getStateOrgIndex, stateName } from '@/lib/orgs';
import { OgCard, OG_SIZE, OG_CONTENT_TYPE, loadOgFonts, type OgStat } from '@/lib/og';

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = 'Single Audit organizations by state — Single Audit Intelligence';

export const revalidate = 86400;

export default async function Image({ params }: { params: Promise<{ state: string }> }) {
  const { state: raw } = await params;
  const code = raw.toUpperCase();
  const name = stateName(code);

  const [{ total, withFindings, goingConcern }, fonts] = await Promise.all([
    getStateOrgIndex(code, 1),
    loadOgFonts(),
  ]);

  const stats: OgStat[] = [
    { value: total.toLocaleString(), label: 'organizations' },
    { value: withFindings.toLocaleString(), label: 'with findings' },
  ];
  if (goingConcern > 0) {
    stats.push({ value: goingConcern.toLocaleString(), label: 'going concern' });
  }

  return new ImageResponse(
    (
      <OgCard
        eyebrow="Single Audit organizations"
        title={name ?? 'By state'}
        subtitle="Federal award recipients audited under 2 CFR 200, largest first"
        stats={total > 0 ? stats : undefined}
      />
    ),
    { ...size, fonts }
  );
}
