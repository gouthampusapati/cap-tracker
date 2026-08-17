import { NextRequest, NextResponse } from 'next/server';
import { getMockFindings } from '@/lib/fac-client';
import { db } from '@/lib/db';
import { auditYears, findings } from '@/lib/db/schema';
import crypto from 'crypto';

export async function POST(req: NextRequest) {
  try {
    const { ein, email } = await req.json();
    if (!ein || !email) {
      return NextResponse.json({ error: 'EIN and email required' }, { status: 400 });
    }

    const mockFindings = getMockFindings();

    // Store audit year
    const auditYearId = crypto.randomUUID();
    await db.insert(auditYears).values({
      id: auditYearId,
      userId: email, // Use email as user ID for MVP
      ein,
      fiscalYearEnd: '2024-06-30',
      facReportId: `FAC-${ein}-2024`,
      rawFacData: JSON.stringify({ ein }),
      createdAt: new Date(),
    });

    // Store findings
    for (const finding of mockFindings) {
      await db.insert(findings).values({
        id: crypto.randomUUID(),
        auditYearId,
        facFindingId: finding.reference_number,
        category: finding.type_requirement || 'Other',
        description: finding.finding_text,
        questionedCosts: finding.questioned_costs,
        isRepeatFinding: finding.repeat_finding || false,
        priorFindingRefs: finding.prior_finding_references ? JSON.stringify(finding.prior_finding_references) : null,
        createdAt: new Date(),
      });
    }

    return NextResponse.json({ success: true, auditYearId });
  } catch (error) {
    console.error('Import error:', error);
    return NextResponse.json({ error: 'Import failed' }, { status: 500 });
  }
}
