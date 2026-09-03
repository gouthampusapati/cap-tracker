import 'server-only';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { db } from '@/lib/db';
import { users, portfolio, portfolioItem, monitorAlert, monitorState } from '@/lib/db/schema';
import { auth } from '@/auth';
import { hasActiveMonitorAccess } from '@/lib/monitor-access';

/** During validation: bounds so a bulk import can't blow up the weekly job. */
export const MAX_ITEMS_PER_PORTFOLIO = 50;
export const MAX_MONITORED_EINS = 100;

const EIN_RE = /^\d{9}$/;

export interface PortfolioUser {
  userId: string;
  email: string;
}

/**
 * The signed-in user IF they have an active monitor_access grant. The
 * whole named-portfolio / monitoring surface is gated on this — no grant,
 * no portfolios.
 */
export async function requirePortfolioUser(): Promise<
  { ok: true; user: PortfolioUser } | { ok: false; reason: 'unauthenticated' | 'no_access' }
> {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return { ok: false, reason: 'unauthenticated' };
  if (!(await hasActiveMonitorAccess(email))) return { ok: false, reason: 'no_access' };
  const [u] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (!u) return { ok: false, reason: 'no_access' };
  return { ok: true, user: { userId: u.id, email } };
}

export interface PortfolioSummary {
  id: string;
  name: string;
  monitored: boolean;
  itemCount: number;
  createdAt: Date;
}

export async function listPortfolios(userId: string): Promise<PortfolioSummary[]> {
  // leftJoin + group, not a correlated subquery: drizzle's `sql` template
  // drops the table qualifier on a bare column ref, so
  // `WHERE ${portfolioItem.portfolioId} = ${portfolio.id}` rendered as
  // `WHERE "portfolio_id" = "id"` — both resolving to portfolio_item —
  // and itemCount was always 0.
  const rows = await db
    .select({
      id: portfolio.id,
      name: portfolio.name,
      monitored: portfolio.monitored,
      createdAt: portfolio.createdAt,
      itemCount: sql<number>`count(${portfolioItem.id})`,
    })
    .from(portfolio)
    .leftJoin(portfolioItem, eq(portfolioItem.portfolioId, portfolio.id))
    .where(eq(portfolio.userId, userId))
    .groupBy(portfolio.id)
    .orderBy(portfolio.createdAt);
  return rows.map((r) => ({ ...r, monitored: !!r.monitored, itemCount: Number(r.itemCount) }));
}

async function ownedPortfolio(userId: string, id: string) {
  const [p] = await db
    .select()
    .from(portfolio)
    .where(and(eq(portfolio.id, id), eq(portfolio.userId, userId)))
    .limit(1);
  return p ?? null;
}

export interface PortfolioItemRow {
  ein: string;
  label: string | null;
  addedAt: Date;
}
export interface PortfolioDetail {
  id: string;
  name: string;
  monitored: boolean;
  createdAt: Date;
  items: PortfolioItemRow[];
}

export async function getPortfolio(userId: string, id: string): Promise<PortfolioDetail | null> {
  const p = await ownedPortfolio(userId, id);
  if (!p) return null;
  const items = await db
    .select({ ein: portfolioItem.ein, label: portfolioItem.label, addedAt: portfolioItem.addedAt })
    .from(portfolioItem)
    .where(eq(portfolioItem.portfolioId, id))
    .orderBy(portfolioItem.addedAt);
  return { id: p.id, name: p.name, monitored: !!p.monitored, createdAt: p.createdAt, items };
}

/** Distinct EINs the user currently has across all their MONITORED portfolios. */
async function monitoredEinCount(userId: string, exceptPortfolioId?: string): Promise<number> {
  const rows = await db
    .select({ ein: portfolioItem.ein })
    .from(portfolioItem)
    .innerJoin(portfolio, eq(portfolio.id, portfolioItem.portfolioId))
    .where(and(eq(portfolio.userId, userId), eq(portfolio.monitored, true)));
  const set = new Set(rows.map((r) => r.ein));
  if (exceptPortfolioId) {
    const ex = await db
      .select({ ein: portfolioItem.ein })
      .from(portfolioItem)
      .where(eq(portfolioItem.portfolioId, exceptPortfolioId));
    for (const r of ex) set.delete(r.ein);
  }
  return set.size;
}

export async function createPortfolio(
  userId: string,
  name: string,
  eins: Array<{ ein: string; label?: string | null }> = []
): Promise<{ id: string } | { error: string }> {
  const clean = name.trim().slice(0, 80);
  if (!clean) return { error: 'name_required' };
  const id = randomUUID();
  await db.insert(portfolio).values({ id, userId, name: clean, monitored: true, createdAt: new Date() });
  if (eins.length) await addItems(userId, id, eins);
  return { id };
}

export async function renamePortfolio(userId: string, id: string, name: string): Promise<boolean> {
  if (!(await ownedPortfolio(userId, id))) return false;
  const clean = name.trim().slice(0, 80);
  if (!clean) return false;
  await db.update(portfolio).set({ name: clean }).where(eq(portfolio.id, id));
  return true;
}

export async function deletePortfolio(userId: string, id: string): Promise<boolean> {
  if (!(await ownedPortfolio(userId, id))) return false;
  await db.delete(portfolioItem).where(eq(portfolioItem.portfolioId, id));
  await db.delete(portfolio).where(eq(portfolio.id, id));
  return true;
}

