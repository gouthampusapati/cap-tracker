/**
 * Migration for named monitoring portfolios (feat/portfolios) — the
 * `portfolio` / `portfolio_item` tables in lib/db/schema.ts, plus
 * `monitor_alert.portfolio_id`.
 *
 * Also moves any existing `watchlist` rows into a per-user "My watchlist"
 * portfolio (monitored=1). The `watchlist` table itself is left in place;
 * a later PR drops it.
 *
 * Idempotent / self-healing. Run before merging the PR:
 *   node scripts/create-portfolio-tables.mjs
 * Needs DATABASE_URL + TURSO_AUTH_TOKEN (or .env.local).
 */
import { createClient } from '@libsql/client';
import { randomUUID } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';

if (existsSync('.env.local')) {
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const client = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const TABLES = [
  [
    'portfolio',
    [
      ['id', 'text PRIMARY KEY NOT NULL'],
      ['user_id', 'text NOT NULL'],
      ['name', 'text NOT NULL'],
      ['monitored', 'integer NOT NULL DEFAULT 1'],
      ['created_at', 'integer NOT NULL'],
    ],
    ['CREATE INDEX IF NOT EXISTS portfolio_user_idx ON portfolio (user_id)'],
  ],
  [
    'portfolio_item',
    [
      ['id', 'text PRIMARY KEY NOT NULL'],
      ['portfolio_id', 'text NOT NULL'],
      ['ein', 'text NOT NULL'],
      ['label', 'text'],
      ['added_at', 'integer NOT NULL'],
    ],
    [
      'CREATE UNIQUE INDEX IF NOT EXISTS portfolio_item_portfolio_ein_idx ON portfolio_item (portfolio_id, ein)',
      'CREATE INDEX IF NOT EXISTS portfolio_item_ein_idx ON portfolio_item (ein)',
    ],
  ],
];

for (const [table, columns, indexes] of TABLES) {
  await client.execute(
    `CREATE TABLE IF NOT EXISTS ${table} (\n  ${columns.map(([n, t]) => `${n} ${t}`).join(',\n  ')}\n)`
  );
  const info = await client.execute(`PRAGMA table_info(${table})`);
  const have = new Set(info.rows.map((r) => r.name));
  for (const [name, type] of columns) {
    if (have.has(name)) continue;
    const addType = type.replace(/ PRIMARY KEY/i, '').replace(/ NOT NULL(?! DEFAULT)/i, '');
    await client.execute(`ALTER TABLE ${table} ADD COLUMN ${name} ${addType}`);
    console.log(`${table}: added missing column ${name}`);
  }
  for (const idx of indexes) await client.execute(idx);
  const [{ n }] = (await client.execute(`SELECT count(*) AS n FROM ${table}`)).rows;
  console.log(`${table}: ok (${n} rows)`);
}

// monitor_alert.portfolio_id
const maInfo = await client.execute('PRAGMA table_info(monitor_alert)');
if (!maInfo.rows.some((r) => r.name === 'portfolio_id')) {
  await client.execute('ALTER TABLE monitor_alert ADD COLUMN portfolio_id text');
  console.log('monitor_alert: added portfolio_id');
} else {
  console.log('monitor_alert.portfolio_id: ok');
}

// Move legacy watchlist rows -> a "My watchlist" portfolio per user.
const legacy = await client
  .execute('SELECT user_id, ein, label, created_at FROM watchlist')
  .catch(() => ({ rows: [] }));
if (legacy.rows.length > 0) {
  const byUser = new Map();
  for (const r of legacy.rows) {
    if (!byUser.has(r.user_id)) byUser.set(r.user_id, []);
    byUser.get(r.user_id).push(r);
  }
  let moved = 0;
  for (const [userId, rows] of byUser) {
    // reuse an existing "My watchlist" portfolio if the migration ran before
    const existing = await client.execute({
      sql: "SELECT id FROM portfolio WHERE user_id = ? AND name = 'My watchlist' LIMIT 1",
      args: [userId],
    });
    const pid = existing.rows[0]?.id ?? randomUUID();
    if (!existing.rows[0]) {
      await client.execute({
        sql: 'INSERT INTO portfolio (id, user_id, name, monitored, created_at) VALUES (?, ?, ?, 1, ?)',
        args: [pid, userId, 'My watchlist', Math.min(...rows.map((r) => Number(r.created_at)))],
      });
    }
    for (const r of rows) {
      await client.execute({
        sql: `INSERT INTO portfolio_item (id, portfolio_id, ein, label, added_at)
              VALUES (?, ?, ?, ?, ?) ON CONFLICT(portfolio_id, ein) DO NOTHING`,
        args: [randomUUID(), pid, r.ein, r.label ?? null, r.created_at],
      });
      moved++;
    }
  }
  console.log(`moved ${moved} watchlist row(s) into ${byUser.size} "My watchlist" portfolio(s)`);
} else {
  console.log('no legacy watchlist rows to migrate');
}

process.exit(0);
