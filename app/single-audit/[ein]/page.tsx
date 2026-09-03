import { cache, Suspense } from 'react';
import { notFound, permanentRedirect } from 'next/navigation';
import Link from 'next/link';
import { Metadata } from 'next';
import { getPublicOrg } from '@/lib/public-org-cache';
import { getRelatedIdentifiers, resolveCoveringFilingEin } from '@/lib/entity-resolution';
import { getOrgSummary, getTopOrgEinsByExpenditure, stateName } from '@/lib/orgs';
import { agencyPrefixLabel, entityTypeLabel, isYesNo, parseGaapResults } from '@/lib/fac-api';
import { SITE_URL } from '@/lib/site-url';
import { ManagementDecisionBlock } from '@/app/management-decision-block';
import { Footer } from '@/app/footer';
import { FindingCard } from './finding-card';
import { HashExpand } from './hash-expand';
import { SeverityFilter } from './severity-filter';
import { BackLink, BackButton, RiskAssessmentLink } from './portfolio-links';

// The bulk mirror only refreshes weekly, and getPublicOrg does its own
// filing-deadline-aware live check for the orgs where freshness actually
// matters (lib/org-cache-ttl.ts) — so the page cache is tied to the
// mirror cadence (7 days). This is the bulk of the sitemap (~68K URLs);
// at a daily revalidate, crawler traffic rewrote every one of them
// ~weekly for no data change, which blew Vercel's ISR-write budget.
export const revalidate = 604800;

// Prerender the PRERENDER_TOP_ORGS organizations with the largest
// federal-award expenditure — the ones state indexes sort to the top and
// the ones a crawler working the sitemap hits first, so they're served
// static from the edge on the very first visit instead of rendering cold
// (~1-2s of mirror reads + render). dynamicParams stays true (default):
// every other EIN (the ~67K long tail) still renders on demand and then
// ISR-caches per `revalidate` — without SOME generateStaticParams a
// dynamic segment is treated as fully dynamic and `revalidate` is
// silently ignored.
//
// Held at 500 deliberately: Vercel's build machine is small (2 cores,
// 8 GB) and each of these is a mirror read + render, so this is a
// balance between first-visit coverage and build time. getTopOrgEins…
// also filters out the giant orgs whose pages exceed Vercel's ~19 MB
// prerender ceiling (see lib/orgs.ts).
//
// Build safety: getPublicOrg serves these from the mirror at build time
// (0 FAC calls — see IS_BUILD in lib/public-org-cache.ts), so hundreds of
// back-to-back prerenders can't exhaust the shared FAC budget.
const PRERENDER_TOP_ORGS = 500;

export async function generateStaticParams(): Promise<{ ein: string }[]> {
  const eins = await getTopOrgEinsByExpenditure(PRERENDER_TOP_ORGS);
  return eins.map((ein) => ({ ein }));
}

// Each render does 4 FAC calls (1 sequential + 3 parallel — see
// lib/fac-api.ts). Default Vercel function timeouts (10s Hobby / 15s Pro)
// leave little room for FAC latency on a big org; give it more headroom
// while staying under the Hobby plan's 60s ceiling so this works on any tier.
export const maxDuration = 30;

export interface Finding {
  reportId: string;
  auditYear: string;
  fiscalYearEnd: string;
  facFindingId: string;
  category: string;
  typeRequirement: string;
  description: string;
  plannedAction: string;
  isRepeatFinding: boolean;
  priorRefs: string[];
  isMaterialWeakness: boolean;
  isSignificantDeficiency: boolean;
  isModifiedOpinion: boolean;
  isOtherMatters: boolean;
  isOtherFindings: boolean;
  hasQuestionedCosts: boolean;
  awardReferences: string[];
}

interface AuditYear {
  reportId: string;
  fiscalYearEnd: string;
  fiscalYearStart: string;
  totalAmountExpended: number;
  entityType: string;
  isLowRiskAuditee: boolean;
  isGoingConcern: boolean;
  isMaterialNoncomplianceDisclosed: boolean;
  gaapResultsRaw: string;
  auditorFirmName: string;
  auditorEin: string;
  cognizantAgency: string;
  oversightAgency: string;
  facAcceptedDate: string | null;
}

