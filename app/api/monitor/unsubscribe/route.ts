import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { monitorPrefs } from '@/lib/db/schema';
import { verifyMonitorUnsubToken } from '@/lib/monitor-token';
import { SITE_URL } from '@/lib/site-url';

/**
 * One-click unsubscribe from the watchlist digest emails
 * (scripts/monitor-fac-changes.mjs). GET is the link in the email body;
 * POST is RFC 8058 List-Unsubscribe-Post one-click. Both just set
 * monitor_prefs.digest_opt_out — the alerts still accrue and are visible
 * on /watchlist, they're only kept out of email.
 */
export const runtime = 'nodejs';

async function optOut(userId: string): Promise<void> {
  const now = new Date();
  await db
    .insert(monitorPrefs)
    .values({ userId, digestOptOut: true, updatedAt: now })
    .onConflictDoUpdate({
      target: monitorPrefs.userId,
      set: { digestOptOut: true, updatedAt: now },
    });
}

function validate(req: NextRequest): string | null {
  const u = req.nextUrl.searchParams.get('u') ?? '';
  const t = req.nextUrl.searchParams.get('t') ?? '';
  return verifyMonitorUnsubToken(u, t) ? u : null;
}

const page = (heading: string, body: string) =>
  `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${heading}</title>
<div style="font-family:system-ui,sans-serif;max-width:480px;margin:15vh auto;padding:0 24px;text-align:center">
  <h1 style="font-size:20px">${heading}</h1>
  <p style="color:#555">${body}</p>
  <p><a href="${SITE_URL}/watchlist" style="color:#2563eb;font-weight:600">Manage your watchlist</a></p>
</div>`;

export async function GET(req: NextRequest) {
  const userId = validate(req);
  if (!userId) {
    return new NextResponse(page('Invalid link', 'This unsubscribe link is not valid.'), {
      status: 400,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
  }
  await optOut(userId);
  return new NextResponse(
    page(
      'Unsubscribed',
      'You will no longer receive watchlist digest emails. Changes to your monitored organizations are still tracked and shown on your watchlist.'
    ),
    { headers: { 'content-type': 'text/html; charset=utf-8' } }
  );
}

export async function POST(req: NextRequest) {
  const userId = validate(req);
  if (!userId) return new NextResponse(null, { status: 400 });
  await optOut(userId);
  return new NextResponse(null, { status: 200 });
}
