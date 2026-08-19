import { getPublicOrg } from '@/lib/public-org-cache';
import { NextResponse } from 'next/server';

// Same 4-FAC-calls-per-request shape as app/single-audit/[ein]/page.tsx on
// a cache miss — see the comment there for why this needs more than the
// default timeout. A cache hit returns almost immediately.
export const maxDuration = 30;

/**
 * Public API endpoint: GET /api/org/[ein]
 *
 * Returns an organization's complete audit history from the FAC.
 * No authentication required. Kept for external/JSON consumers. Reads
 * through the same shared cache as `/single-audit/[ein]` and
 * `/portfolio` (lib/public-org-cache.ts) — an EIN looked up through any
 * of the three warms the cache for all of them.
 *
 * Response includes:
 * - org name, EIN, UEI
 * - audit history (reports by fiscal year)
 * - all findings with CAP narratives
 * - repeat-finding flags
 * - federal expenditures by year
 * - syncedAt: when this data was last pulled from the FAC (not necessarily
 *   this request — could be served from cache)
 */

export async function GET(
  request: Request,
  props: { params: Promise<{ ein: string }> }
) {
  const params = await props.params;
  const ein = params.ein.trim();

  try {

    // Validate EIN format (9 digits)
    if (!/^\d{9}$/.test(ein)) {
      return NextResponse.json(
        { error: 'Invalid EIN format. Must be 9 digits.' },
        { status: 400 }
      );
    }

    const { org, syncedAt } = await getPublicOrg(ein);

    if (!org) {
      return NextResponse.json(
        { error: 'Organization not found in Federal Audit Clearinghouse.' },
        { status: 404 }
      );
    }

    // Shape response for client
    const auditHistory = org.reports.map((r) => ({
      reportId: r.report_id,
      fiscalYearEnd: r.fy_end_date,
      fiscalYearStart: r.fy_start_date,
      totalAmountExpended: r.total_amount_expended,
      entityType: r.entity_type,
      isLowRiskAuditee: r.is_low_risk_auditee === 'Y',
    }));

    return NextResponse.json(
      {
        ein: org.ein,
        uei: org.uei,
        name: org.name,
        auditHistory,
        findings: org.findings,
        totalReports: org.reports.length,
        findingsCount: org.findings.length,
        repeatFindingsCount: org.findings.filter((f) => f.isRepeatFinding).length,
        syncedAt: syncedAt.toISOString(),
      },
      {
        headers: {
          'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[org/${ein}] Error:`, message);

    return NextResponse.json(
      {
        error: 'Failed to fetch organization data.',
        details: message,
      },
      { status: 500 }
    );
  }
}
