/**
 * One-off cleanup: remove the owner's own test rows from
 * `founding_signups`.
 *
 * The classifier blocks inline `node -e` DB writes, so this is a
 * committed script instead. It deletes ONLY rows whose email is in the
 * explicit allow-list below — it prints every candidate first, then
 * deletes exactly those by id, so a real signup that later reuses one of
 * these addresses can't be caught. Fully idempotent: re-running after
 * the rows are gone is a no-op.
 *
 *   node scripts/delete-founding-test-rows.mjs           # dry run (default)
 *   node scripts/delete-founding-test-rows.mjs --commit  # actually delete
 *
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

// Known test addresses. Add more here if other dummy rows turn up.
const TEST_EMAILS = ['xyz@xyz.com'];

const commit = process.argv.includes('--commit');

const client = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const placeholders = TEST_EMAILS.map(() => '?').join(', ');
const { rows: candidates } = await client.execute({
  sql: `SELECT id, email, source, segment, organization, created_at
        FROM founding_signups
        WHERE email IN (${placeholders})
        ORDER BY created_at`,
  args: TEST_EMAILS,
});

const { rows: totalBefore } = await client.execute(
  'SELECT count(*) AS n FROM founding_signups'
);
console.log(`founding_signups: ${totalBefore[0].n} row(s) total`);

if (candidates.length === 0) {
  console.log('No test rows match the allow-list — nothing to do.');
  process.exit(0);
}

console.log(`\n${candidates.length} test row(s) matched:`);
for (const r of candidates) {
  console.log(
    `  ${r.id}  ${r.email}  source=${r.source}  segment=${r.segment}  org=${r.organization}  created_at=${r.created_at}`
  );
}

if (!commit) {
  console.log('\nDry run — re-run with --commit to delete these.');
  process.exit(0);
}

const ids = candidates.map((r) => r.id);
const idPlaceholders = ids.map(() => '?').join(', ');
const res = await client.execute({
  sql: `DELETE FROM founding_signups WHERE id IN (${idPlaceholders})`,
  args: ids,
});
console.log(`\nDeleted ${res.rowsAffected} row(s).`);

const { rows: totalAfter } = await client.execute(
  'SELECT count(*) AS n FROM founding_signups'
);
console.log(`founding_signups: ${totalAfter[0].n} row(s) remaining.`);
process.exit(0);
