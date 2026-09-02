#!/usr/bin/env node
/**
 * Builds fac_mirror_passthrough_summary — one row per pass-through
 * ENTITY (identified by its normalized name), carrying how many audited
 * subrecipients name it as their pass-through. This is "signal 2" of the
 * cold-outreach pass-through targeting (see scripts/export-outreach-list.mjs):
 * a floor on each pass-through's subrecipient portfolio size.
 *
 * WHY A SEPARATE SCRIPT (not part of sync-fac-mirror.mjs):
 *   - The source, FAC's passthrough.csv, is ~530MB / ~4.9M rows. Mirroring
 *     it raw would blow Turso's free-tier 10M-writes/month cap on its own
 *     (see memory turso-plan). So it is NEVER stored row-for-row — it is
 *     streamed once, aggregated in memory, and only the ~110K-row summary
 *     is written (subaward_rows >= 2; the long tail of one-off / typo'd
 *     funder names is dropped).
 *   - The main sync is already long and has hit mid-stream download drops
 *     on FAC's CDN. Isolating this keeps a passthrough-summary failure
 *     from rolling back the whole mirror, and vice versa.
 *
 * Blue-green swap, same as the main sync: build _new, then atomic RENAME.
 * A 0-row result refuses to swap. Reads fac_mirror_general (live) for the
 * subrecipient report_id -> auditee_ein map, so run it AFTER the weekly
 * sync-fac-mirror run (the workflow schedule already offsets it).
 *
 * Standalone Node — NOT drizzle-kit. Needs DATABASE_URL + TURSO_AUTH_TOKEN.
 */

