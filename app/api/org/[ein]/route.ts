import { importOrgByEin } from '@/lib/fac-api';
import { NextResponse } from 'next/server';

// Same 4-FAC-calls-per-request shape as app/single-audit/[ein]/page.tsx —
// see the comment there for why this needs more than the default timeout.
export const maxDuration = 30;

/**
 * Public API endpoint: GET /api/org/[ein]
 *
 * Returns an organization's complete audit history from the FAC.
 * No authentication required. Kept for external/JSON consumers — the
 * public `/single-audit/[ein]` page calls importOrgByEin() directly rather
 * than fetching this route (a server component fetching its own relative
 * URL breaks on Vercel; see the comment on fetchOrgData in that file).
 *
 * Response includes:
 * - org name, EIN, UEI
 * - audit history (reports by fiscal year)
 * - all findings with CAP narratives
 * - repeat-finding flags
 * - federal expenditures by year
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

    // Fetch from FAC
    const org = await importOrgByEin(ein);

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
