/**
 * Pure, client-safe pieces of the auditor directory (types, the
 * name-picking heuristic, the US-state map). Kept separate from
 * lib/auditors.ts so client components — the search form, the tables —
 * can import US_STATES / types without pulling in `server-only` + the DB
 * layer. Same split lib/ein-list.ts vs lib/portfolio.ts uses.
 */

export interface AuditorSearchRow {
  ein: string;
  name: string;
  city: string | null;
  state: string | null;
  auditCount: number;
  clientCount: number;
  mostRecentYear: string | null;
}

export interface AuditorClient {
  ein: string;
  name: string;
  mostRecentFyEnd: string | null;
  auditYears: string[];
  totalFindings: number;
  repeatFindings: number;
  materialWeaknesses: number;
}

export interface AuditorProfile {
  ein: string;
  name: string;
  /** other name spellings on file, most-common first, excluding `name` */
  altNames: string[];
  city: string | null;
  state: string | null;
  zip: string | null;
  addressLine1: string | null;
  phone: string | null;
  contactName: string | null;
  email: string | null;
  auditCount: number;
  clientCount: number;
  totalFindings: number;
  mostRecentYear: string | null;
  /** firm has filed Single Audits from more than one state (multi-office
   * or national) — the address shown is just its modal office */
  multiState: boolean;
  clients: AuditorClient[];
  /** true when `clients` was capped for rendering */
  clientsTruncated: boolean;
}

export interface AuditorSearchOpts {
  state?: string;
  q?: string;
  limit?: number;
}

/**
 * Most frequent non-empty name, tie-broken by the one seen in the most
 * recent audit year. Pure — unit-tested. One firm (auditor_ein) files
 * under dozens of name spellings; this picks the canonical display one.
 */
export function pickFirmName(
  rows: { name: string | null; year: string | null }[]
): { primary: string; alts: string[] } {
  const count = new Map<string, number>();
  const latestYear = new Map<string, string>();
  for (const r of rows) {
    const n = (r.name ?? '').trim();
    if (!n) continue;
    count.set(n, (count.get(n) ?? 0) + 1);
    const y = r.year ?? '';
    if (y > (latestYear.get(n) ?? '')) latestYear.set(n, y);
  }
  if (count.size === 0) return { primary: '', alts: [] };
  const ranked = [...count.keys()].sort((a, b) => {
    const c = (count.get(b) ?? 0) - (count.get(a) ?? 0);
    if (c !== 0) return c;
    const y = (latestYear.get(b) ?? '').localeCompare(latestYear.get(a) ?? '');
    if (y !== 0) return y;
    return a.localeCompare(b);
  });
  return { primary: ranked[0], alts: ranked.slice(1) };
}

// US_STATES / stateName moved to lib/us-states.ts (no longer
// auditor-specific — the org state pages use them too). Re-exported here
// so existing `@/lib/auditors-shared` / `@/lib/auditors` imports keep
// working.
export { US_STATES, stateName } from './us-states';
