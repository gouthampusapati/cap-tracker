/**
 * Pure EIN-list parsing — deliberately has ZERO imports of anything
 * DB/FAC-touching. Split out of lib/portfolio.ts after a real production
 * bug: app/portfolio/portfolio-form.tsx ('use client') imported
 * PORTFOLIO_MAX_EINS/parseEinList from lib/portfolio.ts, which also
 * exports fetchPortfolio — importing anything from that module pulled
 * its whole dependency graph (lib/public-org-cache.ts -> lib/db ->
 * @libsql/client) into the client bundle. lib/db/index.ts runs
 * createClient(...) at module load (a side effect that can't be
 * tree-shaken), which then threw LibsqlError: URL_SCHEME_NOT_SUPPORTED
 * in the browser, where DATABASE_URL isn't defined — crashing every
 * visit to /portfolio with "Application error: a client-side exception
 * has occurred."
 *
 * Keep genuinely pure, client-safe utilities here. Anything that touches
 * lib/db, lib/public-org-cache, or lib/fac-api belongs in
 * lib/portfolio.ts (now guarded with `import 'server-only'`), not here.
 */

export const PORTFOLIO_MAX_EINS = 50;

/**
 * Parses a pasted block of EINs — newline or comma separated, tolerating
 * extra whitespace and formatted EINs like "91-6001236". Dedupes while
 * preserving first-seen order, and reports which entries didn't look like
 * a 9-digit EIN at all (distinct from "not found in the FAC," which is a
 * live lookup result, not a parsing problem).
 */
export function parseEinList(raw: string): { eins: string[]; invalid: string[] } {
  const tokens = raw
    .split(/[\n,]+/)
    .map((t) => t.trim())
    .filter(Boolean);

  const eins: string[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();

  for (const token of tokens) {
    const digitsOnly = token.replace(/[^0-9]/g, '');
    if (!/^\d{9}$/.test(digitsOnly)) {
      invalid.push(token);
      continue;
    }
    if (!seen.has(digitsOnly)) {
      seen.add(digitsOnly);
      eins.push(digitsOnly);
    }
  }

  return { eins, invalid };
}
