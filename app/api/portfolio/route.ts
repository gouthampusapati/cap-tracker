import { NextRequest, NextResponse } from 'next/server';
import {
  requirePortfolioUser,
  createPortfolio,
  renamePortfolio,
  deletePortfolio,
  setMonitored,
} from '@/lib/portfolio-store';

/**
 * Named monitoring portfolios for a signed-in user with an active
 * monitor_access grant. 401 without a session, 403 without access.
 *   POST   {name, eins?:string[]}            create
 *   PATCH  {id, name?, monitored?}           rename / toggle monitoring
 *   DELETE {id}                              delete
 */
export const runtime = 'nodejs';

const EIN_RE = /^\d{9}$/;

type OK = { userId: string };
async function gate(): Promise<OK | NextResponse> {
  const r = await requirePortfolioUser();
  if (r.ok) return { userId: r.user.userId };
  return NextResponse.json(
    { error: r.reason },
    { status: r.reason === 'unauthenticated' ? 401 : 403 }
  );
}
const body = (req: NextRequest) => req.json().catch(() => ({}) as Record<string, unknown>);

export async function POST(req: NextRequest): Promise<NextResponse> {
  const g = await gate();
  if (g instanceof NextResponse) return g;
  const b = await body(req);
  const name = typeof b.name === 'string' ? b.name : '';
  const eins: Array<{ ein: string }> = Array.isArray(b.eins)
    ? [...new Set((b.eins as unknown[]).map(String).filter((e) => EIN_RE.test(e)))].map((ein) => ({
        ein,
      }))
    : [];
  const res = await createPortfolio(g.userId, name, eins);
  if ('error' in res) return NextResponse.json(res, { status: 400 });
  return NextResponse.json(res);
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const g = await gate();
  if (g instanceof NextResponse) return g;
  const b = await body(req);
  const id = typeof b.id === 'string' ? b.id : '';
  if (!id) return NextResponse.json({ error: 'id_required' }, { status: 400 });

  if (typeof b.name === 'string') {
    const ok = await renamePortfolio(g.userId, id, b.name);
    if (!ok) return NextResponse.json({ error: 'not_found_or_invalid' }, { status: 400 });
  }
  if (typeof b.monitored === 'boolean') {
    const res = await setMonitored(g.userId, id, b.monitored);
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const g = await gate();
  if (g instanceof NextResponse) return g;
  const b = await body(req);
  const id = typeof b.id === 'string' ? b.id : '';
  const ok = id ? await deletePortfolio(g.userId, id) : false;
  return NextResponse.json({ ok }, { status: ok ? 200 : 400 });
}
