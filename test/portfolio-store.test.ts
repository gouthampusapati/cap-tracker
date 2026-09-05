import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// requirePortfolioUser (not under test here) is the only thing pulling
// the NextAuth chain + the monitor-access DB helper — stub both so this
// file exercises just the cap/ownership logic.
vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/monitor-access', () => ({ hasActiveMonitorAccess: vi.fn() }));

/**
 * Direct tests for lib/portfolio-store.ts — the cap math (per-portfolio
 * and cross-portfolio monitored-EIN limits) and per-user ownership
 * isolation that guard every mutation. api-portfolio.test.ts mocks this
 * whole module, so without this file none of that logic is exercised.
 *
 * Runs the real migration scripts against a temp libSQL file, then calls
 * the store in-process (same pattern as monitor-job.test.ts, minus the
 * subprocess).
 */

const ROOT = join(__dirname, '..');
const DB_PATH = join(mkdtempSync(join(tmpdir(), 'pstore-')), 'p.db');
process.env.DATABASE_URL = `file:${DB_PATH}`;
process.env.TURSO_AUTH_TOKEN = '';

function runScript(script: string) {
  execFileSync('node', [join(ROOT, 'scripts', script)], {
    cwd: ROOT,
    env: { ...process.env, DATABASE_URL: `file:${DB_PATH}`, TURSO_AUTH_TOKEN: '' },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
}

// Imported after DATABASE_URL is set so lib/db binds to the temp file.
const { db } = await import('@/lib/db');
const { sql } = await import('drizzle-orm');
const store = await import('@/lib/portfolio-store');
const { MAX_ITEMS_PER_PORTFOLIO, MAX_MONITORED_EINS, MAX_PORTFOLIOS_PER_USER } = store;

const ein = (n: number) => String(100_000_000 + n).padStart(9, '0');
const einRange = (start: number, count: number) =>
  Array.from({ length: count }, (_, i) => ({ ein: ein(start + i) }));

beforeAll(async () => {
  runScript('create-monitor-tables.mjs');
  runScript('create-portfolio-tables.mjs');
  await db.run(
    sql`CREATE TABLE IF NOT EXISTS users (id text PRIMARY KEY, email text, created_at integer)`
  );
  await db.run(sql`INSERT INTO users (id, email, created_at) VALUES ('u1', 'a@x.com', 0)`);
  await db.run(sql`INSERT INTO users (id, email, created_at) VALUES ('u2', 'b@x.com', 0)`);
});

beforeEach(async () => {
  await db.run(sql`DELETE FROM portfolio_item`);
  await db.run(sql`DELETE FROM portfolio`);
  await db.run(sql`DELETE FROM monitor_alert`);
  await db.run(sql`DELETE FROM monitor_state`);
});

describe('createPortfolio', () => {
  it('trims and length-caps the name; rejects an empty one', async () => {
    const ok = await store.createPortfolio('u1', '  Subrecipients  ');
    expect('id' in ok).toBe(true);

    const long = await store.createPortfolio('u1', 'x'.repeat(200));
    expect('id' in long).toBe(true);
    const [detail] = await store.listPortfolios('u1').then((l) => l.filter((p) => p.name.length === 80));
    expect(detail.name).toHaveLength(80);

    const bad = await store.createPortfolio('u1', '   ');
    expect(bad).toEqual({ error: 'name_required' });
  });

  it('caps how many groups one user can create', async () => {
    for (let i = 0; i < MAX_PORTFOLIOS_PER_USER; i++) {
      const r = await store.createPortfolio('u1', `g${i}`);
      expect('id' in r).toBe(true);
    }
    const over = await store.createPortfolio('u1', 'one too many');
    expect(over).toEqual({ error: 'portfolio_limit' });
    expect(await store.listPortfolios('u1')).toHaveLength(MAX_PORTFOLIOS_PER_USER);

    // the limit is per-user, not global
    const other = await store.createPortfolio('u2', 'still fine');
    expect('id' in other).toBe(true);
  });

  it('seeds initial EINs, ignoring non-9-digit junk', async () => {
    const res = await store.createPortfolio('u1', 'g', [
      { ein: '123456789' },
      { ein: 'not-an-ein' },
      { ein: '12345' },
    ]);
    if (!('id' in res)) throw new Error('expected id');
    const d = await store.getPortfolio('u1', res.id);
    expect(d?.items.map((i) => i.ein)).toEqual(['123456789']);
  });
});

describe('addItems', () => {
  it('dedupes against existing rows and within the input', async () => {
    const { id } = (await store.createPortfolio('u1', 'g', [{ ein: ein(1) }])) as { id: string };
    const r = await store.addItems('u1', id, [
      { ein: ein(1) }, // already there
      { ein: ein(2) },
      { ein: ein(2) }, // dup in input
      { ein: ein(3) },
    ]);
    expect(r).toEqual({ added: 2, skipped: 1, capped: 0 });
    const d = await store.getPortfolio('u1', id);
    expect(d?.items).toHaveLength(3);
  });

  it('enforces the per-portfolio cap and reports what was capped', async () => {
    const { id } = (await store.createPortfolio('u1', 'g')) as { id: string };
    await store.setMonitored('u1', id, false); // take the monitored cap out of it
    const r = await store.addItems('u1', id, einRange(1, MAX_ITEMS_PER_PORTFOLIO + 5));
    expect(r.added).toBe(MAX_ITEMS_PER_PORTFOLIO);
    expect(r.capped).toBe(5);
  });

  it('enforces the cross-portfolio monitored-EIN cap', async () => {
    // Per-portfolio cap is MAX_ITEMS_PER_PORTFOLIO, so the monitored cap
    // (MAX_MONITORED_EINS) only bites across several monitored groups.
    const a = (await store.createPortfolio('u1', 'a')) as { id: string };
    const b = (await store.createPortfolio('u1', 'b')) as { id: string };
    await store.addItems('u1', a.id, einRange(1, MAX_ITEMS_PER_PORTFOLIO)); // 50 monitored
    await store.addItems('u1', b.id, einRange(200, MAX_MONITORED_EINS - MAX_ITEMS_PER_PORTFOLIO - 10)); // 40 monitored → 90 total
    const r = await store.addItems('u1', b.id, einRange(500, 25));
    expect(r.added).toBe(10); // only 10 of the monitored budget left
    expect(r.capped).toBe(15);
  });

  it('a non-monitored portfolio is not limited by the monitored cap', async () => {
    const a = (await store.createPortfolio('u1', 'a')) as { id: string };
    const a2 = (await store.createPortfolio('u1', 'a2')) as { id: string };
    await store.addItems('u1', a.id, einRange(1, MAX_ITEMS_PER_PORTFOLIO));
    await store.addItems('u1', a2.id, einRange(200, MAX_ITEMS_PER_PORTFOLIO)); // 100 monitored, at cap
    const b = (await store.createPortfolio('u1', 'b')) as { id: string };
    await store.setMonitored('u1', b.id, false);
    const r = await store.addItems('u1', b.id, einRange(900, MAX_ITEMS_PER_PORTFOLIO));
    expect(r.added).toBe(MAX_ITEMS_PER_PORTFOLIO);
  });

  it('does nothing for a portfolio the user does not own', async () => {
    const { id } = (await store.createPortfolio('u1', 'g')) as { id: string };
    const r = await store.addItems('u2', id, [{ ein: ein(1) }]);
    expect(r).toEqual({ added: 0, skipped: 0, capped: 0 });
    expect((await store.getPortfolio('u1', id))?.items).toHaveLength(0);
  });
});

describe('setMonitored', () => {
  it('toggles and blocks turning on when it would breach the monitored cap', async () => {
    const a = (await store.createPortfolio('u1', 'a')) as { id: string };
    const a2 = (await store.createPortfolio('u1', 'a2')) as { id: string };
    await store.addItems('u1', a.id, einRange(1, MAX_ITEMS_PER_PORTFOLIO));
    await store.addItems('u1', a2.id, einRange(200, MAX_ITEMS_PER_PORTFOLIO)); // 100 monitored, at cap

    const b = (await store.createPortfolio('u1', 'b')) as { id: string };
    await store.setMonitored('u1', b.id, false);
    await store.addItems('u1', b.id, einRange(500, 20)); // unmonitored, so allowed

    const blocked = await store.setMonitored('u1', b.id, true);
    expect(blocked).toEqual({ ok: false, error: 'monitored_cap' });

    // free up room on a2, then b fits
    for (const e of einRange(200, 20)) await store.removeItem('u1', a2.id, e.ein);
    const okNow = await store.setMonitored('u1', b.id, true);
    expect(okNow).toEqual({ ok: true });
  });

  it('reports not_found for another user’s portfolio', async () => {
    const { id } = (await store.createPortfolio('u1', 'g')) as { id: string };
    expect(await store.setMonitored('u2', id, false)).toEqual({ ok: false, error: 'not_found' });
  });
});

describe('rename / delete / ownership', () => {
  it('renamePortfolio: owner only, non-empty', async () => {
    const { id } = (await store.createPortfolio('u1', 'g')) as { id: string };
    expect(await store.renamePortfolio('u2', id, 'hijack')).toBe(false);
    expect(await store.renamePortfolio('u1', id, '   ')).toBe(false);
    expect(await store.renamePortfolio('u1', id, 'Renamed')).toBe(true);
    expect((await store.getPortfolio('u1', id))?.name).toBe('Renamed');
  });

  it('deletePortfolio cascades items and is owner-gated', async () => {
    const { id } = (await store.createPortfolio('u1', 'g', einRange(1, 3))) as { id: string };
    expect(await store.deletePortfolio('u2', id)).toBe(false);
    expect(await store.deletePortfolio('u1', id)).toBe(true);
    expect(await store.getPortfolio('u1', id)).toBeNull();
    const [{ n }] = await db.all<{ n: number }>(sql`SELECT count(*) AS n FROM portfolio_item`);
    expect(Number(n)).toBe(0);
  });

  it('listPortfolios is per-user and carries itemCount', async () => {
    const { id } = (await store.createPortfolio('u1', 'mine')) as { id: string };
    await store.addItems('u1', id, einRange(1, 2));
    await store.createPortfolio('u2', 'theirs');

    expect((await store.getPortfolio('u1', id))?.items).toHaveLength(2); // seeding sanity

    const mine = await store.listPortfolios('u1');
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ id, name: 'mine', monitored: true, itemCount: 2 });
  });
});

