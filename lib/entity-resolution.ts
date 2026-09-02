import 'server-only';
import { eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  facMirrorGeneral,
  facMirrorAdditionalEins,
  facMirrorAdditionalUeis,
} from '@/lib/db/schema';

/**
 * Given the covering filings a component EIN appears on, the primary
 * auditee_ein to send it to — the most recent one by fiscal-year end. A
 * component EIN almost always rolls into a single parent entity, but if
 * it moved between entities over the years, the latest filing wins.
 * Returns null when there's nothing to redirect to (no candidates, or
 * the only candidate is the EIN itself). Pure — the DB read lives in
 * resolveCoveringFilingEin below so this stays unit-testable.
 */
export function pickCoveringFilingEin(
  candidates: { parentEin: string | null; fyEnd: string | null }[],
  componentEin: string
): string | null {
  // FAC filings carry well-known junk in additional_eins — placeholder
  // strings a filer typed where a real EIN was unknown (all-zeros,
  // all-nines, 123456789, a single repeated digit). Redirecting those to
  // whatever unrelated filing happened to contain the typo is worse than
  // just 404ing, so refuse to resolve them.
  if (
    !/^\d{9}$/.test(componentEin) ||
    /^(\d)\1{8}$/.test(componentEin) ||
    componentEin === '123456789'
  ) {
    return null;
  }
  const ranked = candidates
    .filter((c): c is { parentEin: string; fyEnd: string | null } => !!c.parentEin && c.parentEin !== componentEin)
    .sort((a, b) => (b.fyEnd ?? '').localeCompare(a.fyEnd ?? ''));
  return ranked[0]?.parentEin ?? null;
}

/**
 * For an EIN with no Single Audit filed under it, the EIN of the audit
 * that covers it — i.e. a filing that lists this EIN in FAC's
 * additional_eins. Used by /single-audit/[ein] to redirect a "component"
 * EIN (a subsidiary/division rolled into a parent entity's audit) to the
 * covering filing instead of 404ing it. Zero FAC calls — mirror only.
 *
 * Callers MUST check for this EIN's own record first: an EIN that files
 * its own audit AND appears as an additional EIN on a parent's audit
 * should render its own page, not redirect.
 */
export async function resolveCoveringFilingEin(ein: string): Promise<string | null> {
  if (!/^\d{9}$/.test(ein)) return null;
  try {
    const rows = await db
      .select({
        parentEin: facMirrorGeneral.auditeeEin,
        fyEnd: facMirrorGeneral.fyEndDate,
      })
      .from(facMirrorAdditionalEins)
      .innerJoin(
        facMirrorGeneral,
        eq(facMirrorGeneral.reportId, facMirrorAdditionalEins.reportId)
      )
      .where(eq(facMirrorAdditionalEins.additionalEin, ein));
    return pickCoveringFilingEin(rows, ein);
  } catch (err) {
    // Mirror tables may not exist yet (first deploy before the Sprint 5
    // sync). A failure here must never break the calling page — it just
    // means "no redirect", and the caller falls through to its 404.
    console.error('[entity-resolution] resolveCoveringFilingEin failed (non-fatal):', err);
    return null;
  }
}

/**
 * Entity resolution off the local bulk mirror (Sprint 5) — zero FAC
 * calls. A single audit can be filed under more than one EIN/UEI; the
 * extras live in fac_mirror_additional_eins / _ueis keyed on report_id,
 * with general.auditee_ein / .auditee_uei as the primary for the same
 * report. Two identifiers that appear on a common report_id belong to
 * one entity.
 *
 * ONE HOP ONLY: given EIN X, this finds every EIN/UEI sharing a report
 * with X directly. It does not transitively chase (X↔Y on report A,
 * Y↔Z on report B ⇒ X↔Z) — that needs union-find across the whole
 * table and isn't worth it for the common case, which is one org
 * filing one audit under a handful of its own EINs. The linking report
 * ids are returned so a caller can show the evidence.
 */

const PLACEHOLDER_UEI = 'GSA_MIGRATION';