interface OrgData {
  ein: string;
  uei: string;
  name: string;
  auditHistory: AuditYear[];
  findings: Finding[];
  totalReports: number;
  findingsCount: number;
  repeatFindingsCount: number;
  syncedAt: Date;
  // True when this is cached data served because the shared FAC
  // request budget was exhausted (or a live refresh failed) rather
  // than because it was still within the normal 24h freshness window.
  stale: boolean;
}

type OrgFetchResult =
  | { kind: 'ok'; org: OrgData }
  | { kind: 'not-found' }
  // Never checked before, and the shared FAC budget is exhausted right
  // now so we can't check. NOT the same as not-found — see the
  // `unavailable` field on OrgLookupResult in lib/public-org-cache.ts.
  // Rendered as a normal page (see below), not thrown: under sustained
  // crawler load this is routine, expected demand, not a bug, and
  // throwing here was what actually drove the site's error rate up —
  // every one of these used to be a 500.
  | { kind: 'unavailable' };

/**
 * Reads from the shared public-org cache (Turso-backed — see
 * lib/public-org-cache.ts) rather than calling the FAC directly. A cache
 * hit within 24h serves instantly with no FAC call at all; a miss fetches
 * live and stores the result. Shared with /portfolio and
 * /api/org/[ein], so an EIN looked up through any of the three warms the
 * cache for all of them.
 *
 * IMPORTANT: this does NOT catch every fetch failure — a genuine FAC
 * outage or network error with nothing cached to fall back to still
 * propagates as a thrown error, caught by error.tsx in this route
 * segment. The routine "budget's exhausted and we've never checked this
 * EIN" case is NOT thrown, though; it's returned as `{ kind:
 * 'unavailable' }` and rendered inline below. Both 'not-found' and
 * 'unavailable' leave `org` null for very different reasons — conflating
 * them (the bug this comment used to warn about) tells a visitor "not
 * found" when the truth is "haven't checked yet."
 */
// cache() so generateMetadata and the page render share ONE getPublicOrg
// lookup per request instead of doing the whole mirror read (synced-at +
// general + findings/text/cap) twice. Same reason getAuditorProfile is
// wrapped.
const fetchOrgData = cache(async (ein: string): Promise<OrgFetchResult> => {
  if (!/^\d{9}$/.test(ein)) return { kind: 'not-found' };

  const { org, syncedAt, stale, unavailable } = await getPublicOrg(ein);
  if (unavailable) return { kind: 'unavailable' };
  if (!org) return { kind: 'not-found' };

  return {
    kind: 'ok',
    org: {
      ein: org.ein,
      uei: org.uei,
      name: org.name,
      syncedAt,
      stale,
      auditHistory: org.reports.map((r) => ({
        reportId: r.report_id,
        fiscalYearEnd: r.fy_end_date,
        fiscalYearStart: r.fy_start_date,
        totalAmountExpended: r.total_amount_expended,
        entityType: r.entity_type,
        // Bug caught live while adding the new Yes/No fields below: this
        // compared against 'Y', but general's boolean fields actually
        // use "Yes"/"No" (a different convention from findings' "Y"/
        // "N") — isLowRiskAuditee was always false regardless of the
        // real value. See isYesNo's doc comment in lib/fac-api.ts.
        isLowRiskAuditee: isYesNo(r.is_low_risk_auditee),
        isGoingConcern: isYesNo(r.is_going_concern_included),
        isMaterialNoncomplianceDisclosed: isYesNo(r.is_material_noncompliance_disclosed),
        gaapResultsRaw: r.gaap_results,
        auditorFirmName: r.auditor_firm_name || '',
        auditorEin: r.auditor_ein || '',
        cognizantAgency: r.cognizant_agency || '',
        oversightAgency: r.oversight_agency || '',
        facAcceptedDate: r.fac_accepted_date,
      })),
      findings: org.findings,
      totalReports: org.reports.length,
      findingsCount: org.findings.length,
      repeatFindingsCount: org.findings.filter((f) => f.isRepeatFinding).length,
    },
  };
});

