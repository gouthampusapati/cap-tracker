/**
 * One-off migration for the Founding Customer Program reframe (Sprint 1).
 *
 * Creates `founding_signups` and DROPS the old `waitlist_signups` table.
 * The old table only ever held the owner's own dummy test rows, so
 * there is nothing to migrate — confirmed before writing this.
 *
 * `founding_signups` is an app-owned table (NOT a fac_mirror_* table),
 * so raw DDL here is fine. Keep the CREATE in sync with the
 * `foundingSignups` definition in lib/db/schema.ts.
 *
 * Idempotent. Run once, before merging the PR:
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

await client.execute(`
  CREATE TABLE IF NOT EXISTS founding_signups (
    id text PRIMARY KEY NOT NULL,
    email text NOT NULL,
    source text NOT NULL,
    ein text,
    segment text,
    interest_level text,
    org_count text,
    current_method text,
    created_at integer NOT NULL
  )
`);
console.log('created founding_signups (or it already existed)');

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
