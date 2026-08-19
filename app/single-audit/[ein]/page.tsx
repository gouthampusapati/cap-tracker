import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Metadata } from 'next';
import { importOrgByEin } from '@/lib/fac-api';
import { SITE_URL } from '@/lib/site-url';
import { ManagementDecisionBlock } from '@/app/management-decision-block';
import { getRequirementLink } from '@/lib/compliance-requirements';
import { TrackedLink } from '@/app/tracked-link';
import { EVENT_ORG_PAGE_CLICKTHROUGH } from '@/lib/analytics-events';

// FAC data changes at most daily; re-fetch each page hourly.
export const revalidate = 3600;

// Each render does 4 FAC calls (1 sequential + 3 parallel — see
// lib/fac-api.ts). Default Vercel function timeouts (10s Hobby / 15s Pro)
// leave little room for FAC latency on a big org; give it more headroom
// while staying under the Hobby plan's 60s ceiling so this works on any tier.
export const maxDuration = 30;

interface Finding {
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
}

const categoryColors: Record<string, string> = {
  'Cost Allowability': 'bg-red-50 border-red-200 text-red-900',
  'Subrecipient Monitoring': 'bg-orange-50 border-orange-200 text-orange-900',
  Procurement: 'bg-yellow-50 border-yellow-200 text-yellow-900',
  'Cash Management': 'bg-blue-50 border-blue-200 text-blue-900',
  Reporting: 'bg-purple-50 border-purple-200 text-purple-900',
  Other: 'bg-gray-50 border-gray-200 text-gray-900',
};

function getCategoryColor(category: string): string {
  // Try exact match first
  if (categoryColors[category]) return categoryColors[category];

  // Try partial match (for multi-category findings)
  for (const [key, color] of Object.entries(categoryColors)) {
    if (category.includes(key)) return color;
  }

  return categoryColors.Other;
}


/**
 * Fetch straight from the FAC library — no self-referential HTTP call.
 *
 * A server component that fetches its own /api route needs an absolute URL,
 * which breaks on Vercel when the deployment URL isn't known at build time.
 * Calling the library directly is also one less network round trip.
 * The /api/org/[ein] route still exists for external/JSON consumers.
 *
 * IMPORTANT: this does NOT catch fetch failures (a FAC outage, a rate
 * limit, a network error) — those propagate as thrown errors, caught by
 * error.tsx in this route segment. Only two things return null here: a
 * malformed EIN, and importOrgByEin() itself returning null because FAC
 * genuinely has zero reports for a well-formed EIN. Both of those are
 * real "not found" — a transient fetch failure is not, and treating it
 * the same way used to make notFound() fire for reasons that have
 * nothing to do with whether the organization exists, telling a visitor
 * "not found" when the truth was "FAC didn't answer this time."
 */
async function fetchOrgData(ein: string): Promise<OrgData | null> {
  if (!/^\d{9}$/.test(ein)) return null;

  const org = await importOrgByEin(ein);
  if (!org) return null;

  return {
    ein: org.ein,
    uei: org.uei,
    name: org.name,
    auditHistory: org.reports.map((r) => ({
      reportId: r.report_id,
      fiscalYearEnd: r.fy_end_date,
      fiscalYearStart: r.fy_start_date,
      totalAmountExpended: r.total_amount_expended,
      entityType: r.entity_type,
      isLowRiskAuditee: r.is_low_risk_auditee === 'Y',
      facAcceptedDate: r.fac_accepted_date,
    })),
    findings: org.findings,
    totalReports: org.reports.length,
    findingsCount: org.findings.length,
    repeatFindingsCount: org.findings.filter((f) => f.isRepeatFinding).length,
  };
}

export async function generateMetadata(props: {
  params: Promise<{ ein: string }>;
}): Promise<Metadata> {
  const params = await props.params;

  let org: OrgData | null;
  try {
    org = await fetchOrgData(params.ein);
  } catch {
    // Metadata has to return *something* even when the underlying fetch
    // failed — this deliberately doesn't say "not found," since a fetch
    // failure says nothing about whether the org actually exists.
    return {
      title: 'Temporarily Unavailable',
      description: 'This page could not be loaded right now. Try again shortly.',
    };
  }

  if (!org) {
    return {
      title: 'Organization Not Found',
      description: 'This organization was not found in the Federal Audit Clearinghouse.',
    };
  }

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
    },
  };
}

