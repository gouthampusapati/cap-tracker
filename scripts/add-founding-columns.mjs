/**
 * One-off migration for the Founding Customer Program reframe (Sprint 1).
 *
 * Adds three nullable columns to `waitlist_signups`:
 *   - interest_level   (pay-now | after-demo | test-first | free-only)
 *   - org_count        (1-5 | 6-25 | 26-100 | 101-500 | 500+)
 *   - current_method   (spreadsheet | manual-fac | ... | other)
 *
 * `waitlist_signups` is an app-owned table (NOT a fac_mirror_* table),
 * so a plain additive ALTER is the right tool — same pattern the
 * `segment` column was added with. Nullable + additive = safe to run
 * against prod before the code that writes these columns is merged.
 *
 * Idempotent: skips any column that already exists. Run once:
 *   node scripts/add-founding-columns.mjs
 * Needs DATABASE_URL + TURSO_AUTH_TOKEN in the environment (or .env.local).
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

const COLUMNS = ['interest_level', 'org_count', 'current_method'];

const { rows } = await client.execute("SELECT sql FROM sqlite_master WHERE name = 'waitlist_signups'");
const existingDdl = rows[0]?.sql ?? '';

for (const col of COLUMNS) {
  if (existingDdl.includes(`\`${col}\``) || existingDdl.includes(` ${col} `)) {
    console.log(`skip  ${col} — already present`);
    continue;
  }
  await client.execute(`ALTER TABLE waitlist_signups ADD COLUMN ${col} text`);
  console.log(`added ${col}`);
}

const after = await client.execute("SELECT sql FROM sqlite_master WHERE name = 'waitlist_signups'");
console.log('\nwaitlist_signups is now:\n' + after.rows[0].sql);
process.exit(0);