export async function generateMetadata(props: {
  params: Promise<{ ein: string }>;
}): Promise<Metadata> {
  const params = await props.params;

  let result: OrgFetchResult;
  try {
    result = await fetchOrgData(params.ein);
  } catch {
    // Metadata has to return *something* even when the underlying fetch
    // failed — this deliberately doesn't say "not found," since a fetch
    // failure says nothing about whether the org actually exists.
    return {
      title: 'Temporarily Unavailable',
      description: 'This page could not be loaded right now. Try again shortly.',
    };
  }

  if (result.kind === 'unavailable') {
    return {
      title: 'Temporarily Unavailable',
      description: 'This page could not be loaded right now. Try again shortly.',
    };
  }

  if (result.kind === 'not-found') {
    return {
      title: 'Organization Not Found',
      description: 'This organization was not found in the Federal Audit Clearinghouse.',
    };
  }

  const org = result.org;

  // Suffix used to read "| Federal Audit Clearinghouse", which in a search
  // result reads as though the FAC published this page — the site footer
  // already disclaims that affiliation, so the title was contradicting it.
  const title = `${org.name} - Single Audit | Single Audit Intelligence`;

  // Enrich the description with the facts a searcher is actually
  // weighing — how recent the data is, and whether there's a
  // going-concern year — rather than just the raw counts. org.auditHistory
  // is newest-first (see getReportsByEin's order param).
  const latestFy = org.auditHistory[0]?.fiscalYearEnd?.slice(0, 4) || null;
  const hasGoingConcern = org.auditHistory.some((ay) => ay.isGoingConcern);
  const audits = `${org.totalReports} audit${org.totalReports === 1 ? '' : 's'}`;
  const findings = `${org.findingsCount} finding${org.findingsCount === 1 ? '' : 's'}`;
  const repeat = org.repeatFindingsCount > 0 ? ` (${org.repeatFindingsCount} repeat)` : '';
  const description =
    `Single Audit history for ${org.name} (EIN ${org.ein}) from the Federal Audit Clearinghouse: ` +
    `${audits} on file, ${findings}${repeat}` +
    `${latestFy ? `, most recent FY ${latestFy}` : ''}.` +
    `${hasGoingConcern ? ' Includes a year with a going-concern opinion.' : ''}`;
  const canonicalUrl = `${SITE_URL}/single-audit/${org.ein}`;

  return {
    title,
    description,
    alternates: {
      // Pinned explicitly rather than left to Next's default inference, so
      // the canonical tag can't drift from what the sitemap actually lists
      // (see lib/site-url.ts for why that drift happened once already).
      canonical: canonicalUrl,
    },
    openGraph: {
      title,
      description,
      type: 'website',
      url: canonicalUrl,
      // The per-org dynamic opengraph-image.tsx route was removed (68K
      // on-demand Satori/resvg renders/month blew Vercel's Fluid Active
      // CPU + ISR-write budget for near-zero social value on the long
      // tail). Point at the static site image explicitly — an inherited
      // (parent-segment) file-convention image is NOT merged into a
      // route's own openGraph block, only a same-segment one is.
      images: [{ url: `${SITE_URL}/opengraph-image.png`, width: 1200, height: 630 }],
    },
  };
}

