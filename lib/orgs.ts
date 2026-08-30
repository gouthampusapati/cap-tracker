import 'server-only';
import { desc, eq, gt, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { facMirrorOrgSummary } from '@/lib/db/schema';
import { US_STATES } from '@/lib/us-states';

export * from '@/lib/us-states';

/**
 * Read side for the SEO org-index pages (the /single-audit hub and
 * /single-audit/state/[state]). Everything comes from
 * fac_mirror_org_summary — one pre-aggregated row per audited
 * organization, built by the weekly sync (see lib/db/schema.ts) — so
 * these are indexed LIMIT scans, not GROUP BYs over the full mirror.
 */

export interface OrgSummary {
  ein: string;
  name: string;
  state: string | null;
  city: string | null;
  auditCount: number;
  mostRecentYear: string | null;
  totalExpended: number | null;
  findingsCount: number;
  isGoingConcern: boolean;
  isLowRisk: boolean;
}

const ORG_COLUMNS = {
  ein: facMirrorOrgSummary.auditeeEin,
  name: facMirrorOrgSummary.name,
  state: facMirrorOrgSummary.state,
  city: facMirrorOrgSummary.city,
  auditCount: facMirrorOrgSummary.auditCount,
  mostRecentYear: facMirrorOrgSummary.mostRecentYear,
  totalExpended: facMirrorOrgSummary.totalExpended,
  findingsCount: facMirrorOrgSummary.findingsCount,
  isGoingConcern: facMirrorOrgSummary.isGoingConcern,
  isLowRisk: facMirrorOrgSummary.isLowRisk,
} as const;

type RawRow = {
  ein: string;
  name: string | null;
  state: string | null;
  city: string | null;
  auditCount: number;
  mostRecentYear: string | null;
  totalExpended: number | null;
  findingsCount: number;
  isGoingConcern: number;
  isLowRisk: number;
};

function shape(r: RawRow): OrgSummary {
  return {
    ein: r.ein,
    name: r.name || r.ein,
    state: r.state,
    city: r.city,
    auditCount: r.auditCount,
    mostRecentYear: r.mostRecentYear,
    totalExpended: r.totalExpended,
    findingsCount: r.findingsCount,
    isGoingConcern: r.isGoingConcern === 1,
    isLowRisk: r.isLowRisk === 1,
  };
}

export interface StateOrgIndex {
  orgs: OrgSummary[];
  total: number;
  withFindings: number;
  goingConcern: number;
}

/** Everything the /single-audit/state/[state] page needs, in one place. */
export async function getStateOrgIndex(stateCode: string, limit = 250): Promise<StateOrgIndex> {
  const state = stateCode.trim().toUpperCase();
  if (!US_STATES[state]) return { orgs: [], total: 0, withFindings: 0, goingConcern: 0 };

  try {
    const [orgs, stats] = await Promise.all([
      db
        .select(ORG_COLUMNS)
        .from(facMirrorOrgSummary)
        .where(eq(facMirrorOrgSummary.state, state))
        .orderBy(desc(facMirrorOrgSummary.totalExpended))
        .limit(limit),
      db
        .select({
          total: sql<number>`count(*)`,
          withFindings: sql<number>`sum(case when ${facMirrorOrgSummary.findingsCount} > 0 then 1 else 0 end)`,
          goingConcern: sql<number>`sum(${facMirrorOrgSummary.isGoingConcern})`,
        })
        .from(facMirrorOrgSummary)
        .where(eq(facMirrorOrgSummary.state, state)),
    ]);

    return {
      orgs: (orgs as RawRow[]).map(shape),
      total: Number(stats[0]?.total ?? 0),
      withFindings: Number(stats[0]?.withFindings ?? 0),
      goingConcern: Number(stats[0]?.goingConcern ?? 0),
    };
  } catch (err) {
    console.error('[orgs] getStateOrgIndex failed:', err);
    return { orgs: [], total: 0, withFindings: 0, goingConcern: 0 };
  }
}

/** The single summary row for one org, or null. Used for the org page's
 * "other organizations in {state}" cross-link. */
export async function getOrgSummary(ein: string): Promise<OrgSummary | null> {
  if (!/^\d{9}$/.test(ein)) return null;
  try {
    const rows = await db
      .select(ORG_COLUMNS)
      .from(facMirrorOrgSummary)
      .where(eq(facMirrorOrgSummary.auditeeEin, ein))
      .limit(1);
    return rows.length ? shape(rows[0] as RawRow) : null;
  } catch (err) {
    console.error('[orgs] getOrgSummary failed:', err);
    return null;
  }
}

/** Org count per state — for the hub's "browse by state" grid. */
export async function getStateOrgCounts(): Promise<Record<string, number>> {
  try {
    const rows = await db
      .select({ state: facMirrorOrgSummary.state, n: sql<number>`count(*)` })
      .from(facMirrorOrgSummary)
      .where(sql`${facMirrorOrgSummary.state} is not null and ${facMirrorOrgSummary.state} <> ''`)
      .groupBy(facMirrorOrgSummary.state);
    const out: Record<string, number> = {};
    for (const r of rows) if (r.state && US_STATES[r.state]) out[r.state] = Number(r.n);
    return out;
  } catch (err) {
    console.error('[orgs] getStateOrgCounts failed:', err);
    return {};
  }
}

/** Going-concern organizations, biggest first — the hub's one "notable" list. */
export async function getGoingConcernOrgs(limit = 15): Promise<OrgSummary[]> {
  try {
    const rows = await db
      .select(ORG_COLUMNS)
      .from(facMirrorOrgSummary)
      .where(eq(facMirrorOrgSummary.isGoingConcern, 1))
      .orderBy(desc(facMirrorOrgSummary.totalExpended))
      .limit(limit);
    return (rows as RawRow[]).map(shape);
  } catch (err) {
    console.error('[orgs] getGoingConcernOrgs failed:', err);
    return [];
  }
}

/** Most-audited organizations — used for internal linking on the hub. */
export async function getMostAuditedOrgs(limit = 15): Promise<OrgSummary[]> {
  try {
    const rows = await db
      .select(ORG_COLUMNS)
      .from(facMirrorOrgSummary)
      .where(gt(facMirrorOrgSummary.auditCount, 1))
      .orderBy(desc(facMirrorOrgSummary.auditCount))
      .limit(limit);
    return (rows as RawRow[]).map(shape);
  } catch (err) {
    console.error('[orgs] getMostAuditedOrgs failed:', err);
    return [];
  }
}

/**
 * The N organizations with the largest federal-award expenditure —
 * drives generateStaticParams for /single-audit/[ein], so the org pages
 * most likely to be linked (state indexes are sorted by this figure) and
 * crawled are prerendered at build instead of rendering cold on first
 * visit. Returns EINs only; one indexed scan of fac_mirror_org_summary.
 */
export async function getTopOrgEinsByExpenditure(limit: number): Promise<string[]> {
  try {
    const rows = await db
      .select({ ein: facMirrorOrgSummary.auditeeEin })
      .from(facMirrorOrgSummary)
      .orderBy(desc(facMirrorOrgSummary.totalExpended))
      .limit(limit);
    return rows.map((r) => r.ein).filter((e) => /^\d{9}$/.test(e));
  } catch (err) {
    console.error('[orgs] getTopOrgEinsByExpenditure failed:', err);
    return [];
  }
}

/** Distinct state codes present in the summary — drives generateStaticParams. */
export async function getPopulatedStateCodes(): Promise<string[]> {
  try {
    const rows = await db
      .selectDistinct({ state: facMirrorOrgSummary.state })
      .from(facMirrorOrgSummary);
    return rows
      .map((r) => r.state)
      .filter((s): s is string => !!s && !!US_STATES[s])
      .sort();
  } catch (err) {
    console.error('[orgs] getPopulatedStateCodes failed:', err);
    return [];
  }
}
