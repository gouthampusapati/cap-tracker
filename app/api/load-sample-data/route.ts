import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { eq } from 'drizzle-orm';
import { mockFindings } from '@/lib/fac-mock-data';
import { db } from '@/lib/db';
import { users, auditYears, findings } from '@/lib/db/schema';

/**
 * Load sample FAC data for testing
 * POST /api/load-sample-data
 * Body: { ein: string, email: string }
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

    // Get or create user
    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    let userId: string;
    if (!existing) {
      userId = randomUUID();
      await db.insert(users).values({
        id: userId,
        email,
        ein,
        orgName: `Organization ${ein}`,
        createdAt: new Date(),
      });
    } else {
      userId = existing.id;
    }

    let insertedCount = 0;
    const auditYearMap: { [key: string]: string } = {};

    for (const finding of mockFindings) {
      const fiscalYear = finding.auditYear;

      // Create audit year if not exists
      if (!auditYearMap[fiscalYear]) {
        const auditYearId = `ay_${Date.now()}_${Math.random()}`;
        await db
          .insert(auditYears)
          .values({
            id: auditYearId,
            userId,
            ein,
            fiscalYearEnd: fiscalYear,
            facReportId: `FAC-${fiscalYear}`,
            rawFacData: JSON.stringify({ source: 'mock', finding_id: finding.facFindingId }),
            createdAt: new Date(),
          })
          .onConflictDoNothing();
        auditYearMap[fiscalYear] = auditYearId;
      }

      const auditYearId = auditYearMap[fiscalYear];
      // Use stable ID based on audit year and finding ID to avoid duplicates
      const findingId = `${auditYearId}-${finding.facFindingId}`;

      const values = {
        id: findingId,
        auditYearId,
        facFindingId: finding.facFindingId,
        category: finding.category,
        description: finding.description,
        questionedCosts: finding.questionedCosts || 0,
        isRepeatFinding: finding.isRepeatFinding,
        priorFindingRefs: JSON.stringify(finding.priorRefs),
        createdAt: new Date(),
      };
      await db
        .insert(findings)
        .values(values)
        .onConflictDoUpdate({ target: findings.id, set: values });
      insertedCount++;
    }

    return NextResponse.json(
      {
        success: true,
        message: `Loaded ${insertedCount} sample findings`,
        userId,
        ein,
        findingsCount: insertedCount,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error loading sample data:', error);
    return NextResponse.json(
      { error: 'Failed to load sample data', details: String(error) },
      { status: 500 }
    );
  }
}
