import 'server-only';
import { eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  facMirrorGeneral,
  facMirrorAdditionalEins,
  facMirrorAdditionalUeis,
} from '@/lib/db/schema';

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
  /** True when more than just the queried EIN was found. */
  hasRelated: boolean;
}

function only(ein: string): RelatedIdentifiers {
  return { eins: [ein], ueis: [], primaryEins: [], linkingReportIds: [], hasRelated: false };
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

    return {
      eins: [...eins].sort(),
      ueis: [...ueis].sort(),
      primaryEins: [...primaryEins].filter((e) => e !== ein).sort(),
      linkingReportIds: reportIds.sort(),
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
