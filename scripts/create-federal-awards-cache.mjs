/**
 * Migration: `federal_awards_cache` — per-EIN cache of the SEFA award
 * detail behind /single-audit/[ein]/risk-assessment (see
 * lib/db/schema.ts + lib/federal-awards.ts). Stops every uncached
 * risk-assessment render from costing 2 live FAC calls.
 *
 * Idempotent. Run before merging:
 *   node scripts/create-federal-awards-cache.mjs
 * Needs DATABASE_URL + TURSO_AUTH_TOKEN (or .env.local).
 */
import { createClient } from '@libsql/client';
import { readFileSync, existsSync } from 'node:fs';

if (existsSync('.env.local')) {
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const db = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

await db.execute(`
  CREATE TABLE IF NOT EXISTS federal_awards_cache (
    ein        text PRIMARY KEY,
    found      integer NOT NULL,
    snapshot   text,
    synced_at  integer NOT NULL
  )
`);

const { rows } = await db.execute(`SELECT count(*) AS n FROM federal_awards_cache`);
console.log(`federal_awards_cache ready (${rows[0].n} row(s))`);
