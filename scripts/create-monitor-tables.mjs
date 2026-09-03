/**
 * Migration for the continuous-monitoring backend (Founding Customer
 * Validation Plan) — the `watchlist`, `monitor_state`, `monitor_alert`
 * and `monitor_prefs` tables in lib/db/schema.ts.
 *
 * Idempotent and self-healing: CREATE IF NOT EXISTS + ALTER in any
 * column missing from an earlier partial run. App-owned tables, plain
 * additive DDL (NOT the fac_mirror_* blue-green path). The classifier
 * blocks inline `node -e` DB writes, so this is a committed script.
 *
 * Run before merging the PR (and again if the schema below changes):
 *   node scripts/create-monitor-tables.mjs
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

// [tableName, [ [col, type], ... ], [ createIndexSql, ... ] ]
// Keep in lockstep with lib/db/schema.ts.
const TABLES = [
  [
    'monitor_access',
    [
      ['email', 'text PRIMARY KEY NOT NULL'],
      ['expires_at', 'integer NOT NULL'],
      ['granted_at', 'integer NOT NULL'],
      ['note', 'text'],
    ],
    [],
  ],
  [
    'watchlist',
    [
      ['id', 'text PRIMARY KEY NOT NULL'],
      ['user_id', 'text NOT NULL'],
      ['ein', 'text NOT NULL'],
      ['label', 'text'],
      ['created_at', 'integer NOT NULL'],
    ],
    [
      'CREATE UNIQUE INDEX IF NOT EXISTS watchlist_user_ein_idx ON watchlist (user_id, ein)',
      'CREATE INDEX IF NOT EXISTS watchlist_ein_idx ON watchlist (ein)',
    ],
  ],
  [
    'monitor_state',
    [
      ['ein', 'text PRIMARY KEY NOT NULL'],
      ['org_name', 'text'],
      ['latest_report_id', 'text'],
      ['latest_audit_year', 'text'],
      ['latest_fac_accepted_date', 'text'],
      ['finding_refs', 'text'],
      ['repeat_finding_refs', 'text'],
      ['soonest_md_deadline', 'text'],
      ['md_deadline_alerted', 'text'],
      ['checked_at', 'integer NOT NULL'],
    ],
    [],
  ],
  [
    'monitor_alert',
    [
      ['id', 'text PRIMARY KEY NOT NULL'],
      ['user_id', 'text NOT NULL'],
      ['ein', 'text NOT NULL'],
      ['type', 'text NOT NULL'],
      ['payload_json', 'text NOT NULL'],
      ['created_at', 'integer NOT NULL'],
      ['digest_sent_at', 'integer'],
    ],
    ['CREATE INDEX IF NOT EXISTS monitor_alert_user_unsent_idx ON monitor_alert (user_id, digest_sent_at)'],
  ],
  [
    'monitor_prefs',
    [
      ['user_id', 'text PRIMARY KEY NOT NULL'],
      ['digest_opt_out', 'integer NOT NULL DEFAULT 0'],
      ['updated_at', 'integer NOT NULL'],
    ],
    [],
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
    // SQLite ADD COLUMN can't be PRIMARY KEY / NOT NULL-without-default;
    // strip those qualifiers for the backfill.
    const addType = type.replace(/ PRIMARY KEY/i, '').replace(/ NOT NULL(?! DEFAULT)/i, '');
    await client.execute(`ALTER TABLE ${table} ADD COLUMN ${name} ${addType}`);
    console.log(`${table}: added missing column ${name}`);
  }

  for (const idx of indexes) await client.execute(idx);

  const [{ n }] = (await client.execute(`SELECT count(*) AS n FROM ${table}`)).rows;
  console.log(`${table}: ok (${n} rows)`);
}

process.exit(0);
