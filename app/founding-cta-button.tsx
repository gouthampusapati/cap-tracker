'use client';

import Link from 'next/link';
import { track } from '@vercel/analytics';
import { EVENT_MONITOR_CTA_CLICK } from '@/lib/analytics-events';

/**
 * "Request Founding Access" button that routes to the qualifying form on
 * /pricing (#founding-form) and fires EVENT_MONITOR_CTA_CLICK with the
 * surface it was clicked from. Used anywhere we want to point at the
 * founding funnel without embedding the whole form — e.g. the homepage
 * closing band, which stays lean and sends everyone through the one
 * form on /pricing rather than running its own lighter capture.
 */
export function FoundingCtaButton({
  surface,
  label = 'Request Founding Access',
  className = '',
}: {
  surface: string;
  label?: string;
  className?: string;
}) {
  return (
    <Link
      href="/pricing#founding-form"
      onClick={() => track(EVENT_MONITOR_CTA_CLICK, { surface })}
      className={
        className ||
        'inline-block bg-accent hover:opacity-90 text-white font-semibold px-5 py-2.5 rounded-md text-sm'
      }
    >
      {label}
    </Link>
  );
}
