'use client';

import { useEffect, useRef } from 'react';
import { track } from '@vercel/analytics';
import { EVENT_HOME_MOCKUP_VIEW } from '@/lib/analytics-events';

/**
 * Fires EVENT_HOME_MOCKUP_VIEW exactly once per page view, when the
 * portfolio monitoring mockup scrolls into view. Client island inside
 * the otherwise-static app/home-portfolio-mockup.tsx, same split as
 * app/pricing/pricing-view-tracker.tsx.
 *
 * Renders nothing. Observes its own placeholder node, walks up to the
 * enclosing <section> so the event fires as soon as any part of the
 * mockup section is visible, then disconnects.
 */
export function HomeMockupViewTracker() {
  const ref = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    const target = ref.current?.closest('section') ?? ref.current;
    if (!target) return;

    if (typeof IntersectionObserver === 'undefined') {
      track(EVENT_HOME_MOCKUP_VIEW);
      return;
    }

    let fired = false;
    const observer = new IntersectionObserver(
      (entries) => {
        if (fired) return;
        if (entries.some((e) => e.isIntersecting)) {
          fired = true;
          track(EVENT_HOME_MOCKUP_VIEW);
          observer.disconnect();
        }
      },
      { rootMargin: '0px 0px -20% 0px' },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  return <span ref={ref} aria-hidden="true" className="sr-only" />;
}
