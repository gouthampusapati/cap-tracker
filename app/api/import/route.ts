import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { eq } from 'drizzle-orm';
import { getPublicOrg } from '@/lib/public-org-cache';
import { db } from '@/lib/db';
import { users, auditYears, findings } from '@/lib/db/schema';
import { authorizeEmailAccess } from '@/lib/auth-guard';

/**
 * POST /api/import
 * Body: { ein, email }
 *
 * Pulls the organization's full Single Audit history from the Federal
 * Audit Clearinghouse and stores every finding. Re-running is safe:
 * findings use a stable id derived from report_id + reference_number, so
 * a re-import updates rows in place and CAP items stay attached.
 *
 * Goes through getPublicOrg() (the same shared cache/budget path
 * /single-audit/[ein] and /portfolio use) rather than calling
 * importOrgByEin() directly, which this route used to do — that bypassed
 * both the 24h org cache AND the site-wide FAC budget guard entirely, a
 * real gap: every import, including a user re-submitting the same EIN
 * moments apart, spent 4 live FAC calls with zero throttling. See
 * FAC_API_Improvement_Sprint_Checklist.md, Sprint 1.
 */
export async function POST(req: NextRequest) {
  try {
    const { ein, email } = await req.json();

    if (!ein || !email) {
      return NextResponse.json(
        { error: 'EIN and email required' },
        { status: 400 }
      );
    }

    // Checked before the FAC fetch below (not after) — no reason to
    // spend shared FAC quota on a request that's getting rejected anyway.
    const authorized = await authorizeEmailAccess(email);
    if ('response' in authorized) return authorized.response;

    if (!process.env.FAC_API_KEY) {
      return NextResponse.json(
        {
          error:
            'FAC_API_KEY is not configured. Get a free key at https://api.data.gov/signup and add it to .env.local',
        },
        { status: 500 }
      );
    }

    const { org, unavailable } = await getPublicOrg(ein);

    if (unavailable) {
      // Never checked before, and the shared FAC budget is fully spent
      // for the hour — not evidence the org has no audit history, just
      // that nobody (including this request) could check right now. See
      // OrgLookupResult's own comment in lib/public-org-cache.ts.
      return NextResponse.json(
        {
          error:
            'The FAC lookup service is at its shared hourly limit right now — please try importing again in a little while.',
        },
        { status: 503 }
      );
    }

    if (!org) {
      return NextResponse.json(
        {
          error: `No Single Audit submissions found in the FAC for EIN ${ein}.`,
          findingsCount: 0,
        },
        { status: 404 }
      );
    }

    // Get or create the user, and attach the org details we just learned.
    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    let userId: string;
    if (existing) {
      userId = existing.id;
      await db.update(users).set({ ein, orgName: org.name }).where(eq(users.id, userId));
    } else {
      userId = randomUUID();
      await db.insert(users).values({ id: userId, email, ein, orgName: org.name, createdAt: new Date() });
    }

    const now = new Date();

    await db.transaction(async (tx) => {
      // One audit_years row per FAC report, keyed on report_id so a
      // re-import replaces rather than duplicates.
      for (const report of org.reports) {
        const values = {
          id: `ay_${report.report_id}`,
          userId,
          ein,
          fiscalYearEnd: report.fy_end_date,
          facReportId: report.report_id,
          rawFacData: JSON.stringify(report),
          createdAt: now,
        };
        await tx
          .insert(auditYears)
          .values(values)
          .onConflictDoUpdate({ target: auditYears.id, set: values });
      }

      for (const f of org.findings) {
        const values = {
          id: `${f.reportId}::${f.facFindingId}`,
          auditYearId: `ay_${f.reportId}`,
          facFindingId: f.facFindingId,
          facReportId: f.reportId,
          category: f.category,
          description: f.description,
          plannedAction: f.plannedAction,
          // FAC only exposes a Y/N flag, not an amount. Store null rather
          // than inventing a number; the UI shows a flag instead.
          questionedCosts: null,
          isRepeatFinding: f.isRepeatFinding,
          priorFindingRefs: JSON.stringify(f.priorRefs),
          createdAt: now,
        };
        await tx
          .insert(findings)
          .values(values)
          .onConflictDoUpdate({ target: findings.id, set: values });
      }
    });

    return NextResponse.json({
      success: true,
      orgName: org.name,
      uei: org.uei,
      auditYears: org.reports.length,
      findingsCount: org.findings.length,
      repeatFindings: org.findings.filter((f) => f.isRepeatFinding).length,
    });
  } catch (error) {
    console.error('Import error:', error);
    return NextResponse.json(
      { error: 'Import failed', details: String(error) },
      { status: 500 }
    );
  }
}
