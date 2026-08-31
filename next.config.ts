import type { NextConfig } from 'next'

const config: NextConfig = {
  reactStrictMode: true,
  // The state OG image route (app/single-audit/state/[state]/opengraph-image.tsx
  // — the only dynamic OG route left; per-org/per-auditor were removed
  // for Vercel compute cost) reads the Inter .ttf files off disk via
  // lib/og.tsx. File-system reads aren't followed by Next's module
  // tracing, so name them explicitly or the fonts are missing from the
  // deployed function.
  outputFileTracingIncludes: {
    '/**/opengraph-image': ['./lib/og-fonts/*.ttf'],
  },
}

export default config
