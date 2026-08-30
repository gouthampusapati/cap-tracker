/**
 * Migration for the Founding Customer Program (Sprint 1).
 *
 * Brings `founding_signups` to the shape in lib/db/schema.ts and drops
 * the old `waitlist_signups` table (it only ever held the owner's own
 * dummy test rows — nothing to migrate).
 *
 * Fully idempotent and self-healing: creates the table if missing, and
 * ALTERs in any column that's missing from an earlier partial run. Safe
 * to run repeatedly. `founding_signups` is app-owned (NOT a
 * fac_mirror_* table) so plain additive DDL is the right tool.
 *
 * Run before merging the PR (and again if the schema below changes):
 *   node scripts/create-founding-table.mjs
 * Needs DATABASE_URL + TURSO_AUTH_TOKEN in the env (or .env.local).
 */
import { createClient } from '@libsql/client';
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

// Keep in sync with `foundingSignups` in lib/db/schema.ts.
const COLUMNS = [
  ['id', 'text PRIMARY KEY NOT NULL'],
  ['email', 'text NOT NULL'],
  ['source', 'text NOT NULL'],
  ['ein', 'text'],
  ['segment', 'text'],
  ['organization', 'text'],
  ['interest_level', 'text'],
  ['org_count', 'text'],
  ['current_method', 'text'],
  ['created_at', 'integer NOT NULL'],
];

await client.execute(
  `CREATE TABLE IF NOT EXISTS founding_signups (\n  ${COLUMNS.map(([n, t]) => `${n} ${t}`).join(',\n  ')}\n)`
);
console.log('founding_signups exists');

// Add any columns missing from an earlier partial run. SQLite can only
// ADD a nullable / non-PK / non-NOT NULL column, which is exactly what
// every backfillable column here is.
const info = await client.execute('PRAGMA table_info(founding_signups)');
const have = new Set(info.rows.map((r) => r.name));
for (const [name, type] of COLUMNS) {
  if (have.has(name)) continue;
  await client.execute(`ALTER TABLE founding_signups ADD COLUMN ${name} ${type.replace(/ (PRIMARY KEY )?NOT NULL/, '')}`);
  console.log(`added missing column: ${name}`);
}

const old = await client.execute(
  "SELECT count(*) AS n FROM sqlite_master WHERE type = 'table' AND name = 'waitlist_signups'"
);
if (old.rows[0].n > 0) {
  const { rows } = await client.execute('SELECT count(*) AS n FROM waitlist_signups');
  await client.execute('DROP TABLE waitlist_signups');
  console.log(`dropped waitlist_signups (${rows[0].n} dummy row(s) discarded)`);
} else {
  console.log('waitlist_signups already gone — nothing to drop');
}

const ddl = await client.execute("SELECT sql FROM sqlite_master WHERE name = 'founding_signups'");
console.log('\n' + ddl.rows[0].sql);
process.exit(0);