export interface RelatedIdentifiers {
  /** Always includes the queried EIN. Sorted, deduped. */
  eins: string[];
  ueis: string[];
  /** The primary auditee_ein of each linking report — i.e. the EIN the
   * audit was actually filed under. When the queried EIN isn't one of
   * these, it's a component entity rolled into someone else's audit and
   * these are its "parent" filings. */
  primaryEins: string[];
  /** report_ids that tie these identifiers together (empty if none). */
  linkingReportIds: string[];
  /** Subset of `eins` that are themselves the primary auditee on some
   * FAC report — i.e. have their own /single-audit/<ein> page. The rest
   * are component entities that only ever appear inside another org's
   * audit and should NOT be linked (they'd 404). */
  einsWithOwnRecord: string[];
  /** True when more than just the queried EIN was found. */
  hasRelated: boolean;
}

function only(ein: string): RelatedIdentifiers {
  return {
    eins: [ein],
    ueis: [],
    primaryEins: [],
    linkingReportIds: [],
    einsWithOwnRecord: [ein],
    hasRelated: false,
  };
}

export async function getRelatedIdentifiers(ein: string): Promise<RelatedIdentifiers> {
  if (!/^\d{9}$/.test(ein)) return only(ein);

  try {
    // report_ids where this EIN appears — as the primary auditee, or
    // listed as an additional EIN on someone else's report.
    const [primaryRows, additionalRows] = await Promise.all([
      db
        .select({ reportId: facMirrorGeneral.reportId })
        .from(facMirrorGeneral)
        .where(eq(facMirrorGeneral.auditeeEin, ein)),
      db
        .select({ reportId: facMirrorAdditionalEins.reportId })
        .from(facMirrorAdditionalEins)
        .where(eq(facMirrorAdditionalEins.additionalEin, ein)),
    ]);

    const reportIds = [
      ...new Set([
        ...primaryRows.map((r) => r.reportId),
        ...additionalRows.map((r) => r.reportId),
      ]),
    ];
    if (reportIds.length === 0) return only(ein);

    // Everything else on those same reports.
    const [generals, addlEins, addlUeis] = await Promise.all([
      db
        .select({ ein: facMirrorGeneral.auditeeEin, uei: facMirrorGeneral.auditeeUei })
        .from(facMirrorGeneral)
        .where(inArray(facMirrorGeneral.reportId, reportIds)),
      db
        .select({ ein: facMirrorAdditionalEins.additionalEin })
        .from(facMirrorAdditionalEins)
        .where(inArray(facMirrorAdditionalEins.reportId, reportIds)),
      db
        .select({ uei: facMirrorAdditionalUeis.additionalUei })
        .from(facMirrorAdditionalUeis)
        .where(inArray(facMirrorAdditionalUeis.reportId, reportIds)),
    ]);

    const eins = new Set<string>([ein]);
    const ueis = new Set<string>();
    const primaryEins = new Set<string>();
    for (const g of generals) {
      if (g.ein) {
        eins.add(g.ein);
        primaryEins.add(g.ein);
      }
      if (g.uei && g.uei !== PLACEHOLDER_UEI) ueis.add(g.uei);
    }
    for (const e of addlEins) if (e.ein) eins.add(e.ein);
    for (const u of addlUeis) if (u.uei && u.uei !== PLACEHOLDER_UEI) ueis.add(u.uei);

    // Which of these EINs actually have their own FAC filing (and thus a
    // real /single-audit page). A component EIN can appear on a linking
    // report as an additional_ein yet also file its own audit under a
    // different report — so this is a fresh lookup, not just primaryEins.
    const allEins = [...eins];
    const ownRows =
      allEins.length > 0
        ? await db
            .selectDistinct({ ein: facMirrorGeneral.auditeeEin })
            .from(facMirrorGeneral)
            .where(inArray(facMirrorGeneral.auditeeEin, allEins))
        : [];
    const withOwn = new Set(ownRows.map((r) => r.ein));
    withOwn.add(ein); // the queried EIN always has a page (we're on it)

    return {
      eins: allEins.sort(),
      ueis: [...ueis].sort(),
      primaryEins: [...primaryEins].filter((e) => e !== ein).sort(),
      linkingReportIds: reportIds.sort(),
      einsWithOwnRecord: [...withOwn].sort(),
      hasRelated: eins.size > 1,
    };
  } catch (err) {
    // The mirror tables may not exist yet (first deploy before the
    // Sprint 5 sync run adds them). Entity resolution is additive — a
    // failure here must never break the page that called it.
    console.error('[entity-resolution] getRelatedIdentifiers failed (non-fatal):', err);
    return only(ein);
  }
}
