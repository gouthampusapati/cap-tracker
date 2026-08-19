import { NextRequest, NextResponse } from 'next/server';
import { eq, desc, asc, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users, auditYears, findings, capItems } from '@/lib/db/schema';
import { serializeCapItem } from '@/lib/db/serialize';

/**
 * GET /api/findings?email=...
 *
 * Returns every finding for the signed-in user's organization, newest
 * fiscal year first, with its CAP items attached.
 */
export async function GET(req: NextRequest) {
  try {
    const email = req.nextUrl.searchParams.get('email');
    if (!email) {
      return NextResponse.json({ error: 'Email required' }, { status: 400 });
    }

    const [user] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (!user) return NextResponse.json([]);

    const rows = await db
      .select({
        id: findings.id,
        facFindingId: findings.facFindingId,
        reportId: findings.facReportId,
        auditYear: auditYears.fiscalYearEnd,
        category: findings.category,
        description: findings.description,
        plannedAction: findings.plannedAction,
        questionedCosts: findings.questionedCosts,
        isRepeatFinding: findings.isRepeatFinding,
        priorFindingRefs: findings.priorFindingRefs,
      })
      .from(findings)
      .innerJoin(auditYears, eq(auditYears.id, findings.auditYearId))
      .where(eq(auditYears.userId, user.id))
      .orderBy(desc(auditYears.fiscalYearEnd), asc(findings.facFindingId));

    // One batched IN query for every finding's CAP items rather than a
    // query per finding — same result shape as before, fewer round trips.
    const findingIds = rows.map((r) => r.id);
    const capRows = findingIds.length
      ? await db
          .select()
          .from(capItems)
          .where(inArray(capItems.findingId, findingIds))
          .orderBy(desc(capItems.createdAt))
      : [];

    const capByFinding = new Map<string, ReturnType<typeof serializeCapItem>[]>();
    for (const c of capRows) {
      const serialized = serializeCapItem(c);
      const list = capByFinding.get(c.findingId) ?? [];
      list.push(serialized);
      capByFinding.set(c.findingId, list);
    }

    const result = rows.map((f) => ({
      id: f.id,
      facFindingId: f.facFindingId,
      reportId: f.reportId,
      auditYear: f.auditYear,
      category: f.category,
      description: f.description,
      plannedAction: f.plannedAction || '',
      questionedCosts: f.questionedCosts,
      isRepeatFinding: !!f.isRepeatFinding,
      priorRefs: f.priorFindingRefs ? JSON.parse(f.priorFindingRefs) : [],
      capItems: capByFinding.get(f.id) || [],
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error('Findings error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch findings', details: String(error) },
      { status: 500 }
    );
  }
}
