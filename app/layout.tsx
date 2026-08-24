import { Inter } from 'next/font/google';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { Providers } from './providers';
import { SITE_URL } from '@/lib/site-url';
import './globals.css';

// Self-hosted by Next at build time — the font files ship from this
// site, not a Google Fonts <link> at runtime, so there's no third-party
// request added for visitors (matches the "independent tool, not
// tracking you" posture already established site-wide). Stripe-inspired
// redesign pass (see /Users/Bunnu/.claude/plans/merry-enchanting-kay.md)
// — Inter is the standard free substitute for that look, and its
// variable weights are what let the homepage hero go lighter than the
// old system-font bold.
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata = {
  // Without this, Next.js can't resolve the relative image URL in
  // app/opengraph-image.png's auto-generated <meta property="og:image">
  // to an absolute one and falls back to guessing "http://localhost:3000"
  // — confirmed by the build's own warning before this was added. Every
  // page's og:image would have pointed at localhost in production.
  metadataBase: new URL(SITE_URL),
  title: 'Single Audit Intelligence',
  description:
    'Search the Federal Audit Clearinghouse. See audit findings and corrective action plans for any organization that receives federal awards.',
  // app/icon.png (32x32) and app/apple-icon.png (180x180) are already
  // picked up automatically by Next.js's file-convention — this adds
  // the specific 16/32/48/512 sizes the build order doc asked for,
  // which file-convention alone doesn't give explicit control over.
  icons: {
    icon: [
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-48x48.png', sizes: '48x48', type: 'image/png' },
    ],
    apple: [{ url: '/apple-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  manifest: '/site.webmanifest',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        <Providers>
          {children}
        </Providers>
        {/* Pageview tracking only for now — no cookies, no PII. Custom
            event tracking (portfolio EIN counts, guide-vs-org click-through)
            lands with Task 4. */}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
