import { NextRequest, NextResponse } from 'next/server';
import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import { importOrgByEin } from '@/lib/fac-api';

const dbPath = process.env.DATABASE_URL || 'cap-tracker.db';
const sqlite = new Database(dbPath);

/**
 * `planned_action` (the auditee's own CAP narrative from FAC) and
 * `fac_report_id` were added after the original schema. Add them if the
 * existing database predates them. SQLite has no "ADD COLUMN IF NOT
 * EXISTS", so check PRAGMA first.
 */
function ensureColumns() {
  const cols = sqlite
    .prepare("PRAGMA table_info('findings')")
    .all() as Array<{ name: string }>;
  const names = new Set(cols.map((c) => c.name));

  if (!names.has('planned_action')) {
    sqlite.exec('ALTER TABLE findings ADD COLUMN planned_action TEXT');
  }
  if (!names.has('fac_report_id')) {
    sqlite.exec('ALTER TABLE findings ADD COLUMN fac_report_id TEXT');
  }
}

/**
 * POST /api/import
 * Body: { ein, email }
 *
 * Pulls the organization's full Single Audit history from the Federal
 * Audit Clearinghouse and stores every finding. Re-running is safe:
 * findings use a stable id derived from report_id + reference_number, so
 * a re-import updates rows in place and CAP items stay attached.
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

    if (!process.env.FAC_API_KEY) {
      return NextResponse.json(
        {
          error:
            'FAC_API_KEY is not configured. Get a free key at https://api.data.gov/signup and add it to .env.local',
        },
        { status: 500 }
      );
    }

    ensureColumns();

    const org = await importOrgByEin(ein);

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
    const existing = sqlite
      .prepare('SELECT id FROM users WHERE email = ?')
      .get(email) as { id: string } | undefined;

    let userId: string;
    if (existing) {
      userId = existing.id;
      sqlite
        .prepare('UPDATE users SET ein = ?, org_name = ? WHERE id = ?')
        .run(ein, org.name, userId);
    } else {
      userId = randomUUID();
      sqlite
        .prepare(
          `INSERT INTO users (id, email, ein, org_name, created_at)
           VALUES (?, ?, ?, ?, ?)`
        )
        .run(userId, email, ein, org.name, Date.now());
    }

    const auditYearStmt = sqlite.prepare(`
      INSERT OR REPLACE INTO audit_years
        (id, user_id, ein, fiscal_year_end, fac_report_id, raw_fac_data, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const findingStmt = sqlite.prepare(`
      INSERT OR REPLACE INTO findings
        (id, audit_year_id, fac_finding_id, fac_report_id, category, description,
         planned_action, questioned_costs, is_repeat_finding, prior_finding_refs, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const now = Date.now();

    const write = sqlite.transaction(() => {
      // One audit_years row per FAC report, keyed on report_id so a
      // re-import replaces rather than duplicates.
      for (const report of org.reports) {
        auditYearStmt.run(
          `ay_${report.report_id}`,
          userId,
          ein,
          report.fy_end_date,
          report.report_id,
          JSON.stringify(report),
          now
        );
      }

      for (const f of org.findings) {
        findingStmt.run(
          `${f.reportId}::${f.facFindingId}`,
          `ay_${f.reportId}`,
          f.facFindingId,
          f.reportId,
          f.category,
          f.description,
          f.plannedAction,
          // FAC only exposes a Y/N flag, not an amount. Store null rather
          // than inventing a number; the UI shows a flag instead.
          null,
          f.isRepeatFinding ? 1 : 0,
          JSON.stringify(f.priorRefs),
          now
        );
      }
    });

    write();

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
