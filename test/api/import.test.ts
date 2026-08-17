import { describe, it, expect, beforeAll } from 'vitest';
import { db } from '@/lib/db';
import { auditYears, findings } from '@/lib/db/schema';

describe('Import API', () => {
  beforeAll(async () => {
    // Tables are created on db init
  });

  it('should create audit year in database', async () => {
    const testEmail = 'test@org.org';
    const testEin = '123456789';

    // Simulate import
    const auditYearData = await db.insert(auditYears).values({
      id: 'test-id-1',
      userId: testEmail,
      ein: testEin,
      fiscalYearEnd: '2024-06-30',
      facReportId: 'FAC-123-2024',
      rawFacData: JSON.stringify({}),
      createdAt: new Date(),
    });

    // Verify
    const result = await db.select().from(auditYears).limit(1);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].ein).toBe(testEin);
  });

  it('should store findings with repeat flag', async () => {
    const findingData = await db.insert(findings).values({
      id: 'finding-1',
      auditYearId: 'test-id-1',
      facFindingId: '2024-001',
      category: 'Procurement',
      description: 'Test finding',
      isRepeatFinding: false,
      createdAt: new Date(),
    });

    const result = await db.select().from(findings).limit(1);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].isRepeatFinding).toBe(false);
  });
});
