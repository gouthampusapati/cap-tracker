/**
 * Manage the monitoring access allowlist (monitor_access) during
 * founding-customer validation. The classifier blocks inline `node -e`
 * DB writes, so grants/revokes go through this committed script.
 *
 *   node scripts/grant-monitor-access.mjs --list
 *   node scripts/grant-monitor-access.mjs --grant a@b.com --days 30 --note "pilot: Acme" --commit
 *   node scripts/grant-monitor-access.mjs --revoke a@b.com --commit
 *
 * Dry-run by default; add --commit to actually write. Email is stored
 * lowercased. Re-granting an existing email replaces its expiry.
 * Needs DATABASE_URL + TURSO_AUTH_TOKEN (or .env.local).
 */
import { createClient } from '@libsql/client';
import { readFileSync, existsSync } from 'node:fs';

if (existsSync('.env.local')) {
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(name);
  return i === -1 ? undefined : argv[i + 1] ?? true;
};
const has = (name) => argv.includes(name);

const client = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});
const nowSec = Math.floor(Date.now() / 1000);
const fmt = (s) => (s ? new Date(s * 1000).toISOString().slice(0, 10) : '—');

async function list() {
  const { rows } = await client.execute('SELECT * FROM monitor_access ORDER BY expires_at DESC');
  if (rows.length === 0) {
    console.log('monitor_access is empty.');
    return;
  }
  console.log(`\n${rows.length} grant(s):\n`);
  for (const r of rows) {
    const active = r.expires_at > nowSec;
    console.log(
      `  ${active ? 'ACTIVE ' : 'expired'}  ${String(r.email).padEnd(32)}  expires ${fmt(r.expires_at)}  granted ${fmt(r.granted_at)}${r.note ? `  — ${r.note}` : ''}`
    );
  }
  console.log();
}

async function grant() {
  const email = String(flag('--grant')).trim().toLowerCase();
  const days = Number(flag('--days'));
  const note = flag('--note') && flag('--note') !== true ? String(flag('--note')) : null;
  if (!email || !email.includes('@') || !Number.isFinite(days) || days <= 0) {
    console.error('Usage: --grant <email> --days <N> [--note "..."] [--commit]');
    process.exit(1);
  }
  const expiresAt = nowSec + Math.round(days * 86400);
  console.log(`grant ${email} — active until ${fmt(expiresAt)} (${days} days)${note ? ` — ${note}` : ''}`);
  if (!has('--commit')) {
    console.log('\nDry run — add --commit to apply.');
    return;
  }
  await client.execute({
    sql: `INSERT INTO monitor_access (email, expires_at, granted_at, note)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(email) DO UPDATE SET expires_at = excluded.expires_at, note = excluded.note`,
    args: [email, expiresAt, nowSec, note],
  });
  console.log('granted.');
}

async function revoke() {
  const email = String(flag('--revoke')).trim().toLowerCase();
  if (!email) {
    console.error('Usage: --revoke <email> [--commit]');
    process.exit(1);
  }
  const { rows } = await client.execute({
    sql: 'SELECT email, expires_at FROM monitor_access WHERE email = ?',
    args: [email],
  });
  if (rows.length === 0) {
    console.log(`${email}: no grant on file — nothing to revoke.`);
    return;
  }
  console.log(`revoke ${email} (was active until ${fmt(rows[0].expires_at)})`);
  if (!has('--commit')) {
    console.log('\nDry run — add --commit to apply.');
    return;
  }
  await client.execute({ sql: 'DELETE FROM monitor_access WHERE email = ?', args: [email] });
  console.log('revoked.');
}

if (has('--list')) await list();
else if (flag('--grant')) await grant();
else if (flag('--revoke')) await revoke();
else {
  console.error('One of --list | --grant <email> --days N | --revoke <email> is required.');
  process.exit(1);
}
process.exit(0);
