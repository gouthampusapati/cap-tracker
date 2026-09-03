import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getAuditorProfile } from '@/lib/auditors';

/**
 * The audit firm's phone + email as reported to the FAC — public record,
 * but sign-in gated so it isn't bulk-scraped off the (cached, anonymous)
 * /auditors/[ein] page. Any verified account (Google or magic-link) can
 * read it; a guest identity has no Auth.js session and gets 401.
 * Mirror-backed via getAuditorProfile — 0 FAC calls.
 */
export const runtime = 'nodejs';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ ein: string }> }
): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }
  const { ein } = await params;
  if (!/^\d{9}$/.test(ein)) {
    return NextResponse.json({ error: 'bad_ein' }, { status: 400 });
  }
  const firm = await getAuditorProfile(ein);
  if (!firm) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  return NextResponse.json({ phone: firm.phone ?? null, email: firm.email ?? null });
}