describe('getMonitoredView', () => {
  it('orders monitored groups first, joins checkedAt, groups alerts by portfolio', async () => {
    const on = (await store.createPortfolio('u1', 'Monitored', [{ ein: ein(1) }])) as { id: string };
    const off = (await store.createPortfolio('u1', 'Paused', [{ ein: ein(2) }])) as { id: string };
    await store.setMonitored('u1', off.id, false);

    await db.run(
      sql`INSERT INTO monitor_state (ein, org_name, finding_refs, repeat_finding_refs, checked_at)
          VALUES (${ein(1)}, 'Org One', '[]', '[]', 1700000000)`
    );
    await db.run(
      sql`INSERT INTO monitor_alert (id, user_id, ein, type, payload_json, created_at, portfolio_id)
          VALUES ('al1', 'u1', ${ein(1)}, 'new_finding', '{"referenceNumber":"2024-001"}', 1700000100, ${on.id})`
    );

    const view = await store.getMonitoredView('u1');
    expect(view.map((g) => g.name)).toEqual(['Monitored', 'Paused']); // monitored first
    expect(view[0].items[0].checkedAt).toBeInstanceOf(Date);
    expect(view[0].alerts).toHaveLength(1);
    expect(view[0].alerts[0].payload).toMatchObject({ referenceNumber: '2024-001' });
    expect(view[1].alerts).toHaveLength(0);
  });
});
