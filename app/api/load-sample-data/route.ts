import { NextRequest, NextResponse } from 'next/server';
import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import { mockFindings } from '@/lib/fac-mock-data';

const dbPath = process.env.DATABASE_URL || 'cap-tracker.db';
const sqlite = new Database(dbPath);

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
    const userQuery = sqlite.prepare(
      'SELECT id FROM users WHERE email = ?'
    );
    let user = userQuery.get(email) as { id: string } | undefined;

    let userId: string;
    if (!user) {
      userId = randomUUID();
      const insertUser = sqlite.prepare(`
        INSERT INTO users (id, email, ein, org_name, created_at)
        VALUES (?, ?, ?, ?, ?)
      `);
      insertUser.run(
        userId,
        email,
        ein,
        `Organization ${ein}`,
        Date.now()
      );
    } else {
      userId = user.id;
    }

    // Create audit year record
    const auditYearStmt = sqlite.prepare(`
      INSERT OR IGNORE INTO audit_years
        (id, user_id, ein, fiscal_year_end, fac_report_id, raw_fac_data, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    // Insert findings
    const findingStmt = sqlite.prepare(`
      INSERT INTO findings
        (id, audit_year_id, fac_finding_id, category, description, questioned_costs, is_repeat_finding, prior_finding_refs, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    let insertedCount = 0;
    const auditYearMap: { [key: string]: string } = {};

    for (const finding of mockFindings) {
      const fiscal_year = finding.auditYear;

      // Create audit year if not exists
      if (!auditYearMap[fiscal_year]) {
        const auditYearId = `ay_${Date.now()}_${Math.random()}`;
        auditYearStmt.run(
          auditYearId,
          userId,
          ein,
          fiscal_year,
          `FAC-${fiscal_year}`,
          JSON.stringify({ source: 'mock', finding_id: finding.facFindingId }),
          Date.now()
        );
        auditYearMap[fiscal_year] = auditYearId;
      }

      const auditYearId = auditYearMap[fiscal_year];
      const findingId = `finding_${Date.now()}_${Math.random()}`;

      findingStmt.run(
        findingId,
        auditYearId,
        finding.facFindingId,
        finding.category,
        finding.description,
        finding.questionedCosts || 0,
        finding.isRepeatFinding ? 1 : 0,
        JSON.stringify(finding.priorRefs),
        Date.now()
      );
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
