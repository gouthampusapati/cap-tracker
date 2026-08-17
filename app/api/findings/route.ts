import { NextRequest, NextResponse } from 'next/server';
import Database from 'better-sqlite3';

const dbPath = process.env.DATABASE_URL || 'cap-tracker.db';
const sqlite = new Database(dbPath);

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

    const user = sqlite
      .prepare('SELECT id, org_name FROM users WHERE email = ?')
      .get(email) as { id: string; org_name: string } | undefined;

    if (!user) return NextResponse.json([]);

    const cols = sqlite
      .prepare("PRAGMA table_info('findings')")
      .all() as Array<{ name: string }>;
    const hasPlannedAction = cols.some((c) => c.name === 'planned_action');

    const rows = sqlite
      .prepare(
        `SELECT f.*, ay.fiscal_year_end, ay.fac_report_id AS report_id
           FROM findings f
           JOIN audit_years ay ON ay.id = f.audit_year_id
          WHERE ay.user_id = ?
       ORDER BY ay.fiscal_year_end DESC, f.fac_finding_id ASC`
      )
      .all(user.id) as Array<any>;

    const capStmt = sqlite.prepare(
      'SELECT * FROM cap_items WHERE finding_id = ? ORDER BY created_at DESC'
    );

    const result = rows.map((f) => ({
      id: f.id,
      facFindingId: f.fac_finding_id,
      reportId: f.report_id,
      auditYear: f.fiscal_year_end,
      category: f.category,
      description: f.description,
      plannedAction: hasPlannedAction ? f.planned_action || '' : '',
      questionedCosts: f.questioned_costs,
      isRepeatFinding: !!f.is_repeat_finding,
      priorRefs: f.prior_finding_refs ? JSON.parse(f.prior_finding_refs) : [],
      capItems: capStmt.all(f.id),
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
