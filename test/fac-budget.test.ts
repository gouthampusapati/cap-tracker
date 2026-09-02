import { describe, it, expect } from 'vitest';
import {
  evaluateFacBudget,
  KEY_RATE_FLOOR,
  HARD_HOURLY_BATCH_CEILING,
  BLIND_HOURLY_BATCH_CEILING,
} from '../lib/fac-budget';

const ok = (over: Partial<Parameters<typeof evaluateFacBudget>[0]> = {}) =>
  evaluateFacBudget({
    batchCount: 10,
    hasRateSignal: true,
    latestRemainingByKey: { primary: 800 },
    fallbackConfigured: true,
    ...over,
  });

describe('evaluateFacBudget', () => {
  it('allows a fetch while the primary key has headroom', () => {
    expect(ok({ latestRemainingByKey: { primary: 720 } })).toBe(true);
  });

  it('rolls to the fallback key once the primary is near its limit', () => {
    expect(
      ok({ latestRemainingByKey: { primary: 5, fallback: 900 } })
    ).toBe(true);
  });

  it('treats a configured-but-untouched fallback key as fresh', () => {
    // primary spent, fallback never called this window (absent from map)
    expect(ok({ latestRemainingByKey: { primary: 2 } })).toBe(true);
  });

  it('blocks when both keys are spent', () => {
    expect(
      ok({ latestRemainingByKey: { primary: 3, fallback: 4 } })
    ).toBe(false);
  });

  it('blocks when the primary is spent and there is no fallback key', () => {
    expect(
      ok({ latestRemainingByKey: { primary: 3 }, fallbackConfigured: false })
    ).toBe(false);
  });

  it('allows when the primary has not been called recently (window reset)', () => {
    expect(ok({ latestRemainingByKey: { fallback: 500 } })).toBe(true);
  });

  it('respects KEY_RATE_FLOOR exactly (single key)', () => {
    expect(
      ok({ latestRemainingByKey: { primary: KEY_RATE_FLOOR }, fallbackConfigured: false })
    ).toBe(false);
    expect(
      ok({ latestRemainingByKey: { primary: KEY_RATE_FLOOR + 1 }, fallbackConfigured: false })
    ).toBe(true);
    // floor applies to the fallback key too
    expect(ok({ latestRemainingByKey: { primary: 1, fallback: KEY_RATE_FLOOR } })).toBe(false);
    expect(ok({ latestRemainingByKey: { primary: 1, fallback: KEY_RATE_FLOOR + 1 } })).toBe(true);
  });

  it('hard ceiling always blocks, regardless of rate headroom', () => {
    expect(
      ok({ batchCount: HARD_HOURLY_BATCH_CEILING, latestRemainingByKey: { primary: 999 } })
    ).toBe(false);
  });

  it('with no rate signal, falls back to the tight blind ceiling', () => {
    expect(
      evaluateFacBudget({
        batchCount: BLIND_HOURLY_BATCH_CEILING - 1,
        hasRateSignal: false,
        latestRemainingByKey: {},
        fallbackConfigured: true,
      })
    ).toBe(true);
    expect(
      evaluateFacBudget({
        batchCount: BLIND_HOURLY_BATCH_CEILING,
        hasRateSignal: false,
        latestRemainingByKey: {},
        fallbackConfigured: true,
      })
    ).toBe(false);
  });
});
