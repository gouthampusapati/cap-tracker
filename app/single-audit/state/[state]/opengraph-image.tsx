import { ImageResponse } from 'next/og';
import { getStateOrgIndex, stateName, US_STATES } from '@/lib/orgs';
import { OgCard, OG_SIZE, OG_CONTENT_TYPE, loadOgFonts, type OgStat } from '@/lib/og';

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = 'Single Audit organizations by state — Single Audit Intelligence';

// All 56 state/territory OG images are built at deploy and never
// regenerate — a fixed, tiny set, unlike the per-org and per-auditor OG
// routes (removed: 68K + 8K Satori/resvg rasterizations on demand were
// the bulk of Vercel's Fluid Active CPU and ISR-write usage). Those
// pages fall back to the static app/opengraph-image.png.
export const dynamicParams = false;
export const revalidate = false;

export function generateStaticParams() {
  return Object.keys(US_STATES).map((code) => ({ state: code.toLowerCase() }));
}

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