export default async function SingleAuditPage(props: {
  params: Promise<{ ein: string }>;
}) {
  // NOTE: this component deliberately does NOT read searchParams. Doing
  // so forces a full dynamic render on every request (same as
  // cookies()/headers()), which is exactly what kept this page — one of
  // ~68K near-identical org pages, the bulk of the sitemap — off Vercel's
  // edge cache entirely. The portfolio-trail links (?from=portfolio&eins=)
  // are read client-side instead, in ./portfolio-links.tsx, so the page
  // shell stays ISR-cacheable and the trail still works after hydration.
  const params = await props.params;

  // fetchOrgData, getRelatedIdentifiers and getOrgSummary are three
  // independent reads keyed only by the EIN — fire them together instead
  // of fetchOrgData, then the other two. On a mirror hit (the common
  // case) this collapses ~3 serial DB phases into 1, which is most of the
  // cold-render latency. related/summary are wasted only on the rare
  // not-found / unavailable EIN; both guard their own input and never
  // throw.
  const [result, related, orgSummary] = await Promise.all([
    fetchOrgData(params.ein),
    getRelatedIdentifiers(params.ein),
    getOrgSummary(params.ein),
  ]);

  if (result.kind !== 'ok') {
    // No Single Audit is filed under this EIN — but FAC's additional_eins
    // may show it as a component of a parent entity's audit (a hospital
    // in a health system, an agency under a state, a subsidiary). Those
    // ~14K EINs used to dead-end here as "Organization Not Found" / "Not
    // checked yet" AND burned a live FAC lookup each time; send them to
    // the covering filing instead. Only the non-'ok' path pays for this
    // extra mirror read, so a normal org page is unaffected.
    const coveringEin = await resolveCoveringFilingEin(params.ein);
    if (coveringEin) {
      permanentRedirect(`/single-audit/${coveringEin}`);
    }
  }

  if (result.kind === 'not-found') {
    notFound();
  }

  if (result.kind === 'unavailable') {
    // Rendered as a normal 200, not an error page: we haven't looked up
    // this EIN before and the shared FAC budget is fully spent for the
    // hour, which under sustained crawler load is routine and expected,
    // not a failure. See the OrgFetchResult comment above fetchOrgData.
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white border border-gray-200 rounded-lg p-8 text-center">
          <h1 className="text-xl font-bold text-gray-900 mb-3">Not checked yet</h1>
          <p className="text-gray-600 mb-6">
            We haven&apos;t looked up this organization&apos;s Federal Audit Clearinghouse record
            yet, and the shared FAC request budget is fully used for this hour. This doesn&apos;t
            mean the organization has no audit history &mdash; check back in a little while.
          </p>
          <Suspense
            fallback={
              <Link
                href="/"
                className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-semibold px-5 py-2.5 rounded-lg"
              >
                Back to home
              </Link>
            }
          >
            <BackButton />
          </Suspense>
        </div>
      </div>
    );
  }

  const org = result.org;

  // Entity resolution (Sprint 5) + the SEO "other orgs in {state}" link,
  // both fetched above in parallel with the org data itself (0 FAC calls).
  //   parentEins  — this EIN is a component rolled into another entity's
  //                 audit; those are the filings that actually cover it.
  //   siblingEins — other EINs this same audit covers (can be hundreds
  //                 for a big health system — capped in the UI).
  const orgStateName = orgSummary?.state ? stateName(orgSummary.state) : null;
  const parentEins = related.primaryEins;
  const siblingEins = related.eins.filter(
    (e) => e !== org.ein && !parentEins.includes(e)
  );
  // Only EINs that have their own FAC filing get a link — most component
  // EINs on a big system's audit don't and would 404.
  const einsWithPage = new Set(related.einsWithOwnRecord);
  const SIBLING_DISPLAY_CAP = 6;

  // Group findings by fiscal year
  const findingsByYear = new Map<string, Finding[]>();
  for (const finding of org.findings) {
    const year = finding.fiscalYearEnd;
    if (!findingsByYear.has(year)) {
      findingsByYear.set(year, []);
    }
    findingsByYear.get(year)!.push(finding);
  }

  // Every audit year on file, newest first — drives the per-year
  // sections below. NOT keyed off findings: an org can have a GOING
  // CONCERN, a qualified opinion, or LOW-RISK AUDITEE status in a year
  // with zero findings, and that risk strip still needs to render (bug
  // caught live on an org with a 2026 going-concern flag and no
  // findings — the whole section used to be gated on findingsByYear).
  const sortedAuditYears = [...org.auditHistory].sort((a, b) =>
    b.fiscalYearEnd.localeCompare(a.fiscalYearEnd)
  );

  // Headline federal-expenditure figure for the stat row — the most
  // recent audit year that actually reports one (older / GSA_MIGRATION
  // records can carry 0). null if none do.
  const latestExpenditure =
    sortedAuditYears.find((ay) => ay.totalAmountExpended > 0) ?? null;

  // Structured data for the thousands of near-identical org pages —
  // BreadcrumbList gives Google a sense of where each page sits, and
  // Organization makes the entity (name + EIN) explicit rather than
  // inferred from page text.
  const orgCanonicalUrl = `${SITE_URL}/single-audit/${org.ein}`;
  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Single Audit Intelligence', item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: org.name, item: orgCanonicalUrl },
    ],
  };
  const organizationJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: org.name,
    identifier: org.ein,
    url: orgCanonicalUrl,
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
      />
      {/* Header — no local Guide/Portfolio nav here; the site-wide sticky
          header (app/header.tsx) covers that. The "← Back to …" link
          stays: every other content page (/auditors, /portfolio, /guide,
          /about, …) has one above its h1, and when a visitor arrived via
          a portfolio it also carries them back to that specific list. */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
          <Suspense
            fallback={
              <Link href="/" className="text-blue-600 hover:text-blue-800 text-sm">
                ← Back to home
              </Link>
            }
          >
            <BackLink />
          </Suspense>
          <h1 className="text-3xl font-bold text-gray-900 mt-3 mb-2">
            {org.name}
            {/* Entity type — org.auditHistory is newest-first (see
                getReportsByEin's order param), so [0] is the most
                recent audit's classification. 'unknown' renders no
                badge (entityTypeLabel returns null) rather than
                showing a not-useful "Unknown" pill. */}
            {org.auditHistory[0] && entityTypeLabel(org.auditHistory[0].entityType) && (
              <span className="ml-3 align-middle text-xs font-semibold text-gray-500 bg-gray-100 border border-gray-200 rounded-full px-2.5 py-1">
                {entityTypeLabel(org.auditHistory[0].entityType)}
              </span>
            )}
          </h1>
          <div className="text-gray-600 space-y-1">
            <p>
              <span className="font-semibold">EIN:</span> {org.ein}
            </p>
            <p className="break-all">
              <span className="font-semibold">UEI:</span> {org.uei}
            </p>
            {/* Entity resolution — FAC's additional_eins table (Sprint
                5). A funder monitoring this subrecipient needs the full
                identifier set, since findings/awards can land under any
                of them. */}
            {parentEins.length > 0 && (
              <p className="text-sm">
                <span className="font-semibold">
                  Single Audit filed under EIN{parentEins.length === 1 ? '' : 's'}:
                </span>{' '}
                {parentEins.map((e, i) => (
                  <span key={e}>
                    {i > 0 && ', '}
                    <Link href={`/single-audit/${e}`} className="text-blue-600 hover:text-blue-800 underline">
                      {e}
                    </Link>
                  </span>
                ))}
              </p>
            )}
            {siblingEins.length > 0 &&
              (() => {
                const lead = parentEins.length > 0 ? 'That audit also covers' : 'Audit also covers';
                // Link an EIN only if it has its own FAC filing —
                // component EINs that only appear inside this audit have
                // no /single-audit page and would 404.
                const einLink = (e: string, i: number) => (
                  <span key={e}>
                    {i > 0 && ', '}
                    {einsWithPage.has(e) ? (
                      <Link
                        href={`/single-audit/${e}`}
                        className="text-blue-600 hover:text-blue-800 underline"
                      >
                        {e}
                      </Link>
                    ) : (
                      <span className="text-gray-500">{e}</span>
                    )}
                  </span>
                );
                // At/under the cap: one plain line. Over it: a native
                // <details> so every EIN stays reachable (and in the
                // server HTML for SEO) without dumping ~190 links inline
                // for a big health system.
                const anyUnlinked = siblingEins.some((e) => !einsWithPage.has(e));
                const note = anyUnlinked ? (
                  <span className="text-xs text-gray-400"> · unlinked EINs have no separate FAC filing</span>
                ) : null;

                if (siblingEins.length <= SIBLING_DISPLAY_CAP) {
                  return (
                    <p className="text-sm">
                      <span className="font-semibold">
                        {lead} {siblingEins.length === 1 ? 'EIN' : `${siblingEins.length} related EINs`}:
                      </span>{' '}
                      {siblingEins.map(einLink)}
                      {note}
                    </p>
                  );
                }
                return (
                  <details className="text-sm">
                    <summary className="cursor-pointer marker:text-gray-400">
                      <span className="font-semibold">
                        {lead} {siblingEins.length} related EINs
                      </span>{' '}
                      <span className="text-blue-600">— show all</span>
                    </summary>
                    <p className="mt-1 break-all leading-relaxed">
                      {siblingEins.map(einLink)}
                      {note}
                    </p>
                  </details>
                );
              })()}
            {/* Auditor + cognizance — from the most recent audit year
                only (a page-header summary, not a per-year fact; see
                the per-year risk strip below findings for anything that
                can genuinely differ year to year). An entity has either
                a cognizant OR an oversight agency, never both —
                confirmed live, one of the two is consistently empty. */}
            {org.auditHistory[0]?.auditorFirmName && (
              <p className="text-sm">
                <span className="font-semibold">Audited by:</span>{' '}
                {org.auditHistory[0].auditorEin &&
                /^\d{9}$/.test(org.auditHistory[0].auditorEin) &&
                org.auditHistory[0].auditorEin !== '999999999' ? (
                  <Link
                    href={`/auditors/${org.auditHistory[0].auditorEin}`}
                    className="text-blue-600 hover:text-blue-800 underline"
                  >
                    {org.auditHistory[0].auditorFirmName}
                  </Link>
                ) : (
                  org.auditHistory[0].auditorFirmName
                )}
              </p>
            )}
            {org.auditHistory[0]?.cognizantAgency && (
              <p className="text-sm">
                <span className="font-semibold">Cognizant agency:</span>{' '}
                {agencyPrefixLabel(org.auditHistory[0].cognizantAgency)}
              </p>
            )}
            {!org.auditHistory[0]?.cognizantAgency && org.auditHistory[0]?.oversightAgency && (
              <p className="text-sm">
                <span className="font-semibold">Oversight agency:</span>{' '}
                {agencyPrefixLabel(org.auditHistory[0].oversightAgency)}
              </p>
            )}
            <p className="pt-1">
              <Suspense
                fallback={
                  <Link
                    href={`/single-audit/${org.ein}/risk-assessment`}
                    className="inline-block text-sm text-blue-600 hover:text-blue-800 font-semibold"
                    rel="nofollow"
                  >
                    View federal awards &amp; risk assessment →
                  </Link>
                }
              >
                <RiskAssessmentLink
                  ein={org.ein}
                  className="inline-block text-sm text-blue-600 hover:text-blue-800 font-semibold"
                />
              </Suspense>
            </p>
            {org.stale ? (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 inline-block">
                Showing data from{' '}
                {org.syncedAt.toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}{' '}
                — the Federal Audit Clearinghouse is under high demand right now, so this couldn't
                be refreshed. This is the most recent data on record, not necessarily today's.
              </p>
            ) : (
              <p className="text-xs text-gray-400">
                Data as of{' '}
                {org.syncedAt.toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Sticky summary bar — org name + the same three counts below,
          condensed to one line, visible while scrolling through a long
          findings list. Pure CSS sticky, no JS needed. Hidden in print —
          it's a scroll aid, meaningless on paper. top-16 (not top-0)
          sits it just below the site-wide sticky header (app/header.tsx,
          h-16) instead of underneath it. */}
      {org.findingsCount > 0 && (
        <div className="no-print sticky top-16 z-10 bg-surface border-b border-border">
          <div className="max-w-4xl mx-auto px-4 py-2 sm:px-6 lg:px-8 flex items-center gap-4 text-sm overflow-x-auto">
            <span className="font-semibold text-text whitespace-nowrap">{org.name}</span>
            <span className="text-muted whitespace-nowrap">{org.totalReports} audit years</span>
            <span className="text-muted whitespace-nowrap">{org.findingsCount} findings</span>
            {org.repeatFindingsCount > 0 && (
              <span className="text-severity-warning font-semibold whitespace-nowrap">
                {org.repeatFindingsCount} repeat
              </span>
            )}
          </div>
        </div>
      )}

      {/* Summary stats */}
      <div className="max-w-4xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="bg-white p-4 rounded-lg border border-gray-200">
            <div className="text-2xl font-bold text-gray-900">{org.totalReports}</div>
            <div className="text-sm text-gray-600">Audit Years</div>
          </div>
          <div className="bg-white p-4 rounded-lg border border-gray-200">
            <div className="text-2xl font-bold text-gray-900">{org.findingsCount}</div>
            <div className="text-sm text-gray-600">Total Findings</div>
          </div>
          <div className="bg-white p-4 rounded-lg border border-gray-200">
            <div className="text-2xl font-bold text-red-600">{org.repeatFindingsCount}</div>
            <div className="text-sm text-gray-600">Repeat Findings</div>
          </div>
          <div className="bg-white p-4 rounded-lg border border-gray-200">
            <div className="text-2xl font-bold text-gray-900">
              {latestExpenditure
                ? `$${latestExpenditure.totalAmountExpended.toLocaleString('en-US', {
                    notation: 'compact',
                    maximumFractionDigits: 1,
                  })}`
                : '—'}
            </div>
            <div className="text-sm text-gray-600">
              Federal Awards Expended
              {latestExpenditure ? ` (FY ${latestExpenditure.fiscalYearEnd.slice(0, 4)})` : ''}
            </div>
          </div>
        </div>

        {/* No findings case — describes the FAC record, not the
            organization. Previously asserted "had no findings" (a claim
            about the world the FAC record can't support — the org may
            not have been required to file, a filing could be late/
            missing/incomplete, or findings could exist under a
            different EIN after a rename/merger) and editorialized with
            "this is a positive indicator" — a compliance opinion about
            a named, real organization. Ground rule: describe the
            records, not the world. */}
        {org.findingsCount === 0 ? (
          <div className="bg-green-50 border border-green-200 rounded-lg p-6 mb-8">
            <h2 className="text-lg font-semibold text-green-900 mb-2">No findings recorded</h2>
            <p className="text-green-800">
              The Federal Audit Clearinghouse has no findings recorded across the{' '}
              {org.totalReports} audit{org.totalReports === 1 ? '' : 's'} on file for this EIN.
              Absence of a recorded finding is not confirmation that an audit was performed, or
              that one was required.{' '}
              <a
                href={`https://app.fac.gov/dissemination/search/?query={"_search_term":"${org.ein}"}`}
                target="_blank"
                rel="noopener noreferrer"
                className="underline font-semibold hover:text-green-900"
              >
                Verify at fac.gov →
              </a>
            </p>
          </div>
        ) : null}

        {/* Year jump-links — seven fiscal years shouldn't require
            scrolling. Shown for any org with more than one audit year,
            findings or not. */}
        {sortedAuditYears.length > 1 && (
          <div className="no-print flex flex-wrap gap-2 mb-4">
            {sortedAuditYears.map((ay) => (
              <a
                key={ay.fiscalYearEnd}
                href={`#fy-${ay.fiscalYearEnd}`}
                className="text-xs font-semibold text-accent border border-border rounded-full px-3 py-1.5 hover:border-accent"
              >
                FY {ay.fiscalYearEnd}
              </a>
            ))}
          </div>
        )}

        {/* Severity filter — only worth the chrome past ~5 findings. */}
        {org.findingsCount > 5 && <SeverityFilter />}

        {/* Deep-link support: arriving with a hash matching a finding's
            id (set in finding-card.tsx) opens that finding and scrolls
            to it — see hash-expand.tsx. */}
        {org.findingsCount > 0 && <HashExpand />}
        <div id="findings-list" className="space-y-8">
          {sortedAuditYears.map((auditYear, index) => {
            const findings = findingsByYear.get(auditYear.fiscalYearEnd) || [];
            const gaap = parseGaapResults(auditYear.gaapResultsRaw);
            return (
              <div key={auditYear.reportId} id={`fy-${auditYear.fiscalYearEnd}`} className="scroll-mt-20">
                <h2 className="text-xl font-bold text-gray-900 mb-4">FY {auditYear.fiscalYearEnd}</h2>

                {/* Risk strip — one line of badges per audit year,
                    sourced from the `general` table row (no new FAC
                    calls). Renders for every audit year, not just years
                    with findings. Suppressed per-badge when the field is
                    missing/empty rather than rendering a broken pill —
                    legacy GSA_MIGRATION-era records can lack these. */}
                <div className="no-print flex flex-wrap items-center gap-2 mb-4">
                  {gaap?.worst && gaap.worst !== 'unmodified_opinion' && (
                    <span
                      className={`inline-block text-xs font-bold px-2 py-1 rounded border ${
                        gaap.worst === 'qualified_opinion'
                          ? 'bg-severity-warning/10 text-severity-warning border-severity-warning/30'
                          : gaap.worst === 'not_gaap'
                            ? 'bg-severity-neutral/10 text-severity-neutral border-severity-neutral/30'
                            : 'bg-severity-critical/10 text-severity-critical border-severity-critical/30'
                      }`}
                    >
                      {gaap.labels.join(', ').toUpperCase()}
                    </span>
                  )}
                  {auditYear.isGoingConcern && (
                    <span className="inline-block bg-severity-critical/10 text-severity-critical border border-severity-critical/30 text-xs font-bold px-2 py-1 rounded">
                      GOING CONCERN
                    </span>
                  )}
                  {auditYear.isMaterialNoncomplianceDisclosed && (
                    <span className="inline-block bg-severity-critical/10 text-severity-critical border border-severity-critical/30 text-xs font-bold px-2 py-1 rounded">
                      MATERIAL NONCOMPLIANCE DISCLOSED
                    </span>
                  )}
                  {auditYear.isLowRiskAuditee && (
                    <span className="inline-block bg-green-50 text-green-700 border border-green-200 text-xs font-bold px-2 py-1 rounded">
                      LOW-RISK AUDITEE
                    </span>
                  )}
                  {auditYear.totalAmountExpended > 0 && (
                    <span className="text-xs text-muted font-semibold">
                      $
                      {auditYear.totalAmountExpended.toLocaleString('en-US', {
                        maximumFractionDigits: 0,
                      })}{' '}
                      federal awards expended
                    </span>
                  )}
                  {findings.length === 0 && (
                    <span className="text-xs text-muted">No findings recorded this year</span>
                  )}
                </div>

                {/* Only the most recent fiscal year gets the full
                    alert-style card — an org with many years otherwise
                    gets the same "past due" block once per year, which
                    reads as a pile-on. See the variant doc-comment in
                    management-decision-block.tsx. */}
                <ManagementDecisionBlock
                  facAcceptedDate={auditYear.facAcceptedDate}
                  variant={index === 0 ? 'full' : 'plain'}
                />
                <div className="space-y-4">
                  {findings.map((finding) => (
                    <FindingCard key={`${finding.reportId}-${finding.facFindingId}`} finding={finding} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Verify disclaimer */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 my-8">
          <p className="text-sm text-blue-900">
            <strong>Data source:</strong> This information comes from the{' '}
            <a
              href="https://app.fac.gov/dissemination/search/"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold hover:text-blue-700"
            >
              Federal Audit Clearinghouse
            </a>
            , the official repository of Single Audit data. All data is public domain.{' '}
            <a
              href={`https://app.fac.gov/dissemination/search/?query={"_search_term":"${org.ein}"}`}
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold hover:text-blue-700"
            >
              Verify this organization's audit history at fac.gov
            </a>
            .
          </p>
        </div>

        {orgStateName && orgSummary?.state && (
          <p className="text-sm text-gray-600 mb-8">
            <Link
              href={`/single-audit/state/${orgSummary.state.toLowerCase()}`}
              className="text-blue-600 hover:text-blue-800 font-semibold"
            >
              Browse other Single Audit organizations in {orgStateName} →
            </Link>
          </p>
        )}

        {/* CTAs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
          <div className="bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-300 rounded-lg p-6">
            <h3 className="text-lg font-bold text-blue-900 mb-2">
              Are you this organization?
            </h3>
            <p className="text-sm text-blue-800 mb-4">
              Track your findings and corrective action plans across audit cycles.
            </p>
            {/* Routes through /auth/signin (which carries ?ein= through
                to /dashboard either way it's resolved — see that page)
                rather than straight into a guest workspace. Previously
                this skipped sign-in entirely on the reasoning that
                someone confirming they ARE this organization is a
                qualified early user worth zero friction; reversed on
                direct request so sign-in is the visible, offered choice
                here rather than bypassed by default. Guest mode is still
                one click away from /auth/signin, not removed — just no
                longer the silent default from this specific CTA. */}
            <a
              href={`/auth/signin?ein=${org.ein}`}
              className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-semibold px-4 py-2 rounded"
            >
              Start tracking findings →
            </a>
          </div>

          <div className="bg-gradient-to-br from-green-50 to-green-100 border border-green-300 rounded-lg p-6">
            <h3 className="text-lg font-bold text-green-900 mb-2">
              Do you fund this organization?
            </h3>
            <p className="text-sm text-green-800 mb-4">
              Monitor subrecipient audit findings and filing records.
            </p>
            {/* /portfolio, not sign-in — monitoring a subrecipient you
                fund isn't "your org" (the dashboard is one org per
                account), and /portfolio needs no account at all. */}
            <a
              href={`/portfolio?eins=${org.ein}`}
              className="inline-block bg-green-600 hover:bg-green-700 text-white font-semibold px-4 py-2 rounded"
            >
              Start monitoring →
            </a>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}
