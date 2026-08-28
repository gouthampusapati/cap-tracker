import { describe, it, expect } from 'vitest';
import { pickFirmName, stateName } from '../lib/auditors';

describe('pickFirmName', () => {
  it('picks the most frequent spelling', () => {
    const { primary } = pickFirmName([
      { name: 'CliftonLarsonAllen LLP', year: '2021' },
      { name: 'CliftonLarsonAllen LLP', year: '2022' },
      { name: 'CLIFTONLARSONALLEN', year: '2020' },
    ]);
    expect(primary).toBe('CliftonLarsonAllen LLP');
  });

  it('tie-breaks on the most recent audit year', () => {
    const { primary } = pickFirmName([
      { name: 'Old Name PC', year: '2018' },
      { name: 'New Name LLP', year: '2024' },
    ]);
    expect(primary).toBe('New Name LLP');
  });

  it('returns the losers as alts, most-common first', () => {
    const { primary, alts } = pickFirmName([
      { name: 'A', year: '2022' },
      { name: 'A', year: '2023' },
      { name: 'B', year: '2021' },
      { name: 'C', year: '2020' },
      { name: 'C', year: '2019' },
    ]);
    expect(primary).toBe('A');
    expect(alts).toEqual(['C', 'B']);
  });

  it('ignores blank / whitespace-only names', () => {
    const { primary } = pickFirmName([
      { name: '  ', year: '2023' },
      { name: '', year: '2022' },
      { name: 'Real Firm', year: '2021' },
    ]);
    expect(primary).toBe('Real Firm');
  });

  it('returns empty when there is nothing usable', () => {
    expect(pickFirmName([{ name: null, year: '2020' }])).toEqual({ primary: '', alts: [] });
    expect(pickFirmName([])).toEqual({ primary: '', alts: [] });
  });
});

describe('stateName', () => {
  it('maps codes to names, case-insensitively', () => {
    expect(stateName('TX')).toBe('Texas');
    expect(stateName('tx')).toBe('Texas');
    expect(stateName('DC')).toBe('District of Columbia');
    expect(stateName('PR')).toBe('Puerto Rico');
  });
  it('returns null for junk / missing', () => {
    expect(stateName('ZZ')).toBeNull();
    expect(stateName('')).toBeNull();
    expect(stateName(null)).toBeNull();
  });
});
