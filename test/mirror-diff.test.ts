import { describe, it, expect } from 'vitest';
import { diffReports, assertDiffSane, deltaByKey } from '../scripts/lib/mirror-diff.mjs';
import { hashRow, taggedRowHash, xorHex, ZERO_DIGEST } from '../scripts/lib/row-hash.mjs';

describe('hashRow / xorHex', () => {
  it('is stable and order-sensitive within a row', () => {
    expect(hashRow(['a', 'b', 'c'])).toBe(hashRow(['a', 'b', 'c']));
    expect(hashRow(['a', 'b', 'c'])).not.toBe(hashRow(['a', 'c', 'b']));
  });

  it('distinguishes null from empty string from "null"', () => {
    const a = hashRow([null, 'x']);
    const b = hashRow(['', 'x']);
    const c = hashRow(['null', 'x']);
    expect(new Set([a, b, c]).size).toBe(3);
  });

  it('produces a 32-char hex digest', () => {
    expect(hashRow(['anything'])).toMatch(/^[0-9a-f]{32}$/);
  });

  it('taggedRowHash separates identical values in different tables', () => {
    expect(taggedRowHash('findings', ['1', '2'])).not.toBe(taggedRowHash('findings_text', ['1', '2']));
  });

  it('xorHex is its own inverse and order-independent', () => {
    const r1 = hashRow(['row1']);
    const r2 = hashRow(['row2']);
    const r3 = hashRow(['row3']);
    const forward = xorHex(xorHex(xorHex(ZERO_DIGEST, r1), r2), r3);
    const shuffled = xorHex(xorHex(xorHex(ZERO_DIGEST, r3), r1), r2);
    expect(forward).toBe(shuffled);
    // removing r2 again cancels it
    expect(xorHex(forward, r2)).toBe(xorHex(xorHex(ZERO_DIGEST, r1), r3));
  });
});

describe('diffReports', () => {
  it('classifies new, changed, unchanged, removed', () => {
    const live = new Map([
      ['r1', 'aaa'],
      ['r2', 'bbb'],
      ['r3', 'ccc'],
    ]);
    const incoming = new Map([
      ['r1', 'aaa'], // unchanged
      ['r2', 'BBB'], // changed
      ['r4', 'ddd'], // new
      // r3 removed
    ]);
    const { changed, removed, unchanged } = diffReports(incoming, live);
    expect([...changed].sort()).toEqual(['r2', 'r4']);
    expect([...removed]).toEqual(['r3']);
    expect(unchanged).toBe(1);
  });

  it('is empty when nothing moved', () => {
    const m = new Map([['r1', 'x'], ['r2', 'y']]);
    const { changed, removed, unchanged } = diffReports(new Map(m), m);
    expect(changed.size).toBe(0);
    expect(removed.size).toBe(0);
    expect(unchanged).toBe(2);
  });

  it('treats the whole file as new when the mirror is empty (first run)', () => {
    const incoming = new Map([['r1', 'x'], ['r2', 'y']]);
    const { changed, removed } = diffReports(incoming, new Map());
    expect(changed.size).toBe(2);
    expect(removed.size).toBe(0);
  });
});

describe('assertDiffSane', () => {
  const base = { changed: new Set(), removed: new Set(), incomingCount: 414_000, liveCount: 413_500 };

  it('passes a normal weekly delta', () => {
    expect(() =>
      assertDiffSane({ ...base, changed: new Set(Array(900).fill(0).map((_, i) => `c${i}`)), removed: new Set(['x', 'y']) })
    ).not.toThrow();
  });

  it('rejects a collapsed incoming set (truncated download)', () => {
    expect(() => assertDiffSane({ ...base, incomingCount: 12_000 })).toThrow(/truncated/i);
  });

  it('rejects an implausible mass delete', () => {
    const removed = new Set(Array(50_000).fill(0).map((_, i) => `r${i}`));
    expect(() => assertDiffSane({ ...base, removed })).toThrow(/would delete/i);
  });

  it('allows a large delete only if under the fraction limit', () => {
    // 2% of 413500 = 8270
    const removed = new Set(Array(8000).fill(0).map((_, i) => `r${i}`));
    expect(() => assertDiffSane({ ...base, removed })).not.toThrow();
  });

  it('skips the collapse check on a first run (liveCount 0)', () => {
    expect(() => assertDiffSane({ ...base, liveCount: 0, incomingCount: 5 })).not.toThrow();
  });
});

describe('deltaByKey', () => {
  it('emits only changed/new rows and stale keys', () => {
    const live = new Map([
      ['e1', 'h1'],
      ['e2', 'h2'],
      ['e3', 'h3'],
    ]);
    const incoming = [
      { key: 'e1', hash: 'h1', row: ['e1', 'same'] }, // unchanged
      { key: 'e2', hash: 'H2', row: ['e2', 'moved'] }, // changed
      { key: 'e4', hash: 'h4', row: ['e4', 'new'] }, // new
      // e3 gone
    ];
    const { upserts, deleteKeys } = deltaByKey(incoming, live);
    expect(upserts.map((r) => r[0]).sort()).toEqual(['e2', 'e4']);
    expect(deleteKeys).toEqual(['e3']);
  });
});
