import { NextRequest, NextResponse } from 'next/server';
import { eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users, auditYears, findings, capItems } from '@/lib/db/schema';

/**
 * GET /api/org?email=...
 *
 * The organization currently linked to this account. Used on page load so
 * the dashboard can show the org name without re-running an import.
 */
export async function GET(req: NextRequest) {
  try {
    const email = req.nextUrl.searchParams.get('email');
    if (!email) {
      return NextResponse.json({ error: 'Email required' }, { status: 400 });
    }

    const [user] = await db
      .select({ id: users.id, ein: users.ein, orgName: users.orgName })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (!user || !user.ein) return NextResponse.json(null);

    const years = await db
      .select({ id: auditYears.id })
      .from(auditYears)
      .where(eq(auditYears.userId, user.id));

    return NextResponse.json({
      ein: user.ein,
      orgName: user.orgName,
      auditYears: years.length,
    });
  } catch (error) {
    console.error('Org lookup error:', error);
    return NextResponse.json(
      { error: 'Failed to load organization' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/org?email=...
 *
 * Detach this account from its organization so a different EIN can be
 * imported. Findings and their CAP items are removed together — a CAP item
 * is meaningless without the finding it belongs to.
 */
export async function DELETE(req: NextRequest) {
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

    if (!user) return NextResponse.json({ success: true });

    await db.transaction(async (tx) => {
      const years = await tx
        .select({ id: auditYears.id })
        .from(auditYears)
        .where(eq(auditYears.userId, user.id));
      const yearIds = years.map((y) => y.id);

      if (yearIds.length > 0) {
        const findingRows = await tx
          .select({ id: findings.id })
          .from(findings)
          .where(inArray(findings.auditYearId, yearIds));
        const findingIds = findingRows.map((f) => f.id);

        if (findingIds.length > 0) {
          await tx.delete(capItems).where(inArray(capItems.findingId, findingIds));
        }
        await tx.delete(findings).where(inArray(findings.auditYearId, yearIds));
        await tx.delete(auditYears).where(eq(auditYears.userId, user.id));
      }

      await tx.update(users).set({ ein: null, orgName: null }).where(eq(users.id, user.id));
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Org reset error:', error);
    return NextResponse.json(
      { error: 'Failed to reset organization' },
      { status: 500 }
    );
  }
}
