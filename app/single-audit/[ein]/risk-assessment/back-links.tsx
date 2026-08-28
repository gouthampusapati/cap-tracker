'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

/**
 * Back-navigation for the risk-assessment page. A client component
 * *specifically* so the page itself stays statically renderable / ISR-
 * cached — reading searchParams in the server component would force
 * every request to re-render, and each render can spend a live FAC call
 * (see getFederalAwardsForOrg). Here the params are read after
 * hydration; the server shell ships the plain "back to audit history"
 * link as the Suspense fallback, which is already correct for every
 * non-portfolio entry path.
 *
 * When arriving via a portfolio row (org page forwards
 * ?from=portfolio&eins=...), both links carry the portfolio trail
 * onward so the org page's own back link still points at the portfolio.
 */
export function BackLinks({ ein }: { ein: string }) {
  const sp = useSearchParams();
  const eins = sp.get('eins');
  const fromPortfolio = sp.get('from') === 'portfolio' && !!eins;

  const orgHref = fromPortfolio
    ? `/single-audit/${ein}?from=portfolio&eins=${encodeURIComponent(eins!)}`
    : `/single-audit/${ein}`;
  const portfolioHref = fromPortfolio
    ? `/portfolio?eins=${encodeURIComponent(eins!)}`
    : null;

  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 mb-3">
      {portfolioHref && (
        <Link
          href={portfolioHref}
          className="inline-block text-sm text-blue-600 hover:text-blue-800 font-semibold"
        >
          ← Back to portfolio
        </Link>
      )}
      <Link
        href={orgHref}
        className="inline-block text-sm text-blue-600 hover:text-blue-800 font-semibold"
      >
        ← Back to audit history
      </Link>
    </div>
  );
}
