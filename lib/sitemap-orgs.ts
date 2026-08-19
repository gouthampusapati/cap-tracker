import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import path from 'node:path';

/**
 * EIN list backing the generated sitemap. Sourced from the FAC bulk CSV
 * (see scripts/ingest-fac-orgs.mjs), not the live API — enumerating ~200k
 * orgs through api.fac.gov's ~1,000 req/hour limit isn't possible.
 *
 * data/fac-orgs.csv.gz is a committed, periodically-refreshed artifact
 * (`node scripts/ingest-fac-orgs.mjs`, then commit the result). Nothing at
 * request time re-downloads or re-parses the 250MB+ source file.
 */
const DATA_PATH = path.join(process.cwd(), 'data', 'fac-orgs.csv.gz');

export const SITEMAP_CHUNK_SIZE = 50_000;

export function getSitemapChunkCount(): number {
  const total = loadOrgEins().length;
  return Math.max(1, Math.ceil(total / SITEMAP_CHUNK_SIZE));
}

let cachedEins: string[] | null = null;

export function loadOrgEins(): string[] {
  if (cachedEins) return cachedEins;

  try {
    const gz = readFileSync(DATA_PATH);
    const csv = gunzipSync(gz).toString('utf-8');
    cachedEins = csv
      .split('\n')
      .map((line) => line.slice(0, line.indexOf(',')))
      .filter((ein) => /^\d{9}$/.test(ein));
  } catch (err) {
    // Missing/unreadable data file shouldn't take the whole site down —
    // fall back to an empty org list so the sitemap still serves the
    // static pages while this gets fixed.
    console.error('sitemap-orgs: failed to load data/fac-orgs.csv.gz', err);
    cachedEins = [];
  }

  return cachedEins;
}
