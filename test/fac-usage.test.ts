import { describe, it, expect } from 'vitest';
import { buildUsageReport } from '../lib/fac-usage';

const NOW = new Date('2026-08-28T12:30:00Z');

function row(over: Partial<Parameters<typeof buildUsageReport>[0][number]> = {}) {
  return {
    calledAt: new Date('2026-08-28T10:15:00Z'),
    path: 'general',
    status: 200,
    keyLabel: 'primary',
    rateRemaining: 900,
    ...over,
  };
}

describe('buildUsageReport', () => {
  it('always emits every day in the window, newest first, even with no calls', () => {
    const r = buildUsageReport([], NOW, 14);
    expect(r.days).toHaveLength(14);
    expect(r.days[0].date).toBe('2026-08-28');
    expect(r.days[13].date).toBe('2026-08-15');
    expect(r.days.every((d) => d.hours.length === 24)).toBe(true);
    expect(r.totalCalls).toBe(0);
  });

  it('buckets calls into the correct UTC day and hour', () => {
    const r = buildUsageReport(
      [
        row({ calledAt: new Date('2026-08-28T10:15:00Z') }),
        row({ calledAt: new Date('2026-08-28T10:59:00Z') }),
        row({ calledAt: new Date('2026-08-27T23:00:00Z') }),
      ],
      NOW,
      14
    );
    const d28 = r.days.find((d) => d.date === '2026-08-28')!;
    const d27 = r.days.find((d) => d.date === '2026-08-27')!;
    expect(d28.hours[10].count).toBe(2);
    expect(d28.total).toBe(2);
    expect(d27.hours[23].count).toBe(1);
    expect(r.totalCalls).toBe(3);
  });

  it('counts calls in the last hour and tracks the lowest remaining quota there', () => {
    const r = buildUsageReport(
      [
        row({ calledAt: new Date('2026-08-28T12:00:00Z'), rateRemaining: 400 }),
        row({ calledAt: new Date('2026-08-28T12:20:00Z'), rateRemaining: 220 }),
        row({ calledAt: new Date('2026-08-28T09:00:00Z'), rateRemaining: 5 }), // >1h ago, ignored
      ],
      NOW,
      14
    );
    expect(r.callsLastHour).toBe(2);
    expect(r.minRemainingLastHour).toBe(220);
  });

  it('treats status 0 and >=400 as errors, ring-marked at the cell and counted', () => {
    const r = buildUsageReport(
      [
        row({ status: 200 }),
        row({ status: 429 }),
        row({ status: 0 }),
        row({ status: 503 }),
      ],
      NOW,
      14
    );
    expect(r.errorCalls).toBe(3);
    const day = r.days.find((d) => d.date === '2026-08-28')!;
    expect(day.hours[10].errorCount).toBe(3);
  });

  it('summarizes by endpoint and by key, and counts fallback usage', () => {
    const r = buildUsageReport(
      [
        row({ path: 'general', keyLabel: 'primary' }),
        row({ path: 'findings', keyLabel: 'primary' }),
        row({ path: 'findings', keyLabel: 'fallback' }),
        row({ path: 'findings', keyLabel: 'fallback' }),
      ],
      NOW,
      14
    );
    expect(r.byPath[0]).toEqual({ path: 'findings', count: 3 });
    expect(r.byKey.find((k) => k.keyLabel === 'fallback')!.count).toBe(2);
    expect(r.fallbackCalls).toBe(2);
  });

  it('ignores rows outside the window rather than crashing on a missing day bucket', () => {
    const r = buildUsageReport(
      [row({ calledAt: new Date('2026-07-01T10:00:00Z') })],
      NOW,
      14
    );
    // Counted in totals, but no day bucket to place it in.
    expect(r.totalCalls).toBe(1);
    expect(r.days.every((d) => d.total === 0)).toBe(true);
  });
});
