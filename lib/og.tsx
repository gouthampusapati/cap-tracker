import 'server-only';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Shared chrome + fonts for the dynamic Open Graph images
 * (app/**\/opengraph-image.tsx). Each route file stays tiny: fetch its
 * data, then `new ImageResponse(<OgCard … />, { ...OG_SIZE, fonts })`.
 *
 * Satori (what ImageResponse renders with) supports only a subset of
 * CSS — flexbox, inline styles, no `gap` on some versions, every element
 * with >1 child needs an explicit `display: 'flex'`. Keep it simple.
 */

export const OG_SIZE = { width: 1200, height: 630 } as const;
export const OG_CONTENT_TYPE = 'image/png';

const INK = '#122620'; // --color-primary
const ACCENT = '#004aad'; // --color-accent
const MUTED = '#6b6b68'; // --color-muted
const BORDER = '#e2e2e0';
const CRITICAL = '#b91c1c'; // --color-severity-critical
const GREEN = '#15803d';

type FontWeight = 400 | 700;
export type OgFont = { name: string; data: Buffer; weight: FontWeight; style: 'normal' };

let fontsPromise: Promise<OgFont[]> | null = null;

// The .ttf files live in lib/og-fonts/. `fetch(new URL(…, import.meta.url))`
// doesn't work here — webpack rewrites the asset to a bare "/_next/…"
// path with no origin, which Node's fetch can't parse — so read them off
// disk. next.config.ts's outputFileTracingIncludes makes sure they're in
// the deployed function bundle (fs paths aren't followed by tracing).
const FONT_DIR = join(process.cwd(), 'lib', 'og-fonts');

/** Inter Regular + Bold, loaded once per server instance. */
export function loadOgFonts(): Promise<OgFont[]> {
  fontsPromise ??= Promise.all([
    readFile(join(FONT_DIR, 'Inter-Regular.ttf')),
    readFile(join(FONT_DIR, 'Inter-Bold.ttf')),
  ]).then(([regular, bold]) => [
    { name: 'Inter', data: regular, weight: 400 as const, style: 'normal' as const },
    { name: 'Inter', data: bold, weight: 700 as const, style: 'normal' as const },
  ]);
  return fontsPromise;
}

export type OgStat = { value: string; label: string };
export type OgBadge = { text: string; tone: 'critical' | 'good' };

/** Cut a string to `max` chars on a word boundary, appending an ellipsis. */
export function ogTruncate(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

export function OgCard({
  eyebrow,
  title,
  subtitle,
  stats,
  badge,
  footer = 'Federal Audit Clearinghouse data · singleauditintel.com',
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  stats?: OgStat[];
  badge?: OgBadge;
  footer?: string;
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        background: '#ffffff',
        fontFamily: 'Inter',
        color: INK,
      }}
    >
      {/* accent rail */}
      <div style={{ display: 'flex', height: 12, background: ACCENT }} />

      {/* body */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          padding: '56px 72px',
        }}
      >
        {/* brand line */}
        <div style={{ display: 'flex', alignItems: 'center', fontSize: 26, fontWeight: 700 }}>
          <span style={{ color: ACCENT }}>SAI</span>
          <span style={{ marginLeft: 12, color: INK }}>Single Audit Intelligence</span>
        </div>

        <div
          style={{
            display: 'flex',
            fontSize: 22,
            fontWeight: 700,
            letterSpacing: 2,
            textTransform: 'uppercase',
            color: MUTED,
            marginTop: 48,
          }}
        >
          {eyebrow}
        </div>

        <div
          style={{
            display: 'flex',
            fontSize: title.length > 46 ? 56 : 68,
            fontWeight: 700,
            lineHeight: 1.1,
            marginTop: 14,
          }}
        >
          {title}
        </div>

        {subtitle ? (
          <div style={{ display: 'flex', fontSize: 30, color: MUTED, marginTop: 18 }}>{subtitle}</div>
        ) : null}

        {badge ? (
          <div
            style={{
              display: 'flex',
              alignSelf: 'flex-start',
              marginTop: 24,
              padding: '8px 18px',
              borderRadius: 8,
              fontSize: 22,
              fontWeight: 700,
              letterSpacing: 1,
              color: '#ffffff',
              background: badge.tone === 'critical' ? CRITICAL : GREEN,
            }}
          >
            {badge.text}
          </div>
        ) : null}

        {/* spacer */}
        <div style={{ display: 'flex', flex: 1 }} />

        {stats && stats.length > 0 ? (
          <div style={{ display: 'flex' }}>
            {stats.map((s, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  marginRight: 24,
                  padding: '18px 28px',
                  border: `2px solid ${BORDER}`,
                  borderRadius: 12,
                  minWidth: 180,
                }}
              >
                <div style={{ display: 'flex', fontSize: 40, fontWeight: 700 }}>{s.value}</div>
                <div style={{ display: 'flex', fontSize: 20, color: MUTED, marginTop: 4 }}>
                  {s.label}
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {/* footer */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '20px 72px',
          borderTop: `2px solid ${BORDER}`,
          fontSize: 22,
          color: MUTED,
        }}
      >
        {footer}
      </div>
    </div>
  );
}
