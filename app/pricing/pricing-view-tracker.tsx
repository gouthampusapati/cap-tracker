'use client';

import { useEffect } from 'react';
import { track } from '@vercel/analytics';
import { EVENT_PRICING_VIEW } from '@/lib/analytics-events';

/**
 * Client-only side effects for /pricing, split out so the page itself
 * stays a server component:
 *
 *  1. Fires EVENT_PRICING_VIEW once per mount.
 *  2. Scrolls to the #founding / #founding-form target on load. Next's
 *     App Router does not reliably honour a hash when the target is far
 *     below the fold on a fresh navigation (scroll restoration resets to
 *     top after hydration), and every cross-page founding CTA (homepage
 *     band, portfolio results) lands here with a hash. We wait for the
 *     window `load` event so images/fonts have settled and the target's
 *     final position is known, then jump once (no smooth animation —
 *     a long animated scroll from the top of a tall page is worse than
 *     an instant landing). In-page anchor clicks work natively and are
 *     untouched by this.
 *
 * Renders nothing.
 */
export function PricingViewTracker() {
  useEffect(() => {
    track(EVENT_PRICING_VIEW);

    const id = window.location.hash.slice(1);
    if (id !== 'founding' && id !== 'founding-form') return;

    let done = false;
    const jump = () => {
      if (done) return;
      const el = document.getElementById(id);
      if (!el) return;
      done = true;
      el.scrollIntoView({ block: 'start' });
    };

    if (document.readyState === 'complete') {
      // Already loaded — one rAF is enough for layout to be current.
      requestAnimationFrame(jump);
    } else {
      window.addEventListener('load', () => requestAnimationFrame(jump), { once: true });
      // Fallback in case `load` already fired between render and effect.
      const t = setTimeout(jump, 600);
      return () => clearTimeout(t);
    }
  }, []);

  return null;
}
