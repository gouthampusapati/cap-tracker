import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ImportedOrg } from '../lib/fac-api';
import type { OrgLookupResult } from '../lib/public-org-cache';

// lib/portfolio.ts pulls the DB chain in via getPublicOrgsBatch,
// resolveCoveringFilingEins and the mirror reader — mock all three so
// fetchPortfolio's branching (found / not-found / budget-exhausted /
// component-EIN resolution) can be tested as pure logic.
const getPublicOrgsBatch = vi.fn();
const resolveCoveringFilingEins = vi.fn();
const readOrgsFromMirror = vi.fn();
const getMirrorSyncedAt = vi.fn();

vi.mock('@/lib/public-org-cache', () => ({
  getPublicOrgsBatch: (...args: unknown[]) => getPublicOrgsBatch(...args),
}));
vi.mock('@/lib/entity-resolution', () => ({
  resolveCoveringFilingEins: (...args: unknown[]) => resolveCoveringFilingEins(...args),
}));
vi.mock('@/lib/fac-mirror-read', () => ({
  readOrgsFromMirror: (...args: unknown[]) => readOrgsFromMirror(...args),
  getMirrorSyncedAt: (...args: unknown[]) => getMirrorSyncedAt(...args),
}));

const { fetchPortfolio } = await import('../lib/portfolio');

const SYNCED = new Date('2026-08-01T00:00:00Z');

function org(over: Partial<ImportedOrg> = {}): ImportedOrg {
  return {
    ein: '000000001',
    uei: 'UEIUEIUEIUE1',
    name: 'Test Org',
    reports: [
      {
        report_id: 'r1',
        auditee_ein: '000000001',
        auditee_uei: 'UEIUEIUEIUE1',
        auditee_name: 'Test Org',
        audit_year: '2024',
        fy_end_date: '2024-12-31',
        fy_start_date: '2024-01-01',
        total_amount_expended: 5_000_000,
        entity_type: 'non-profit',
        is_low_risk_auditee: 'No',
        is_going_concern_included: 'No',
        is_material_noncompliance_disclosed: 'No',
        gaap_results: '',
        auditor_firm_name: 'Auditor LLP',
        auditor_ein: '999999999',
        cognizant_agency: '',
        oversight_agency: '20',
        fac_accepted_date: null,
      },
    ],
    findings: [],
    ...over,
  };
}

function found(o: ImportedOrg): OrgLookupResult {
  return { org: o, syncedAt: SYNCED, fromCache: true, stale: false, unavailable: false };
}
const notFound: OrgLookupResult = {
  org: null,
  syncedAt: SYNCED,
  fromCache: true,
  stale: false,
  unavailable: false,
};
const unavailable: OrgLookupResult = {
  org: null,
  syncedAt: SYNCED,
  fromCache: false,
  stale: false,
  unavailable: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  resolveCoveringFilingEins.mockResolvedValue(new Map());
  readOrgsFromMirror.mockResolvedValue(new Map());
  getMirrorSyncedAt.mockResolvedValue(SYNCED);
});

