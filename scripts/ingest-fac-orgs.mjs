#!/usr/bin/env node
/**
 * Ingest the FAC bulk "general" CSV into a compact org list for the sitemap.
 *
 * Source: https://app.fac.gov/dissemination/public-data/gsa/full/general.csv
 * One row per audit *submission* (a report_id) — the same EIN appears once
 * per audit year it filed. This script dedupes down to one row per EIN,
 * keeping the most recent fy_end_date, and writes a gzipped two-column
 * CSV (ein,name) to data/fac-orgs.csv.gz.
 *
 * Why not call api.fac.gov for this instead: the live API is rate-limited
 * to ~1,000 req/hour per key, nowhere near enough to enumerate ~40k+
 * orgs/year. The bulk CSV is a full, unauthenticated snapshot GSA publishes
 * for exactly this kind of use.
 *
 * This is a maintenance script, not part of the app build — the bulk file
 * is ~250MB+ and takes a couple of minutes to stream and parse. Run it by
 * hand (or on a schedule, e.g. weekly) and commit the resulting
 * data/fac-orgs.csv.gz. app/sitemap.ts reads that committed file at
 * request time; it never re-downloads the bulk CSV itself.
 *
 * Usage:
 *   node scripts/ingest-fac-orgs.mjs
 *   node scripts/ingest-fac-orgs.mjs --input ./local-general.csv   # skip the download, e.g. for testing
 */

import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { createGzip } from 'node:zlib';
import path from 'node:path';
import { parse } from 'csv-parse';

const BULK_CSV_URL = 'https://app.fac.gov/dissemination/public-data/gsa/full/general.csv';
const OUT_PATH = path.join(process.cwd(), 'data', 'fac-orgs.csv.gz');

const args = process.argv.slice(2);
const inputFlagIdx = args.indexOf('--input');
const localInput = inputFlagIdx !== -1 ? args[inputFlagIdx + 1] : null;

async function openSource() {
  if (localInput) {
    console.log(`Reading local file: ${localInput}`);
    return createReadStream(localInput);
  }

  console.log(`Downloading ${BULK_CSV_URL} ...`);
  const res = await fetch(BULK_CSV_URL);
  if (!res.ok || !res.body) {
    throw new Error(`Bulk CSV download failed: HTTP ${res.status}`);
  }
  const contentLength = res.headers.get('content-length');
  if (contentLength) {
    console.log(`  content-length: ${(Number(contentLength) / 1e6).toFixed(1)} MB`);
  }
  return res.body;
}

async function main() {
  const source = await openSource();

  // Map<ein, { name, fyEnd }> — last-write-wins per EIN, but we compare
  // fy_end_date so a stale earlier row can't clobber a newer one when the
  // CSV isn't strictly ordered.
  const orgs = new Map();

  const parser = parse({
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
  });

  let rows = 0;
  let skipped = 0;

  const parsing = (async () => {
    for await (const record of parser) {
      rows++;
      const ein = (record.auditee_ein || '').trim();
      const name = (record.auditee_name || '').trim();
      const fyEnd = (record.fy_end_date || '').trim();

      // A handful of FAC rows carry a placeholder EIN instead of a real
      // one (000000000, 111111111, ...) — always a repeated digit, never
      // a real IRS-assigned EIN. Drop them rather than publish a page that
      // conflates whichever orgs share that placeholder.
      const isPlaceholder = /^(\d)\1{8}$/.test(ein);

      if (!/^\d{9}$/.test(ein) || isPlaceholder || !name) {
        skipped++;
        continue;
      }

      const existing = orgs.get(ein);
      if (!existing || fyEnd > existing.fyEnd) {
        orgs.set(ein, { name, fyEnd });
      }

      if (rows % 100000 === 0) {
        console.log(`  ${rows.toLocaleString()} rows read, ${orgs.size.toLocaleString()} unique EINs so far`);
      }
    }
  })();

  // node's fetch body (a web ReadableStream) needs Readable.fromWeb; a
  // fs.ReadStream (local file / --input) is already a Node stream.
  const nodeSource =
    typeof source.pipe === 'function'
      ? source
      : (await import('node:stream')).Readable.fromWeb(source);

  nodeSource.pipe(parser);
  await parsing;

  console.log(`Parsed ${rows.toLocaleString()} rows, skipped ${skipped.toLocaleString()} (bad EIN or missing name).`);
  console.log(`${orgs.size.toLocaleString()} unique organizations.`);

  await mkdir(path.dirname(OUT_PATH), { recursive: true });

  // Sort by EIN so re-running produces a stable, easily diffable file.
  const sortedEins = Array.from(orgs.keys()).sort();

  await pipeline(
    (async function* () {
      for (const ein of sortedEins) {
        const { name } = orgs.get(ein);
        // Two columns only — the sitemap needs EIN for the URL and name is
        // kept purely for humans reading a diff of this file, not used by
        // sitemap.ts. Escape embedded quotes/commas the simple way.
        const safeName = /[,"\n]/.test(name) ? `"${name.replace(/"/g, '""')}"` : name;
        yield `${ein},${safeName}\n`;
      }
    })(),
    createGzip(),
    createWriteStream(OUT_PATH)
  );

  console.log(`Wrote ${OUT_PATH}`);
}

main().catch((err) => {
  console.error('Ingestion failed:', err);
  process.exit(1);
});
