import { describe, it, expect } from 'vitest';
import {
  buildSnapshot,
  diffSnapshot,
  findingKey,
  mdDeadline,
  soonestMdDeadline,
} from '../scripts/lib/monitor-snapshot.mjs';

const NOW = new Date('2026-06-01T00:00:00Z');

const report = (over: Record<string, unknown> = {}) => ({
  report_id: 'R1',
  audit_year: '2024',
  fy_end_date: '2024-12-31',
  fac_accepted_date: null,
  ...over,
});
const finding = (over: Record<string, unknown> = {}) => ({
  reportId: 'R1',
  facFindingId: '2024-001',
  isRepeatFinding: false,
  ...over,
});
const org = (over: Record<string, unknown> = {}) => ({
  name: 'Test Org',
  reports: [report()],
  findings: [],
  ...over,
});

const stateFrom = (s: any, mdAlerted: string | null = null) => ({
  latestReportId: s.latestReportId,
  latestAuditYear: s.latestAuditYear,
  latestFacAcceptedDate: s.latestFacAcceptedDate,
  findingRefs: s.findingRefs,
  repeatFindingRefs: s.repeatFindingRefs,
  soonestMdDeadline: s.soonestMdDeadline,
  mdDeadlineAlerted: mdAlerted,
});

describe('mdDeadline', () => {
  it('is 6 months after the acceptance date', () => {
    expect(mdDeadline('2026-01-15', NOW)?.label).toBe('2026-07-15');
  });
  it('classifies future / due-soon / past around a 30-day window', () => {
    expect(mdDeadline('2026-03-01', NOW)?.state).toBe('future'); // ~92d
    expect(mdDeadline('2025-12-20', NOW)?.state).toBe('due-soon'); // ~19d
    expect(mdDeadline('2025-01-01', NOW)?.state).toBe('past');
  });
  it('returns null for missing / unparseable dates', () => {
    expect(mdDeadline(null, NOW)).toBeNull();
    expect(mdDeadline('not-a-date', NOW)).toBeNull();
  });
});

describe('soonestMdDeadline', () => {
  it('prefers the soonest upcoming, else the most recently passed', () => {
    const reports = [
      report({ fac_accepted_date: '2020-01-01' }), // long past
      report({ fac_accepted_date: '2026-02-01' }), // future ~2026-08-01
      report({ fac_accepted_date: '2025-12-25' }), // due-soon ~2026-06-25
    ];
    expect(soonestMdDeadline(reports, NOW)?.label).toBe('2026-06-25');

    const allPast = [report({ fac_accepted_date: '2024-01-01' }), report({ fac_accepted_date: '2023-06-01' })];
    expect(soonestMdDeadline(allPast, NOW)?.label).toBe('2024-07-01');
  });
});

describe('buildSnapshot', () => {
  it('takes the latest report by fiscal-year end', () => {
    const s = buildSnapshot(
      org({
        reports: [
          report({ report_id: 'OLD', fy_end_date: '2022-12-31', audit_year: '2022' }),
          report({ report_id: 'NEW', fy_end_date: '2024-12-31', audit_year: '2024' }),
        ],
      }),
      NOW
    );
    expect(s.latestReportId).toBe('NEW');
    expect(s.latestAuditYear).toBe('2024');
  });

  it('collects deduped, sorted finding keys + the repeat subset', () => {
    const s = buildSnapshot(
      org({
        findings: [
          finding({ facFindingId: '2024-002' }),
          finding({ facFindingId: '2024-001' }),
          finding({ facFindingId: '2024-001' }), // dup (multi-award row)
          finding({ facFindingId: '2024-003', isRepeatFinding: true }),
        ],
      }),
      NOW
    );
    expect(s.findingRefs).toEqual(['R1::2024-001', 'R1::2024-002', 'R1::2024-003']);
    expect(s.repeatFindingRefs).toEqual(['R1::2024-003']);
  });

  it('has a null deadline when no report carries an acceptance date', () => {
    const s = buildSnapshot(org(), NOW);
    expect(s.soonestMdDeadline).toBeNull();
    expect(s.soonestMdDeadlineState).toBeNull();
  });
});

describe('diffSnapshot', () => {
  it('no change -> no alerts', () => {
    const s = buildSnapshot(org({ findings: [finding()] }), NOW);
    expect(diffSnapshot(stateFrom(s), s)).toEqual([]);
  });

  it('a new latest report raises new_audit', () => {
    const prev = buildSnapshot(org({ reports: [report({ report_id: 'R1' })] }), NOW);
    const next = buildSnapshot(
      org({
        reports: [
          report({ report_id: 'R2', fy_end_date: '2025-12-31', audit_year: '2025' }),
          report({ report_id: 'R1' }),
        ],
      }),
      NOW
    );
    const alerts = diffSnapshot(stateFrom(prev), next);
    expect(alerts.map((a: any) => a.type)).toEqual(['new_audit']);
    expect((alerts[0].payload as any).auditYear).toBe('2025');
  });

  it('a new finding raises one new_finding per finding', () => {
    const prev = buildSnapshot(org({ findings: [finding({ facFindingId: '2024-001' })] }), NOW);
    const next = buildSnapshot(
      org({ findings: [finding({ facFindingId: '2024-001' }), finding({ facFindingId: '2024-002' })] }),
      NOW
    );
    const alerts = diffSnapshot(stateFrom(prev), next);
    expect(alerts.map((a: any) => a.type)).toEqual(['new_finding']);
    expect((alerts[0].payload as any).referenceNumber).toBe('2024-002');
  });

  it('a new repeat finding raises repeat_finding only (not also new_finding)', () => {
    const prev = buildSnapshot(org({ findings: [] }), NOW);
    const next = buildSnapshot(
      org({ findings: [finding({ facFindingId: '2024-009', isRepeatFinding: true })] }),
      NOW
    );
    expect(diffSnapshot(stateFrom(prev), next).map((a: any) => a.type)).toEqual(['repeat_finding']);
  });

  it('a plain new finding + a new repeat finding -> both, once each', () => {
    const prev = buildSnapshot(org({ findings: [] }), NOW);
    const next = buildSnapshot(
      org({ findings: [finding({ facFindingId: 'A' }), finding({ facFindingId: 'B', isRepeatFinding: true })] }),
      NOW
    );
    expect(diffSnapshot(stateFrom(prev), next).map((a: any) => a.type).sort()).toEqual([
      'new_finding',
      'repeat_finding',
    ]);
  });

  it('deadline entering the 30-day window raises deadline once', () => {
    const next = buildSnapshot(org({ reports: [report({ fac_accepted_date: '2025-12-20' })] }), NOW);
    const first = diffSnapshot(stateFrom(next, null), next);
    expect(first.map((a: any) => a.type)).toEqual(['deadline']);
    expect((first[0].payload as any).state).toBe('due-soon');
    // already alerted for this deadline -> silent
    expect(diffSnapshot(stateFrom(next, next.soonestMdDeadline), next)).toEqual([]);
  });

  it('does not raise deadline while comfortably in the future', () => {
    const next = buildSnapshot(org({ reports: [report({ fac_accepted_date: '2026-03-01' })] }), NOW);
    expect(diffSnapshot(stateFrom(next), next)).toEqual([]);
  });
});

describe('findingKey', () => {
  it('is reportId::facFindingId', () => {
    expect(findingKey({ reportId: 'R9', facFindingId: '2023-004' })).toBe('R9::2023-004');
  });
});
