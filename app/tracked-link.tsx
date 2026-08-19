'use client';

import Link from 'next/link';
import { track } from '@vercel/analytics';
import type { ComponentProps } from 'react';

/**
 * A next/link that also fires a custom Vercel Analytics event on click —
 * lets server-rendered pages (org pages, guides) track click-through
 * without converting the whole page to a client component. Only the
 * event name/properties are recorded, never the specific org/EIN being
 * viewed — see lib/analytics-events.ts for what's actually tracked and why.
 */
export function TrackedLink({
  event,
  eventData,
  ...props
}: ComponentProps<typeof Link> & {
  event: string;
  eventData?: Record<string, string | number | boolean>;
}) {
  return <Link {...props} onClick={() => track(event, eventData)} />;
}
