'use client';

import { useEffect } from 'react';
import { track } from '@vercel/analytics';
import { EVENT_PRICING_VIEW } from '@/lib/analytics-events';

/**
 * Fires EVENT_PRICING_VIEW once per mount. Split into its own client
 * component so app/pricing/page.tsx can stay a server component (it's
 * otherwise all static content + metadata). No props, renders nothing.
 */
export function PricingViewTracker() {
  useEffect(() => {
    track(EVENT_PRICING_VIEW);
  }, []);
  return null;
}
