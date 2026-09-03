'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

/**
 * The org page's portfolio-trail-aware links, as client components —
 * *specifically* so app/single-audit/[ein]/page.tsx can stop reading
 * searchParams in the Server Component and become ISR/edge-cacheable
 * (reading searchParams there forces a full dynamic render on every
 * request). Same trick as risk-assessment/back-links.tsx.
 *
 * A visitor arriving from a /portfolio "View →" link carries
 * ?from=portfolio&eins=… . On every other entry path (direct link,
 * search, sitemap, crawler) there's no trail — and that's the case the
 * server shell renders, so the cached HTML is always correct for the
 * common path; the portfolio enhancement kicks in after hydration.
 */

function usePortfolioTrail(): string | null {
  const sp = useSearchParams();
  const eins = sp.get('eins');
  return sp.get('from') === 'portfolio' && eins ? eins : null;
}

/** Header back-link: "← Back to portfolio" with the trail, else "← Back to home". */
export function BackLink() {
  const eins = usePortfolioTrail();
  return eins ? (
    <Link
      href={`/portfolio?eins=${encodeURIComponent(eins)}`}
      className="text-blue-600 hover:text-blue-800 text-sm"
    >
      ← Back to portfolio
    </Link>
  ) : (
    <Link href="/" className="text-blue-600 hover:text-blue-800 text-sm">
      ← Back to home
    </Link>
  );
}

/** The big button on the "not checked yet" state. */
export function BackButton() {
  const eins = usePortfolioTrail();
  const href = eins ? `/portfolio?eins=${encodeURIComponent(eins)}` : '/';
  return (
    <Link
      href={href}
      className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-semibold px-5 py-2.5 rounded-lg"
    >
      {eins ? 'Back to portfolio' : 'Back to home'}
    </Link>
  );
}

/**
 * "View federal awards & risk assessment →" — carries the portfolio
 * trail onward so the risk-assessment page's own back link can return
 * here with the same params.
 */
export function RiskAssessmentLink({ ein, className }: { ein: string; className?: string }) {
  const eins = usePortfolioTrail();
  const href = eins
    ? `/single-audit/${ein}/risk-assessment?from=portfolio&eins=${encodeURIComponent(eins)}`
    : `/single-audit/${ein}/risk-assessment`;
  return (
    // rel="nofollow": this is the crawl path to /risk-assessment, the one
    // route not backed by the mirror (every uncached hit = a live FAC
    // fetch). Also disallowed in robots.txt.
    <Link href={href} className={className} rel="nofollow">
      View federal awards &amp; risk assessment →
    </Link>
  );
}
