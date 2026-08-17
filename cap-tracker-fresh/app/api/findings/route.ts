import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auditYears, findings, capItems } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function GET(req: NextRequest) {
  try {
    const email = req.nextUrl.searchParams.get('email');
    if (!email) {
      return NextResponse.json({ error: 'Email required' }, { status: 400 });
    }

    // Get audit years for user
    const auditYearsData = await db
      .select()
      .from(auditYears)
      .where(eq(auditYears.userId, email));

    const result = [];

    for (const auditYear of auditYearsData) {
      const findingsData = await db
        .select()
        .from(findings)
        .where(eq(findings.auditYearId, auditYear.id));

      for (const finding of findingsData) {
        const capItemsData = await db
          .select()
          .from(capItems)
          .where(eq(capItems.findingId, finding.id));

        result.push({
          ...finding,
          auditYear: auditYear.fiscalYearEnd,
          capItems: capItemsData,
          priorRefs: finding.priorFindingRefs ? JSON.parse(finding.priorFindingRefs) : [],
        });
      }
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Findings error:', error);
    return NextResponse.json({ error: 'Failed to fetch findings' }, { status: 500 });
  }
}