export async function setMonitored(
  userId: string,
  id: string,
  on: boolean
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await ownedPortfolio(userId, id))) return { ok: false, error: 'not_found' };
  if (on) {
    const [{ n }] = await db
      .select({ n: sql<number>`count(*)` })
      .from(portfolioItem)
      .where(eq(portfolioItem.portfolioId, id));
    const other = await monitoredEinCount(userId, id);
    if (other + Number(n) > MAX_MONITORED_EINS) {
      return { ok: false, error: 'monitored_cap' };
    }
  }
  await db.update(portfolio).set({ monitored: on }).where(eq(portfolio.id, id));
  return { ok: true };
}

export async function addItems(
  userId: string,
  id: string,
  items: Array<{ ein: string; label?: string | null }>
): Promise<{ added: number; skipped: number; capped: number }> {
  const p = await ownedPortfolio(userId, id);
  if (!p) return { added: 0, skipped: 0, capped: 0 };

  const wanted = [...new Map(items.filter((i) => EIN_RE.test(i.ein)).map((i) => [i.ein, i])).values()];
  const existing = new Set(
    (
      await db
        .select({ ein: portfolioItem.ein })
        .from(portfolioItem)
        .where(eq(portfolioItem.portfolioId, id))
    ).map((r) => r.ein)
  );

  let room = MAX_ITEMS_PER_PORTFOLIO - existing.size;
  if (p.monitored) {
    room = Math.min(room, MAX_MONITORED_EINS - (await monitoredEinCount(userId, id)) - existing.size);
  }

  let added = 0;
  let skipped = 0;
  let capped = 0;
  for (const it of wanted) {
    if (existing.has(it.ein)) {
      skipped++;
      continue;
    }
    if (room <= 0) {
      capped++;
      continue;
    }
    await db
      .insert(portfolioItem)
      .values({
        id: randomUUID(),
        portfolioId: id,
        ein: it.ein,
        label: it.label || null,
        addedAt: new Date(),
      })
      .onConflictDoNothing({ target: [portfolioItem.portfolioId, portfolioItem.ein] });
    existing.add(it.ein);
    added++;
    room--;
  }
  return { added, skipped, capped };
}

export async function removeItem(userId: string, id: string, ein: string): Promise<boolean> {
  if (!(await ownedPortfolio(userId, id))) return false;
  await db
    .delete(portfolioItem)
    .where(and(eq(portfolioItem.portfolioId, id), eq(portfolioItem.ein, ein)));
  return true;
}

/* ---- the monitored view (portfolio-group sections on /portfolio) ---- */

export interface MonitoredGroup {
  id: string;
  name: string;
  monitored: boolean;
  items: Array<{ ein: string; label: string | null; checkedAt: Date | null }>;
  alerts: Array<{ ein: string; type: string; payload: Record<string, unknown>; createdAt: Date }>;
}

export async function getMonitoredView(userId: string): Promise<MonitoredGroup[]> {
  const groups = await db
    .select()
    .from(portfolio)
    .where(eq(portfolio.userId, userId))
    .orderBy(desc(portfolio.monitored), portfolio.createdAt);

  const allItems = await db
    .select({
      portfolioId: portfolioItem.portfolioId,
      ein: portfolioItem.ein,
      label: portfolioItem.label,
    })
    .from(portfolioItem)
    .innerJoin(portfolio, eq(portfolio.id, portfolioItem.portfolioId))
    .where(eq(portfolio.userId, userId));

  const eins = [...new Set(allItems.map((i) => i.ein))];
  const stateRows = eins.length
    ? await db
        .select({ ein: monitorState.ein, checkedAt: monitorState.checkedAt })
        .from(monitorState)
        .where(inArray(monitorState.ein, eins))
    : [];
  const checkedByEin = new Map(stateRows.map((s) => [s.ein, s.checkedAt]));

  const alertRows = await db
    .select({
      portfolioId: monitorAlert.portfolioId,
      ein: monitorAlert.ein,
      type: monitorAlert.type,
      payloadJson: monitorAlert.payloadJson,
      createdAt: monitorAlert.createdAt,
    })
    .from(monitorAlert)
    .where(eq(monitorAlert.userId, userId))
    .orderBy(desc(monitorAlert.createdAt))
    .limit(100);

  const itemsByPf = new Map<string, MonitoredGroup['items']>();
  for (const i of allItems) {
    if (!itemsByPf.has(i.portfolioId)) itemsByPf.set(i.portfolioId, []);
    itemsByPf.get(i.portfolioId)!.push({
      ein: i.ein,
      label: i.label,
      checkedAt: checkedByEin.get(i.ein) ?? null,
    });
  }
  const alertsByPf = new Map<string, MonitoredGroup['alerts']>();
  for (const a of alertRows) {
    const key = a.portfolioId ?? '_';
    if (!alertsByPf.has(key)) alertsByPf.set(key, []);
    alertsByPf.get(key)!.push({
      ein: a.ein,
      type: a.type,
      payload: safeParse(a.payloadJson),
      createdAt: a.createdAt,
    });
  }

  return groups.map((g) => ({
    id: g.id,
    name: g.name,
    monitored: !!g.monitored,
    items: itemsByPf.get(g.id) ?? [],
    alerts: alertsByPf.get(g.id) ?? [],
  }));
}

function safeParse(s: string): Record<string, unknown> {
  try {
    const v = JSON.parse(s);
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}
