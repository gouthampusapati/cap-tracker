import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { mockFindings } from '../lib/fac-mock-data';

describe('Sample FAC Data', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');

    // Create tables
    db.exec(`
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        ein TEXT,
        org_name TEXT,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE audit_years (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        ein TEXT NOT NULL,
        fiscal_year_end TEXT,
        fac_report_id TEXT,
        raw_fac_data TEXT,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE findings (
        id TEXT PRIMARY KEY,
        audit_year_id TEXT NOT NULL,
        fac_finding_id TEXT,
        category TEXT,
        description TEXT NOT NULL,
        questioned_costs REAL,
        is_repeat_finding INTEGER DEFAULT 0,
        prior_finding_refs TEXT,
        created_at INTEGER NOT NULL
      );
    `);
  });

  it('should have realistic FAC findings', () => {
    expect(mockFindings.length).toBe(5);
  });

  it('should have detailed descriptions', () => {
    const descriptions = mockFindings.map((f) => f.description.length);
    expect(Math.min(...descriptions)).toBeGreaterThan(100);
  });

  it('should have proper categories', () => {
    const validCategories = [
      'Cash Management',
      'Procurement',
      'Subrecipient Monitoring',
      'Cost Allowability',
      'Reporting',
    ];
    mockFindings.forEach((finding) => {
      expect(validCategories).toContain(finding.category);
    });
  });

  it('should load findings into database', () => {
    // Insert user
    const userId = 'test-user-1';
    db.prepare(`
      INSERT INTO users (id, email, ein, org_name, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(userId, 'test@example.com', '471334206', 'Test Org', Date.now());

    // Insert audit year
    const auditYearId = 'ay-2024';
    db.prepare(`
      INSERT INTO audit_years (id, user_id, ein, fiscal_year_end, fac_report_id, raw_fac_data, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      auditYearId,
      userId,
      '471334206',
      '2024-06-30',
      'FAC-2024',
      '{}',
      Date.now()
    );

    // Insert findings
    mockFindings.forEach((finding) => {
      db.prepare(`
        INSERT INTO findings
          (id, audit_year_id, fac_finding_id, category, description, questioned_costs, is_repeat_finding, prior_finding_refs, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        `finding-${finding.facFindingId}`,
        auditYearId,
        finding.facFindingId,
        finding.category,
        finding.description,
        finding.questionedCosts || 0,
        finding.isRepeatFinding ? 1 : 0,
        JSON.stringify(finding.priorRefs),
        Date.now()
      );
    });

    // Query back
    const results = db
      .prepare('SELECT * FROM findings WHERE audit_year_id = ?')
      .all(auditYearId) as Array<any>;

    expect(results).toHaveLength(5);
    expect(results[0].category).toBe('Cash Management');
    expect(results[0].description).toBeTruthy();
  });

  it('should track repeat findings', () => {
    const repeatFindings = mockFindings.filter((f) => f.isRepeatFinding);
    expect(repeatFindings.length).toBeGreaterThan(0);

    // Check that repeat findings have prior refs
    repeatFindings.forEach((finding) => {
      expect(finding.priorRefs.length).toBeGreaterThan(0);
    });
  });

  it('should have questioned costs data', () => {
    const withCosts = mockFindings.filter((f) => f.questionedCosts && f.questionedCosts > 0);
    expect(withCosts.length).toBeGreaterThan(0);

    const totalCosts = mockFindings.reduce((sum, f) => sum + (f.questionedCosts || 0), 0);
    expect(totalCosts).toBeGreaterThan(50000);
  });
});