describe('fetchPortfolio', () => {
  it('returns [] for an empty list without touching the DB', async () => {
    expect(await fetchPortfolio([])).toEqual([]);
    expect(getPublicOrgsBatch).not.toHaveBeenCalled();
  });

  it('maps found / not-found / budget-exhausted to the right row status', async () => {
    getPublicOrgsBatch.mockResolvedValueOnce(
      new Map([
        ['000000001', found(org({ ein: '000000001', name: 'Has Audit' }))],
        ['000000002', notFound],
        ['000000003', unavailable],
      ])
    );
    const rows = await fetchPortfolio(['000000001', '000000002', '000000003']);
    expect(rows.map((r) => [r.ein, r.status])).toEqual([
      ['000000001', 'found'],
      ['000000002', 'not-found'],
      ['000000003', 'error'],
    ]);
    expect(rows.every((r) => r.coveringEin === null)).toBe(true);
  });

  it('resolves a component EIN to the covering filing (read from the mirror) and marks the row', async () => {
    getPublicOrgsBatch.mockResolvedValueOnce(new Map([['060772160', notFound]]));
    resolveCoveringFilingEins.mockResolvedValueOnce(new Map([['060772160', '066000798']]));
    readOrgsFromMirror.mockResolvedValueOnce(
      new Map([['066000798', org({ ein: '066000798', name: 'State of Connecticut' })]])
    );

    const [row] = await fetchPortfolio(['060772160']);
    expect(row.status).toBe('found');
    expect(row.ein).toBe('060772160'); // the row still keys on what the user entered
    expect(row.coveringEin).toBe('066000798');
    expect(row.orgName).toBe('State of Connecticut');
    expect(row.syncedAt).toEqual(SYNCED);
    expect(resolveCoveringFilingEins).toHaveBeenCalledWith(['060772160']);
    expect(readOrgsFromMirror).toHaveBeenCalledWith(['066000798']);
  });

  it('NEVER makes a second getPublicOrgsBatch call — covering data is mirror-only', async () => {
    getPublicOrgsBatch.mockResolvedValueOnce(
      new Map([
        ['000000001', notFound],
        ['000000002', unavailable],
        ['000000003', notFound],
      ])
    );
    resolveCoveringFilingEins.mockResolvedValueOnce(
      new Map([
        ['000000001', '111111110'],
        ['000000002', '222222220'],
      ])
    );
    readOrgsFromMirror.mockResolvedValueOnce(
      new Map([
        ['111111110', org({ ein: '111111110', name: 'Parent One' })],
        ['222222220', org({ ein: '222222220', name: 'Parent Two' })],
      ])
    );

    await fetchPortfolio(['000000001', '000000002', '000000003']);
    expect(getPublicOrgsBatch).toHaveBeenCalledTimes(1);
    expect(readOrgsFromMirror).toHaveBeenCalledTimes(1);
  });

  it('falls back to not-found when a component EIN has no resolvable parent', async () => {
    getPublicOrgsBatch.mockResolvedValueOnce(new Map([['123456789', notFound]]));
    resolveCoveringFilingEins.mockResolvedValueOnce(new Map()); // junk EIN, no resolution
    const [row] = await fetchPortfolio(['123456789']);
    expect(row.status).toBe('not-found');
    expect(row.coveringEin).toBeNull();
    expect(readOrgsFromMirror).not.toHaveBeenCalled();
  });

  it('prefers the already-fetched (full-freshness) result when the covering EIN is also an entered EIN', async () => {
    getPublicOrgsBatch.mockResolvedValueOnce(
      new Map([
        ['066000798', found(org({ ein: '066000798', name: 'State of Connecticut' }))],
        ['060772160', notFound],
      ])
    );
    resolveCoveringFilingEins.mockResolvedValueOnce(new Map([['060772160', '066000798']]));

    const rows = await fetchPortfolio(['066000798', '060772160']);
    // 066000798 already had an org — must not be re-read from the mirror.
    expect(readOrgsFromMirror).not.toHaveBeenCalled();
    expect(rows.find((r) => r.ein === '060772160')?.coveringEin).toBe('066000798');
    expect(rows.find((r) => r.ein === '060772160')?.orgName).toBe('State of Connecticut');
  });

  it('still resolves a component EIN that came back budget-exhausted (mirror read is free)', async () => {
    getPublicOrgsBatch.mockResolvedValueOnce(new Map([['060772160', unavailable]]));
    resolveCoveringFilingEins.mockResolvedValueOnce(new Map([['060772160', '066000798']]));
    readOrgsFromMirror.mockResolvedValueOnce(
      new Map([['066000798', org({ ein: '066000798', name: 'State of Connecticut' })]])
    );

    const [row] = await fetchPortfolio(['060772160']);
    expect(row.status).toBe('found');
    expect(row.coveringEin).toBe('066000798');
  });

  it('keeps a budget-exhausted row as an error when the covering filing is not in the mirror', async () => {
    getPublicOrgsBatch.mockResolvedValueOnce(new Map([['000000009', unavailable]]));
    resolveCoveringFilingEins.mockResolvedValueOnce(new Map([['000000009', '000000010']]));
    readOrgsFromMirror.mockResolvedValueOnce(new Map()); // parent absent from mirror
    const [row] = await fetchPortfolio(['000000009']);
    expect(row.status).toBe('error');
    expect(row.coveringEin).toBeNull();
  });

  it('keeps a not-found row as not-found when the covering filing is not in the mirror', async () => {
    getPublicOrgsBatch.mockResolvedValueOnce(new Map([['000000009', notFound]]));
    resolveCoveringFilingEins.mockResolvedValueOnce(new Map([['000000009', '000000010']]));
    readOrgsFromMirror.mockResolvedValueOnce(new Map());
    const [row] = await fetchPortfolio(['000000009']);
    expect(row.status).toBe('not-found');
    expect(row.coveringEin).toBeNull();
  });

  it('preserves input order and returns exactly one row per entered EIN, including duplicates', async () => {
    getPublicOrgsBatch.mockResolvedValueOnce(
      new Map([
        ['000000001', found(org({ ein: '000000001', name: 'A' }))],
        ['000000002', notFound],
      ])
    );
    const rows = await fetchPortfolio(['000000002', '000000001', '000000002']);
    expect(rows.map((r) => r.ein)).toEqual(['000000002', '000000001', '000000002']);
  });

  it('returns all error rows if the batch lookup throws', async () => {
    getPublicOrgsBatch.mockRejectedValueOnce(new Error('FAC down'));
    const rows = await fetchPortfolio(['000000001', '000000002']);
    expect(rows.map((r) => r.status)).toEqual(['error', 'error']);
    expect(resolveCoveringFilingEins).not.toHaveBeenCalled();
  });
});
