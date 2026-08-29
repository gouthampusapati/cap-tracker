import 'server-only';
import { cache } from 'react';
import { unstable_cache } from 'next/cache';
import { and, eq, inArray, like, or, sql, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import { facMirrorGeneral, facMirrorFindings } from '@/lib/db/schema';
import {
  pickFirmName,
  US_STATES,
  type AuditorClient,
  type AuditorProfile,
  type AuditorSearchOpts,
  type AuditorSearchRow,
} from '@/lib/auditors-shared';

export * from '@/lib/auditors-shared';

/**
 * Auditor-firm directory + profile, built entirely off the local mirror
 * (Sprint C) — 0 FAC calls. Everything is keyed on `auditor_ein`: one
 * firm files under one EIN but with dozens of name spellings, collapsed
 * by pickFirmName (lib/auditors-shared.ts).
 *
 * All fields shown are public record — FAC disseminates the full
 * `general` table (Single Audit Act; app.fac.gov). Firm name / address /
 * phone are ordinary business-listing data. `auditor_contact_name` and
 * `auditor_email` are individuals: still public record, surfaced with a
 * "from the FAC filing" label and no auto-linked mailto.
 */

/** Placeholder auditor_ein values that aren't a single real firm:
 * GSA_MIGRATION (legacy), and 999999999 (FAC's catch-all for foreign
 * auditors with no US EIN — aggregating them would merge unrelated
 * firms). */
const PLACEHOLDER_AUDITOR_EINS = ['', 'GSA_MIGRATION', '999999999'];

/** SQL predicate: auditor_ein is a real firm EIN. */
const isRealFirmEin = sql`${facMirrorGeneral.auditorEin} is not null and ${facMirrorGeneral.auditorEin} not in ('', 'GSA_MIGRATION', '999999999')`;

const CLIENT_RENDER_CAP = 300;

/**
 * Normalise a city string for matching: lowercase, drop periods, and
 * fold the "Saint" / "St." abbreviation to one form, so a search for
 * "Saint Louis" finds firms the FAC records in "St. Louis" (and vice
 * versa). The SQL side applies the same transform to auditor_city.
 */
function normalizeCity(s: string): string {
  return s
    .toLowerCase()
    .replace(/\./g, '')
    .replace(/\bsaint\b/g, 'st')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * These reads hit an unindexed full GROUP BY over the whole
 * fac_mirror_general table (~2.5s for the unfiltered "top firms" view,
 * ~2s more to resolve the 150 firms' name spellings) and the page is
 * dynamic (reads searchParams), so nothing was cached between requests.
 * Wrap the whole thing in the Next data cache, keyed by (state, q,
 * limit), revalidated daily — the mirror only changes weekly, so a
 * day-stale directory listing is fine. The proper fix is a precomputed
 * per-firm summary table in the sync script; this is the cheap interim.
 */
export function searchAuditorFirms(opts: AuditorSearchOpts): Promise<AuditorSearchRow[]> {
  const stateRaw = (opts.state ?? '').trim().toUpperCase();
  const state = US_STATES[stateRaw] ? stateRaw : '';
  const q = (opts.q ?? '').trim().slice(0, 80);
  const limit = Math.min(opts.limit ?? 150, 500);
  return cachedSearchAuditorFirms(state, q, limit);
}

const cachedSearchAuditorFirms = unstable_cache(
  _searchAuditorFirms,
  ['auditor-firm-search-v2'],
  { revalidate: 86400, tags: ['auditor-directory'] }
);

async function _searchAuditorFirms(
  state: string,
  q: string,
  limit: number
): Promise<AuditorSearchRow[]> {
  try {
    const where: SQL[] = [isRealFirmEin];
    if (state) where.push(eq(facMirrorGeneral.auditorState, state));
    if (q) {
      const nq = normalizeCity(q);
      const qCond = or(
        like(facMirrorGeneral.auditorFirmName, `%${q}%`),
        sql`replace(replace(lower(${facMirrorGeneral.auditorCity}), '.', ''), 'saint', 'st') like ${`%${nq}%`}`
      );
      if (qCond) where.push(qCond);
    }

    const agg = await db
      .select({
        ein: sql<string>`${facMirrorGeneral.auditorEin}`,
        auditCount: sql<number>`count(*)`,
        clientCount: sql<number>`count(distinct ${facMirrorGeneral.auditeeEin})`,
        mostRecentYear: sql<string>`max(${facMirrorGeneral.auditYear})`,
      })
      .from(facMirrorGeneral)
      .where(and(...where))
      .groupBy(facMirrorGeneral.auditorEin)
      .orderBy(sql`count(*) desc`)
      .limit(limit);

    if (agg.length === 0) return [];

    const eins = agg.map((a) => a.ein);
    const nameRows = await db
      .select({
        ein: sql<string>`${facMirrorGeneral.auditorEin}`,
        name: facMirrorGeneral.auditorFirmName,
        city: facMirrorGeneral.auditorCity,
        state: facMirrorGeneral.auditorState,
        year: facMirrorGeneral.auditYear,
        n: sql<number>`count(*)`,
      })
      .from(facMirrorGeneral)
      .where(inArray(facMirrorGeneral.auditorEin, eins))
      .groupBy(
        facMirrorGeneral.auditorEin,
        facMirrorGeneral.auditorFirmName,
        facMirrorGeneral.auditorCity,
        facMirrorGeneral.auditorState
      );

    const byEin = new Map<string, typeof nameRows>();
    for (const r of nameRows) {
      const list = byEin.get(r.ein);
      if (list) list.push(r);
      else byEin.set(r.ein, [r]);
    }

    return agg.map((a) => {
      const variants = byEin.get(a.ein) ?? [];
      const { primary } = pickFirmName(variants.map((v) => ({ name: v.name, year: v.year })));
      // Location from the variant seen most often (proxy for "current").
      const loc = [...variants].sort((x, y) => (y.n ?? 0) - (x.n ?? 0))[0];
      return {
        ein: a.ein,
        name: primary || a.ein,
        city: loc?.city || null,
        state: loc?.state || null,
        auditCount: Number(a.auditCount),
        clientCount: Number(a.clientCount),
        mostRecentYear: a.mostRecentYear || null,
      };
    });
  } catch (err) {
    console.error('[auditors] searchAuditorFirms failed:', err);
    return [];
  }
}

/** auditor_eins for the sitemap — most-filed firms first. */
export async function topAuditorEins(limit = 3000): Promise<string[]> {
  try {
    const rows = await db
      .select({ ein: sql<string>`${facMirrorGeneral.auditorEin}`, n: sql<number>`count(*)` })
      .from(facMirrorGeneral)
      .where(isRealFirmEin)
      .groupBy(facMirrorGeneral.auditorEin)
      .orderBy(sql`count(*) desc`)
      .limit(limit);
    return rows.map((r) => r.ein).filter((e) => /^\d{9}$/.test(e));
  } catch (err) {
    console.error('[auditors] topAuditorEins failed:', err);
    return [];
  }
}

/**
 * Two layers:
 *  - unstable_cache: the profile query for a big firm is slow (~1.5s to
 *    pull every filing + ~3s for the findings JOIN — CliftonLarsonAllen
 *    has ~14k filings) and the page is dynamic, so persist the built
 *    profile in the Next data cache, revalidated daily (mirror is
 *    weekly).
 *  - cache(): request-level dedup so generateMetadata + the page render
 *    still share a single lookup within one request.
 */
const cachedAuditorProfile = unstable_cache(_getAuditorProfile, ['auditor-profile-v2'], {
  revalidate: 86400,
  tags: ['auditor-directory'],
});

export const getAuditorProfile = cache(
  (ein: string): Promise<AuditorProfile | null> => cachedAuditorProfile(ein)
);

async function _getAuditorProfile(ein: string): Promise<AuditorProfile | null> {
  if (!/^\d{9}$/.test(ein) || PLACEHOLDER_AUDITOR_EINS.includes(ein)) return null;

  try {
    const rows = await db
      .select({
        reportId: facMirrorGeneral.reportId,
        auditeeEin: facMirrorGeneral.auditeeEin,
        auditeeName: facMirrorGeneral.auditeeName,
        auditYear: facMirrorGeneral.auditYear,
        fyEndDate: facMirrorGeneral.fyEndDate,
        name: facMirrorGeneral.auditorFirmName,
        city: facMirrorGeneral.auditorCity,
        state: facMirrorGeneral.auditorState,
        zip: facMirrorGeneral.auditorZip,
        addr: facMirrorGeneral.auditorAddressLine1,
        phone: facMirrorGeneral.auditorPhone,
        contactName: facMirrorGeneral.auditorContactName,
        email: facMirrorGeneral.auditorEmail,
      })
      .from(facMirrorGeneral)
      .where(eq(facMirrorGeneral.auditorEin, ein));

    if (rows.length === 0) return null;

    const { primary, alts } = pickFirmName(rows.map((r) => ({ name: r.name, year: r.auditYear })));

    const byYearDesc = [...rows].sort((a, b) => (b.auditYear ?? '').localeCompare(a.auditYear ?? ''));

    // Location = the firm's MODAL (city, state), not its most recent —
    // a big multi-office firm files each audit from the local office,
    // and one stray filing shouldn't relabel the whole firm. The
    // contact block (address/phone/…) then comes from the most recent
    // filing IN that modal state, so it's internally consistent.
    const stateCount = new Map<string, number>();
    for (const r of rows) {
      const s = (r.state ?? '').trim();
      if (s) stateCount.set(s, (stateCount.get(s) ?? 0) + 1);
    }
    const modalStateEntry = [...stateCount.entries()].sort((a, b) => b[1] - a[1])[0];
    const modalState = modalStateEntry?.[0] ?? null;
    const totalWithState = [...stateCount.values()].reduce((s, n) => s + n, 0);
    // "Multi-state" only when the home office genuinely doesn't dominate
    // — a firm with one stray out-of-state audit isn't multi-office.
    const multiState =
      stateCount.size > 1 &&
      totalWithState > 0 &&
      (modalStateEntry?.[1] ?? 0) / totalWithState < 0.85;

    const inModalState = modalState
      ? byYearDesc.filter((r) => (r.state ?? '').trim() === modalState)
      : byYearDesc;
    const cityCount = new Map<string, number>();
    for (const r of inModalState) {
      const cty = (r.city ?? '').trim();
      if (cty) cityCount.set(cty, (cityCount.get(cty) ?? 0) + 1);
    }
    const modalCity = [...cityCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

    // First non-empty value, newest-first, among filings in the modal state.
    const firstNonEmpty = (get: (r: (typeof rows)[number]) => string | null) => {
      for (const r of inModalState) {
        const v = (get(r) ?? '').trim();
        if (v) return v;
      }
      return null;
    };

    // Findings per report for this firm's audits — JOIN, not a giant IN.
    const findingAgg = await db
      .select({
        reportId: facMirrorFindings.reportId,
        total: sql<number>`count(distinct ${facMirrorFindings.referenceNumber})`,
        repeat: sql<number>`sum(case when ${facMirrorFindings.isRepeatFinding} = 'Y' then 1 else 0 end)`,
        mw: sql<number>`sum(case when ${facMirrorFindings.isMaterialWeakness} = 'Y' then 1 else 0 end)`,
      })
      .from(facMirrorFindings)
      .innerJoin(facMirrorGeneral, eq(facMirrorGeneral.reportId, facMirrorFindings.reportId))
      .where(eq(facMirrorGeneral.auditorEin, ein))
      .groupBy(facMirrorFindings.reportId);

    const fByReport = new Map(findingAgg.map((f) => [f.reportId, f]));

    // Group the firm's audits by client org.
    const clientMap = new Map<string, AuditorClient>();
    for (const r of rows) {
      const key = r.auditeeEin;
      let cl = clientMap.get(key);
      if (!cl) {
        cl = {
          ein: r.auditeeEin,
          name: r.auditeeName ?? r.auditeeEin,
          mostRecentFyEnd: null,
          auditYears: [],
          totalFindings: 0,
          repeatFindings: 0,
          materialWeaknesses: 0,
        };
        clientMap.set(key, cl);
      }
      if (r.auditYear && !cl.auditYears.includes(r.auditYear)) cl.auditYears.push(r.auditYear);
      if ((r.fyEndDate ?? '') > (cl.mostRecentFyEnd ?? '')) cl.mostRecentFyEnd = r.fyEndDate ?? null;
      const f = fByReport.get(r.reportId);
      if (f) {
        cl.totalFindings += Number(f.total) || 0;
        cl.repeatFindings += Number(f.repeat) || 0;
        cl.materialWeaknesses += Number(f.mw) || 0;
      }
    }

    for (const cl of clientMap.values()) cl.auditYears.sort((a, b) => b.localeCompare(a));

    const clients = [...clientMap.values()].sort((a, b) => {
      const fy = (b.mostRecentFyEnd ?? '').localeCompare(a.mostRecentFyEnd ?? '');
      if (fy !== 0) return fy;
      return b.totalFindings - a.totalFindings;
    });

    const totalFindings = [...clientMap.values()].reduce((s, c) => s + c.totalFindings, 0);

    return {
      ein,
      name: primary || ein,
      altNames: alts.slice(0, 5),
      city: modalCity,
      state: modalState,
      zip: firstNonEmpty((r) => r.zip),
      addressLine1: firstNonEmpty((r) => r.addr),
      phone: firstNonEmpty((r) => r.phone),
      contactName: firstNonEmpty((r) => r.contactName),
      email: firstNonEmpty((r) => r.email),
      auditCount: rows.length,
      clientCount: clientMap.size,
      totalFindings,
      mostRecentYear: byYearDesc[0]?.auditYear || null,
      multiState,
      clients: clients.slice(0, CLIENT_RENDER_CAP),
      clientsTruncated: clients.length > CLIENT_RENDER_CAP,
    };
  } catch (err) {
    console.error('[auditors] getAuditorProfile failed:', err);
    return null;
  }
}
