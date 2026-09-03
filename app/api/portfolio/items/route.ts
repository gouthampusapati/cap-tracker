import { NextRequest, NextResponse } from 'next/server';
import { requirePortfolioUser, addItems, removeItem } from '@/lib/portfolio-store';

/**
 *   POST   {id, items:[{ein,label?}] | eins:string[]}   add EINs to a portfolio
 *   DELETE {id, ein}                                     remove one
 * Gated on an active monitor_access grant.
 */
export const runtime = 'nodejs';

const EIN_RE = /^\d{9}$/;

async function gate() {
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
  const id = typeof b.id === 'string' ? b.id : '';
  if (!id) return NextResponse.json({ error: 'id_required' }, { status: 400 });

  let items: Array<{ ein: string; label?: string | null }> = [];
  if (Array.isArray(b.items)) {
    items = (b.items as unknown[])
      .map((i) => (i && typeof i === 'object' ? (i as { ein?: unknown; label?: unknown }) : {}))
      .filter((i): i is { ein: string; label?: string } => typeof i.ein === 'string')
      .map((i) => ({ ein: i.ein, label: typeof i.label === 'string' ? i.label : null }));
  } else if (Array.isArray(b.eins)) {
    items = (b.eins as unknown[]).map(String).map((ein) => ({ ein }));
  }
  items = items.filter((i) => EIN_RE.test(i.ein));
  if (items.length === 0) return NextResponse.json({ error: 'no_valid_eins' }, { status: 400 });

  const res = await addItems(g.userId, id, items);
  return NextResponse.json(res);
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const g = await gate();
  if (g instanceof NextResponse) return g;
  const b = await body(req);
  const id = typeof b.id === 'string' ? b.id : '';
  const ein = typeof b.ein === 'string' ? b.ein : '';
  if (!id || !EIN_RE.test(ein)) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  const ok = await removeItem(g.userId, id, ein);
  return NextResponse.json({ ok }, { status: ok ? 200 : 400 });
}
