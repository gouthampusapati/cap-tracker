'use client';

import Link from 'next/link';
import { track } from '@vercel/analytics';
import { EVENT_MONITOR_CTA_CLICK } from '@/lib/analytics-events';

/**
 * Contextual "Monitor these organizations" CTA shown under portfolio
 * results. A multi-EIN portfolio lookup is the strongest free-side
 * signal of pass-through / adviser intent there is, so this is the
 * highest-leverage place to point people at the Founding Customer
 * Program — see the founding customer validation plan.
 *
 * Deliberately links to the founding form (/pricing#founding-form)
 * rather than embedding it: keeps the portfolio page a cacheable server
 * component, and routes through the one qualifying form everything else
 * uses. Same target and CTA label as app/founding-cta-button.tsx so the
 * two paths stay consistent. Fires EVENT_MONITOR_CTA_CLICK (surface
 * only, never an EIN) so we can see whether portfolio drives intent.
 */
export function MonitorPortfolioCta({ einCount }: { einCount: number }) {
  return (
    <div className="bg-blue-600 text-white rounded-lg p-6 mt-8">
      <p className="text-lg font-bold">Stop checking these one by one.</p>
      <p className="text-sm text-blue-50 mt-1 max-w-2xl">
        Add {einCount === 1 ? 'this organization' : `these ${einCount} organizations`} to a
        monitored portfolio and let Single Audit Intel watch the Federal Audit Clearinghouse for
        you — new audits, new findings, and management-decision deadlines, delivered as alerts.
        Now onboarding founding customers.
      </p>
      <Link
        href="/pricing#founding-form"
        onClick={() => track(EVENT_MONITOR_CTA_CLICK, { surface: 'portfolio-results' })}
        className="inline-block mt-4 bg-white text-blue-700 font-semibold px-4 py-2 rounded text-sm hover:bg-blue-50"
      >
        Request Founding Access →
      </Link>
      <p className="text-xs text-blue-100 mt-2">
        Takes you to a short form about what you need to monitor — not a checkout.
      </p>
    </div>
  );
}
