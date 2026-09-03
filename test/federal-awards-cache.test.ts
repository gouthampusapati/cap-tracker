import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { OrgAwardsData } from '../lib/federal-awards';

/**
 * lib/federal-awards.ts gained a per-EIN Turso cache (federal_awards_cache)
 * so a crawler revisiting /single-audit/[ein]/risk-assessment stops
 * costing 2 live FAC calls every ISR window. These tests pin the
 * behaviour that matters for the FAC budget: a fresh cache hit makes NO
 * live fetch; a spent budget with a stale hit still serves (labeled);
 * a spent budget with nothing cached reports "unavailable", not an error.
 */

// ---- in-memory stand-in for the one table this module touches ----
let store = new Map<string, { ein: string; found: boolean; snapshot: string | null; syncedAt: Date }>();

const db = {
  select: () => ({
    from: () => ({
      where: (predicateEin: string) => ({
        limit: () => {
          const row = store.get(predicateEin);
          return row ? [row] : [];
        },
      }),
    }),
  }),
  insert: () => ({
    values: (v: { ein: string; found: boolean; snapshot: string | null; syncedAt: Date }) => ({
      onConflictDoUpdate: () => {
        store.set(v.ein, v);
        return Promise.resolve();
      },
    }),
  }),
};

// drizzle's eq(col, val) — we only need the value to key the fake store.
vi.mock('drizzle-orm', () => ({ eq: (_col: unknown, val: unknown) => val }));
vi.mock('@/lib/db', () => ({ db }));
vi.mock('@/lib/db/schema', () => ({ federalAwardsCache: { ein: 'ein' } }));

/* eslint-disable @typescript-eslint/no-explicit-any */
const getPublicOrg = vi.fn<any[], any>();
const hasFacBudget = vi.fn<any[], any>();
const recordFacFetch = vi.fn<any[], any>(async () => {});
const getFederalAwardsForReports = vi.fn<any[], any>();
const getDeMinimisRateForReports = vi.fn<any[], any>(async () => new Map());

vi.mock('@/lib/public-org-cache', () => ({ getPublicOrg: (...a: unknown[]) => getPublicOrg(...a) }));
vi.mock('@/lib/fac-budget', () => ({
  hasFacBudget: (...a: unknown[]) => hasFacBudget(...a),
  recordFacFetch: (...a: unknown[]) => recordFacFetch(...a),
}));
vi.mock('@/lib/fac-api', () => ({
  getFederalAwardsForReports: (...a: unknown[]) => getFederalAwardsForReports(...a),
  getDeMinimisRateForReports: (...a: unknown[]) => getDeMinimisRateForReports(...a),
}));

const { getFederalAwardsForOrg } = await import('../lib/federal-awards');

const EIN = '123456789';
const SYNCED = new Date('2026-08-20T00:00:00Z');

function orgResult() {
  return {
    org: {
      ein: EIN,
      name: 'Test Org',
      uei: 'UEIUEIUEIUE1',
      reports: [{ report_id: 'r1', audit_year: '2024', fy_end_date: '2024-06-30', total_amount_expended: 1_000_000 }],
      findings: [],
    },
    syncedAt: SYNCED,
    stale: false,
  };
}

function cachedSnapshot(over: Partial<OrgAwardsData> = {}): OrgAwardsData {
  return {
    ein: EIN,
    name: 'Test Org',
    uei: 'UEIUEIUEIUE1',
    years: [
      {
        reportId: 'r1',
        auditYear: '2024',
        fiscalYearEnd: '2024-06-30',
        totalAmountExpended: 1_000_000,
        awards: [],
        deMinimisRate: null,
      },
    ],
    findingAnchorsByAward: {},
    syncedAt: SYNCED,
    stale: false,
    ...over,
  };
}

beforeEach(() => {
  store = new Map();
  vi.clearAllMocks();
  getFederalAwardsForReports.mockResolvedValue([]);
  getDeMinimisRateForReports.mockResolvedValue(new Map());
});

describe('getFederalAwardsForOrg cache', () => {
  it('serves a fresh cache hit without any live FAC fetch', async () => {
    store.set(EIN, {
      ein: EIN,
      found: true,
      snapshot: JSON.stringify(cachedSnapshot()),
      syncedAt: new Date(), // just written -> fresh
    });

    const res = await getFederalAwardsForOrg(EIN);

    expect(res.kind).toBe('ok');
    expect(getPublicOrg).not.toHaveBeenCalled();
    expect(recordFacFetch).not.toHaveBeenCalled();
    expect(hasFacBudget).not.toHaveBeenCalled();
    if (res.kind === 'ok') expect(res.data.syncedAt).toBeInstanceOf(Date);
  });

  it('on a cold miss: fetches once, then writes the cache', async () => {
    getPublicOrg.mockResolvedValue(orgResult());
    hasFacBudget.mockResolvedValue(true);

    const res = await getFederalAwardsForOrg(EIN);

    expect(res.kind).toBe('ok');
    expect(recordFacFetch).toHaveBeenCalledTimes(1);
    expect(getFederalAwardsForReports).toHaveBeenCalledTimes(1);
    expect(store.get(EIN)?.found).toBe(true);
  });

  it('stale hit + spent budget: serves the stale copy, labeled', async () => {
    store.set(EIN, {
      ein: EIN,
      found: true,
      snapshot: JSON.stringify(cachedSnapshot()),
      syncedAt: new Date('2000-01-01T00:00:00Z'), // ancient -> stale
    });
    getPublicOrg.mockResolvedValue(orgResult());
    hasFacBudget.mockResolvedValue(false);

    const res = await getFederalAwardsForOrg(EIN);

    expect(res.kind).toBe('ok');
    expect(getFederalAwardsForReports).not.toHaveBeenCalled();
    if (res.kind === 'ok') expect(res.data.stale).toBe(true);
  });

  it('no cache + spent budget: unavailable, not an error', async () => {
    getPublicOrg.mockResolvedValue(orgResult());
    hasFacBudget.mockResolvedValue(false);

    const res = await getFederalAwardsForOrg(EIN);

    expect(res.kind).toBe('unavailable');
    expect(getFederalAwardsForReports).not.toHaveBeenCalled();
  });

  it('caches the negative when the org has no FAC reports', async () => {
    getPublicOrg.mockResolvedValue({ org: null, syncedAt: SYNCED, stale: false });

    const res = await getFederalAwardsForOrg(EIN);

    expect(res.kind).toBe('not-found');
    expect(store.get(EIN)?.found).toBe(false);

    // second call is served from the negative cache — no getPublicOrg
    getPublicOrg.mockClear();
    const res2 = await getFederalAwardsForOrg(EIN);
    expect(res2.kind).toBe('not-found');
    expect(getPublicOrg).not.toHaveBeenCalled();
  });
});
