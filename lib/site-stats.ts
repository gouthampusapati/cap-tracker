import rawStats from './site-stats.json';

/**
 * Homepage "stat bar" numbers — real row counts from the FAC bulk
 * mirror, not invented figures (see the redesign brief's Section 2).
 *
 * The values in site-stats.json are refreshed automatically by
 * scripts/sync-fac-mirror.mjs at the end of each successful weekly sync
 * (cheap COUNT(*) reads against the just-swapped live tables — no
 * write-quota cost) and committed back to main by the "Sync FAC Bulk
 * Mirror" GitHub Actions workflow. Safe to hand-edit; the next sync
 * overwrites it.
 *
 * They are deliberately displayed rounded-down with a "+" on the
 * homepage (see approxCount) — the mirror is a subset of FAC's full
 * history and an over-precise figure would imply more than it should.
 */
export interface SiteStats {
  /** Distinct auditee EINs in fac_mirror_general. */
  organizations: number;
  /** Rows in fac_mirror_general — one per (organization, audit year). */
  auditReports: number;
  /** Distinct auditor EINs, excluding FAC's placeholders ('' / 999999999). */
  auditFirms: number;
  earliestAuditYear: number;
  latestAuditYear: number;
  /** YYYY-MM-DD the counts were last regenerated. */
  refreshedAt: string;
}

export const SITE_STATS: SiteStats = rawStats;

/**
 * Round a count down to a "safe" round number with a trailing "+", so
 * the homepage never claims more precision than a weekly-refreshed
 * subset warrants. 68,242 -> "68,000+"; 8,378 -> "8,300+".
 */
export function approxCount(n: number): string {
  if (n >= 10_000) return `${Math.floor(n / 1000).toLocaleString('en-US')},000+`;
  if (n >= 1_000) return `${(Math.floor(n / 100) * 100).toLocaleString('en-US')}+`;
  return n.toLocaleString('en-US');
}