import { createClient } from '@libsql/client';
import { parse } from 'csv-parse';
import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { access, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { normPassthroughName } from './lib/passthrough-name.mjs';

const DATABASE_URL = process.env.DATABASE_URL;
const TURSO_AUTH_TOKEN = process.env.TURSO_AUTH_TOKEN;
if (!DATABASE_URL) {
  console.error('DATABASE_URL is not set — refusing to run.');
  process.exit(1);
}
const client = createClient(
  TURSO_AUTH_TOKEN ? { url: DATABASE_URL, authToken: TURSO_AUTH_TOKEN } : { url: DATABASE_URL }
);

const CSV_URL = 'https://app.fac.gov/dissemination/public-data/gsa/full/passthrough.csv';
const BATCH_SIZE = 500;
// Keep only pass-through names seen on >= this many subaward rows. Drops
// the ~110K-row long tail of one-offs and misspellings; keeps ~110K rows.
const MIN_SUBAWARD_ROWS = 2;
// "recent" = this many most-recent audit years (rolling).
const RECENT_YEARS = 3;
const TEST_MAX_ROWS = process.env.SYNC_TEST_MAX_ROWS_PER_TABLE
  ? Number(process.env.SYNC_TEST_MAX_ROWS_PER_TABLE)
  : null;

const log = (m) => console.log(`[build-passthrough-summary] ${new Date().toISOString()} ${m}`);

const DDL = (name) => `CREATE TABLE ${name} (
  norm_name TEXT PRIMARY KEY,
  sample_name TEXT,
  subrecipient_count_recent INTEGER NOT NULL DEFAULT 0,
  subrecipient_count_all INTEGER NOT NULL DEFAULT 0,
  subaward_rows INTEGER NOT NULL DEFAULT 0
)`;

/** curl to a temp file with resume + retry — FAC's CDN drops long
 * streamed downloads over some connections, and `curl -C -` resumes
 * instead of restarting the ~530MB from zero. */
async function downloadWithRetry(url, dest, attempts = 5) {
  for (let i = 1; i <= attempts; i++) {
    const code = await new Promise((resolve) => {
      const p = spawn(
        'curl',
        ['-sSL', '--fail', '--retry', '5', '--retry-all-errors', '--retry-delay', '5', '-C', '-', '-o', dest, url],
        { stdio: ['ignore', 'ignore', 'inherit'] }
      );
      p.on('close', resolve);
      p.on('error', () => resolve(-1));
    });
    if (code === 0) return;
    log(`download attempt ${i}/${attempts} exited ${code} — retrying in 10s`);
    await new Promise((r) => setTimeout(r, 10_000));
  }
  throw new Error(`could not download ${url} after ${attempts} attempts`);
}

async function main() {
  const startedAt = Date.now();

  // 1. subrecipient report_id -> auditee_ein, from the live mirror.
  log('loading report_id -> auditee_ein from fac_mirror_general …');
  const reportEin = new Map();
  {
    let after = '';
    for (;;) {
      const res = await client.execute({
        sql: `SELECT report_id, auditee_ein FROM fac_mirror_general
              WHERE report_id > ? ORDER BY report_id LIMIT 20000`,
        args: [after],
      });
      for (const r of res.rows) reportEin.set(r.report_id, r.auditee_ein);
      if (res.rows.length < 20000) break;
      after = res.rows[res.rows.length - 1].report_id;
    }
  }
  if (reportEin.size === 0) {
    throw new Error('fac_mirror_general is empty — run the main sync first');
  }
  log(`${reportEin.size} reports mapped`);

  // 2. stream passthrough.csv, aggregate by normalized pass-through name.
  //    PASSTHROUGH_CSV=/path/to/passthrough.csv reuses a local copy
  //    (skips the ~530MB download) — for local re-runs.
  const local = process.env.PASSTHROUGH_CSV;
  let tmp;
  let usingLocal = false;
  if (local && (await access(local).then(() => true).catch(() => false))) {
    tmp = local;
    usingLocal = true;
    log(`using local passthrough.csv: ${tmp}`);
  } else {
    tmp = join(tmpdir(), `fac-passthrough-${process.pid}.csv`);
    log(`downloading passthrough.csv -> ${tmp}`);
    await downloadWithRetry(CSV_URL, tmp);
  }

  const recentCutoff = String(new Date().getUTCFullYear() - RECENT_YEARS);
  const agg = new Map(); // norm -> { sample, all:Set, recent:Set, rows }
  let rowCount = 0;
  let headerChecked = false;
  const parser = createReadStream(tmp).pipe(parse({ columns: true }));
  for await (const rec of parser) {
    if (!headerChecked) {
      for (const c of ['report_id', 'auditee_uei', 'audit_year', 'passthrough_name']) {
        if (!(c in rec)) throw new Error(`passthrough.csv missing column: ${c}`);
      }
      headerChecked = true;
    }
    rowCount++;
    const key = normPassthroughName(rec.passthrough_name);
    if (!key) continue;

    const downstream =
      reportEin.get(rec.report_id) ||
      (rec.auditee_uei && rec.auditee_uei !== 'GSA_MIGRATION' ? `uei:${rec.auditee_uei}` : null) ||
      `rpt:${rec.report_id}`;

    let e = agg.get(key);
    if (!e) agg.set(key, (e = { sample: rec.passthrough_name.trim(), all: new Set(), recent: new Set(), rows: 0 }));
    e.rows++;
    e.all.add(downstream);
    if ((rec.audit_year ?? '') >= recentCutoff) e.recent.add(downstream);

    if (TEST_MAX_ROWS !== null && rowCount >= TEST_MAX_ROWS) {
      log(`TEST MODE — stopping at ${rowCount} rows`);
      parser.destroy();
      break;
    }
    if (rowCount % 500_000 === 0) log(`  ${rowCount} rows … (${agg.size} names)`);
  }
  if (!usingLocal) await unlink(tmp).catch(() => {});
  log(`${rowCount} subaward rows -> ${agg.size} distinct pass-through names`);

  const rows = [...agg.entries()]
    .filter(([, e]) => e.rows >= MIN_SUBAWARD_ROWS)
    .map(([norm, e]) => [norm, e.sample, e.recent.size, e.all.size, e.rows]);
  log(`${rows.length} names kept (subaward_rows >= ${MIN_SUBAWARD_ROWS})`);
  if (rows.length === 0 && TEST_MAX_ROWS === null) {
    throw new Error('0 rows to write — refusing to swap an empty summary in');
  }

  // 3. build _new, insert, swap.
  const NEW = 'fac_mirror_passthrough_summary_new';
  const LIVE = 'fac_mirror_passthrough_summary';
  const idx = `pts_${Date.now().toString(36)}`;
  await client.execute(`DROP TABLE IF EXISTS ${NEW}`);
  await client.execute(DDL(NEW));
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    await client.batch(
      rows.slice(i, i + BATCH_SIZE).map((r) => ({
        sql: `INSERT INTO ${NEW}
                (norm_name, sample_name, subrecipient_count_recent, subrecipient_count_all, subaward_rows)
              VALUES (?, ?, ?, ?, ?)`,
        args: r,
      })),
      'write'
    );
  }
  await client.execute(`CREATE INDEX ${idx}_recent ON ${NEW} (subrecipient_count_recent DESC)`);

  const live = await client
    .execute(`SELECT name FROM sqlite_master WHERE type='table' AND name = ?`, [LIVE])
    .catch(() => ({ rows: [] }));
  const swap = [];
  if (live.rows?.length) {
    swap.push(`DROP TABLE IF EXISTS ${LIVE}_old`);
    swap.push(`ALTER TABLE ${LIVE} RENAME TO ${LIVE}_old`);
  }
  swap.push(`ALTER TABLE ${NEW} RENAME TO ${LIVE}`);
  await client.batch(swap, 'write');
  await client.execute(`DROP TABLE IF EXISTS ${LIVE}_old`);

  log(`done — ${rows.length} rows swapped into ${LIVE} in ${((Date.now() - startedAt) / 1000).toFixed(0)}s`);
}

/** Same standalone Resend call as sync-fac-mirror.mjs's notifyOnFailure. */
async function notifyOnFailure(message) {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.WAITLIST_NOTIFY_EMAIL;
  if (!apiKey || !to) return;
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev',
        to,
        subject: 'FAC pass-through summary build failed',
        text: `scripts/build-passthrough-summary.mjs failed:\n\n${message}\n\nThe live fac_mirror_passthrough_summary table was left untouched.`,
      }),
    });
  } catch {
    /* best effort */
  }
}

main()
  .catch(async (err) => {
    const message = err instanceof Error ? err.message : String(err);
    log(`FAILED: ${message}`);
    await client.execute(`DROP TABLE IF EXISTS fac_mirror_passthrough_summary_new`).catch(() => {});
    await notifyOnFailure(message);
    process.exitCode = 1;
  })
  .finally(() => client.close());
