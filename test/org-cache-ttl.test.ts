import { describe, it, expect } from 'vitest';
import { nextExpectedFilingDeadline, effectiveMaxAgeMs } from '../lib/org-cache-ttl';

const DAY_MS = 24 * 60 * 60 * 1000;

describe('nextExpectedFilingDeadline', () => {
  it('is 9 months after the fiscal year one year after the most recent one on file', () => {
    // FY ending 2024-12-31 on file -> next FY ends 2025-12-31 -> due
    // 9 months later, 2026-09-30 (2 CFR 200.512(a)(1)).
    const deadline = nextExpectedFilingDeadline('2024-12-31');
    expect(deadline?.toISOString().slice(0, 10)).toBe('2026-09-30');
  });

  it('handles a non-calendar fiscal year end', () => {
    // FY ending 2023-06-30 -> next FY ends 2024-06-30 -> due 2025-03-30.
    const deadline = nextExpectedFilingDeadline('2023-06-30');
    expect(deadline?.toISOString().slice(0, 10)).toBe('2025-03-30');
  });

  it('returns null for an unparseable date rather than guessing', () => {
    expect(nextExpectedFilingDeadline('not-a-date')).toBeNull();
    expect(nextExpectedFilingDeadline('')).toBeNull();
  });
});

describe('effectiveMaxAgeMs', () => {
  it('gives a not-found EIN the longest TTL — 30 days', () => {
    const now = Date.now();
    expect(effectiveMaxAgeMs(false, null, now)).toBe(30 * DAY_MS);
    // found=false short-circuits before ever looking at the FYE date.
    expect(effectiveMaxAgeMs(false, '2024-12-31', now)).toBe(30 * DAY_MS);
  });

  it('gives a found org with no FYE signal the default TTL — 7 days', () => {
    expect(effectiveMaxAgeMs(true, null, Date.now())).toBe(7 * DAY_MS);
    expect(effectiveMaxAgeMs(true, undefined, Date.now())).toBe(7 * DAY_MS);
  });

  it('shortens to 24h when now is within 60 days of the next expected filing deadline', () => {
    // Deadline for FY 2024-12-31 is 2026-09-30 (see above).
    const justBeforeDeadline = new Date('2026-08-15T00:00:00Z').getTime();
    expect(effectiveMaxAgeMs(true, '2024-12-31', justBeforeDeadline)).toBe(1 * DAY_MS);

    const justAfterDeadline = new Date('2026-10-20T00:00:00Z').getTime();
    expect(effectiveMaxAgeMs(true, '2024-12-31', justAfterDeadline)).toBe(1 * DAY_MS);
  });

  it('stays at the default 7-day TTL when nowhere near the deadline window', () => {
    // Deadline 2026-09-30, this "now" is ~9 months out — well outside
    // the ±60 day window.
    const farFromDeadline = new Date('2026-01-01T00:00:00Z').getTime();
    expect(effectiveMaxAgeMs(true, '2024-12-31', farFromDeadline)).toBe(7 * DAY_MS);
  });
});