export default async function SingleAuditPage(props: { params: Promise<{ ein: string }> }) {
  const params = await props.params;
  const org = await fetchOrgData(params.ein);

  if (!org) {
    notFound();
  }

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

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
          <div className="mb-4 flex justify-between items-center">
            <Link href="/" className="text-blue-600 hover:text-blue-800 text-sm">
              ← Back to home
            </Link>
            <div className="space-x-4">
              <TrackedLink
                href="/guide"
                event={EVENT_ORG_PAGE_CLICKTHROUGH}
                eventData={{ destination: 'guide', source: 'header' }}
                className="text-blue-600 hover:text-blue-800 text-sm font-semibold"
              >
                Compliance guide
              </TrackedLink>
              <TrackedLink
                href="/portfolio"
                event={EVENT_ORG_PAGE_CLICKTHROUGH}
                eventData={{ destination: 'portfolio', source: 'header' }}
                className="text-blue-600 hover:text-blue-800 text-sm font-semibold"
              >
                Portfolio
              </TrackedLink>
            </div>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">{org.name}</h1>
          <div className="text-gray-600 space-y-1">
            <p>
              <span className="font-semibold">EIN:</span> {org.ein}
            </p>
            <p>
              <span className="font-semibold">UEI:</span> {org.uei}
            </p>
          </div>
        </div>
      </div>

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

        {/* No findings case */}
        {org.findingsCount === 0 ? (
          <div className="bg-green-50 border border-green-200 rounded-lg p-6 mb-8">
            <h2 className="text-lg font-semibold text-green-900 mb-2">No audit findings</h2>
            <p className="text-green-800">
              This organization had no findings in its most recent Single Audits. This is a
              positive indicator.
            </p>
          </div>
        ) : null}

        {/* Findings by year */}
        <div className="space-y-8">
          {sortedYears.map((year) => {
            const findings = findingsByYear.get(year) || [];
            const reportId = findings[0]?.reportId;
            const facAcceptedDate = reportId ? acceptedDateByReport.get(reportId) ?? null : null;
            return (
              <div key={year}>
                <h2 className="text-xl font-bold text-gray-900 mb-4">FY {year}</h2>
                <ManagementDecisionBlock facAcceptedDate={facAcceptedDate} />
                <div className="space-y-4">
                  {findings.map((finding) => (
                    <div
                      key={`${finding.reportId}-${finding.facFindingId}`}
                      className={`border rounded-lg p-4 ${getCategoryColor(finding.category)}`}
                    >
                      {/* Finding header */}
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <div className="text-sm font-mono font-semibold">
                            {finding.facFindingId}
                          </div>
                          <div className="text-sm font-semibold mt-1">{finding.category}</div>
                        </div>
                        <div className="flex gap-2">
                          {finding.isRepeatFinding && (
                            <span className="inline-block bg-red-200 text-red-800 text-xs font-bold px-2 py-1 rounded">
                              REPEAT
                            </span>
                          )}
                          {finding.isMaterialWeakness && (
                            <span className="inline-block bg-red-200 text-red-800 text-xs font-bold px-2 py-1 rounded">
                              MATERIAL WEAKNESS
                            </span>
                          )}
                          {finding.hasQuestionedCosts && (
                            <span className="inline-block bg-yellow-200 text-yellow-800 text-xs font-bold px-2 py-1 rounded">
                              QUESTIONED COSTS
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Finding description */}
                      {finding.description && (
                        <div className="mb-3">
                          <div className="text-xs font-semibold uppercase opacity-70 mb-1">
                            Condition
                          </div>
                          <p className="text-sm line-clamp-3">{finding.description}</p>
                        </div>
                      )}

                      {/* CAP */}
                      {finding.plannedAction && (
                        <div className="mb-3">
                          <div className="text-xs font-semibold uppercase opacity-70 mb-1">
                            Corrective Action Plan
                          </div>
                          <p className="text-sm line-clamp-3">{finding.plannedAction}</p>
                        </div>
                      )}

                      {/* Prior refs */}
                      {finding.priorRefs.length > 0 && (
                        <div className="mb-3">
                          <div className="text-xs font-semibold uppercase opacity-70 mb-1">
                            Prior Finding References
                          </div>
                          <p className="text-sm">{finding.priorRefs.join(', ')}</p>
                        </div>
                      )}

                      {/* Requirement link — every finding links to its
                          type_requirement letter's explanation, not just
                          Subrecipient Monitoring findings. */}
                      {(() => {
                        const link = getRequirementLink(finding.typeRequirement);
                        return link ? (
                          <TrackedLink
                            href={link.href}
                            event={EVENT_ORG_PAGE_CLICKTHROUGH}
                            eventData={{ destination: 'guide', source: 'finding' }}
                            className="text-sm underline font-semibold opacity-80 hover:opacity-100"
                          >
                            {link.label}
                          </TrackedLink>
                        ) : null;
                      })()}
                    </div>
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
            <a
              href="/auth/signin"
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
              Monitor subrecipient audit findings and compliance status.
            </p>
            <a
              href="/auth/signin"
              className="inline-block bg-green-600 hover:bg-green-700 text-white font-semibold px-4 py-2 rounded"
            >
              Start monitoring →
            </a>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="bg-gray-100 border-t border-gray-200 py-6 mt-8">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-xs text-gray-600">
            Single Audit Intelligence is an independent tool powered by Federal Audit
            Clearinghouse data. Not affiliated with GSA, OMB, or any federal agency.
          </p>
        </div>
      </div>
    </div>
  );
}
