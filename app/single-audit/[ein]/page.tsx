import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Metadata } from 'next';
import { getPublicOrg } from '@/lib/public-org-cache';
import { getRelatedIdentifiers } from '@/lib/entity-resolution';
import { agencyPrefixLabel, entityTypeLabel, isYesNo, parseGaapResults } from '@/lib/fac-api';
import { SITE_URL } from '@/lib/site-url';
import { ManagementDecisionBlock } from '@/app/management-decision-block';
import { Footer } from '@/app/footer';
import { FindingCard } from './finding-card';
import { HashExpand } from './hash-expand';
import { SeverityFilter } from './severity-filter';

// FAC data changes at most daily; re-fetch each page hourly.
export const revalidate = 3600;

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
async function fetchOrgData(ein: string): Promise<OrgFetchResult> {
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
}

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
  const description = `Audit history and findings for ${org.name} (EIN: ${org.ein}). ${org.findingsCount} findings across ${org.totalReports} audits.`;
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
      // Defining an openGraph object here suppresses Next's automatic
      // file-convention fallback to app/opengraph-image.png for just this
      // route — without an explicit images entry, org pages shared a
      // shared link with no image at all and twitter:card silently fell
      // back to "summary". This is the static-image floor, not a
      // per-org image; see REVISED_FINAL_PASS.md Task 3 for why a
      // per-org dynamic image (org name/EIN/findings count) is a
      // separate, larger follow-up rather than being built here.
      images: [{ url: `${SITE_URL}/opengraph-image.png`, width: 1200, height: 630 }],
    },
  };
}

export default async function SingleAuditPage(props: {
  params: Promise<{ ein: string }>;
  searchParams: Promise<{ from?: string; eins?: string }>;
}) {
  const params = await props.params;
  const searchParams = await props.searchParams;
  // Set only when arriving via a "View →" link from /portfolio (see
  // app/portfolio/portfolio-table.tsx) — restores that exact portfolio
  // view rather than a blank /portfolio form. Absent on every other
  // entry path (direct link, search, sitemap/crawler), so the "back to
  // home" logic below stays the sole nav in the common case, same
  // reasoning as removing the old duplicate site-wide nav here.
  const backToPortfolioHref =
    searchParams.from === 'portfolio' && searchParams.eins
      ? `/portfolio?eins=${encodeURIComponent(searchParams.eins)}`
      : null;
  // Carry the portfolio context onward to the risk-assessment page so
  // ITS "back" link can return here with the same params, not to a
  // bare /single-audit/[ein] that's lost the portfolio trail.
  const riskAssessmentHref =
    searchParams.from === 'portfolio' && searchParams.eins
      ? `/single-audit/${params.ein}/risk-assessment?from=portfolio&eins=${encodeURIComponent(searchParams.eins)}`
      : `/single-audit/${params.ein}/risk-assessment`;
  const result = await fetchOrgData(params.ein);

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
          <Link
            href={backToPortfolioHref ?? '/'}
            className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-semibold px-5 py-2.5 rounded-lg"
          >
            {backToPortfolioHref ? 'Back to portfolio' : 'Back to home'}
          </Link>
        </div>
      </div>
    );
  }

  const org = result.org;

  // Sprint 5 — entity resolution off the mirror (0 FAC calls; degrades
  // to nothing if the additional_eins table isn't synced yet).
  //   parentEins  — this EIN is a component rolled into another entity's
  //                 audit; those are the filings that actually cover it.
  //   siblingEins — other EINs this same audit covers (can be hundreds
  //                 for a big health system — capped in the UI).
  const related = await getRelatedIdentifiers(org.ein);
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

  const sortedYears = Array.from(findingsByYear.keys()).sort().reverse();

  // The management-decision clock is per audit REPORT, not per finding —
  // every finding in one FY group came from the same report_id in the
  // overwhelming common case (only a resubmission could split one FY
  // across two reports, an edge case not worth restructuring the
  // existing year-based grouping for). Look up each group's accepted
  // date from its first finding's reportId.
  const acceptedDateByReport = new Map(
    org.auditHistory.map((ay) => [ay.reportId, ay.facAcceptedDate])
  );

  // Same per-report lookup, full AuditYear this time — backs the
  // per-year risk strip below (opinion, going concern, low-risk
  // auditee, material noncompliance, total expended).
  const auditYearByReport = new Map(org.auditHistory.map((ay) => [ay.reportId, ay]));

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
      {/* Header — no local "back home"/Guide/Portfolio nav here anymore;
          the site-wide sticky header (app/header.tsx, mounted in
          app/layout.tsx) already covers all three via the logo link and
          its own Guide/Portfolio nav. This block used to duplicate them
          from before that header existed. */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
          {backToPortfolioHref && (
            <Link
              href={backToPortfolioHref}
              className="inline-block text-sm text-blue-600 hover:text-blue-800 font-semibold mb-3"
            >
              ← Back to portfolio
            </Link>
          )}
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
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
                {org.auditHistory[0].auditorFirmName}
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
              <Link
                href={riskAssessmentHref}
                className="inline-block text-sm text-blue-600 hover:text-blue-800 font-semibold"
              >
                View federal awards &amp; risk assessment →
              </Link>
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
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
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
            scrolling past six to reach the seventh. Only worth showing
            with more than one year. */}
        {sortedYears.length > 1 && org.findingsCount > 0 && (
          <div className="no-print flex flex-wrap gap-2 mb-4">
            {sortedYears.map((year) => (
              <a
                key={year}
                href={`#fy-${year}`}
                className="text-xs font-semibold text-accent border border-border rounded-full px-3 py-1.5 hover:border-accent"
              >
                FY {year}
              </a>
            ))}
          </div>
        )}

        {/* Severity filter — only worth the chrome past ~5 findings. */}
        {org.findingsCount > 5 && <SeverityFilter />}

        {/* Findings by year. Deep-link support: arriving with a hash
            matching a finding's id (set in finding-card.tsx) opens that
            finding and scrolls to it — see hash-expand.tsx. */}
        {org.findingsCount > 0 && <HashExpand />}
        <div id="findings-list" className="space-y-8">
          {sortedYears.map((year, index) => {
            const findings = findingsByYear.get(year) || [];
            const reportId = findings[0]?.reportId;
            const facAcceptedDate = reportId ? acceptedDateByReport.get(reportId) ?? null : null;
            const auditYear = reportId ? auditYearByReport.get(reportId) : undefined;
            const gaap = auditYear ? parseGaapResults(auditYear.gaapResultsRaw) : null;
            return (
              <div key={year} id={`fy-${year}`} className="scroll-mt-20">
                <h2 className="text-xl font-bold text-gray-900 mb-4">FY {year}</h2>

                {/* Risk strip — one line of badges per audit year,
                    sourced from the `general` table row already fetched
                    for this report (no new FAC calls). Suppressed per-
                    badge when the underlying field is missing/empty
                    rather than rendering a broken pill — legacy
                    GSA_MIGRATION-era records can lack these. */}
                {auditYear && (
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
                  </div>
                )}

                {/* Only the most recent fiscal year (sortedYears is
                    descending) gets the full alert-style card — an org
                    with many years otherwise gets the same "past due"
                    block repeated once per year, which reads as a
                    pile-on. See the variant doc-comment in
                    management-decision-block.tsx. */}
                <ManagementDecisionBlock
                  facAcceptedDate={facAcceptedDate}
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
