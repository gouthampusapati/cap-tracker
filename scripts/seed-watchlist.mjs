/**
 * Add / remove watchlist rows for a user — the manual path until PR 2
 * ships the /watchlist UI. Also how you'd bootstrap the first founding
 * pilot's watchlist.
 *
 *   node scripts/seed-watchlist.mjs --user a@b.com --list
 *   node scripts/seed-watchlist.mjs --user a@b.com --add 916001236 742089103 --commit
 *   node scripts/seed-watchlist.mjs --user a@b.com --remove 742089103 --commit
 *
 * Dry-run by default (--commit to write). The user must already have a
 * `users` row (i.e. have signed in at least once). Grant monitoring
 * access separately with scripts/grant-monitor-access.mjs.
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

const argv = process.argv.slice(2);
const val = (name) => {
  const i = argv.indexOf(name);
  return i === -1 ? undefined : argv[i + 1];
};
const listAfter = (name) => {
  const i = argv.indexOf(name);
  if (i === -1) return [];
  const out = [];
  for (let j = i + 1; j < argv.length && !argv[j].startsWith('--'); j++) out.push(argv[j]);
  return out;
};
const has = (name) => argv.includes(name);

const email = String(val('--user') ?? '').trim().toLowerCase();
if (!email) {
  console.error('--user <email> is required');
  process.exit(1);
}

const client = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});
const nowSec = Math.floor(Date.now() / 1000);

const { rows: userRows } = await client.execute({
  sql: 'SELECT id, email FROM users WHERE lower(email) = ?',
  args: [email],
});
if (userRows.length === 0) {
  console.error(`No users row for ${email} — they need to sign in to the site once first.`);
  process.exit(1);
}
const userId = userRows[0].id;

const { rows: access } = await client.execute({
  sql: 'SELECT expires_at FROM monitor_access WHERE lower(email) = ?',
  args: [email],
});
const accessLabel =
  access.length === 0
    ? 'NONE — run grant-monitor-access.mjs'
    : access[0].expires_at > nowSec
      ? `active until ${new Date(access[0].expires_at * 1000).toISOString().slice(0, 10)}`
      : 'EXPIRED';

async function list() {
  const { rows } = await client.execute({
    sql: 'SELECT ein, label, created_at FROM watchlist WHERE user_id = ? ORDER BY created_at',
    args: [userId],
  });
  console.log(`\n${email}  (user ${userId})`);
  console.log(`monitoring access: ${accessLabel}`);
  console.log(`\nwatchlist (${rows.length}):`);
  for (const r of rows) console.log(`  ${r.ein}  ${r.label ?? '(name pending first monitor run)'}`);
  console.log();
}

const adds = listAfter('--add').filter(Boolean);
const removes = listAfter('--remove').filter(Boolean);
const bad = [...adds, ...removes].filter((e) => !/^\d{9}$/.test(e));
if (bad.length) {
  console.error(`Not 9-digit EINs: ${bad.join(', ')}`);
  process.exit(1);
}

if (adds.length === 0 && removes.length === 0) {
  await list();
  process.exit(0);
}

console.log(`user ${email} (${accessLabel})`);
if (adds.length) console.log(`  + add:    ${adds.join(', ')}`);
if (removes.length) console.log(`  - remove: ${removes.join(', ')}`);

if (!has('--commit')) {
  console.log('\nDry run — add --commit to apply.');
  process.exit(0);
}

for (const ein of adds) {
  await client.execute({
    sql: `INSERT INTO watchlist (id, user_id, ein, created_at) VALUES (?, ?, ?, ?)
          ON CONFLICT(user_id, ein) DO NOTHING`,
    args: [randomUUID(), userId, ein, nowSec],
  });
}
for (const ein of removes) {
  await client.execute({
    sql: 'DELETE FROM watchlist WHERE user_id = ? AND ein = ?',
    args: [userId, ein],
  });
}
console.log('done.');
await list();
process.exit(0);
