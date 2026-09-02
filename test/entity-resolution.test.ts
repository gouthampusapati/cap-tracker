import { describe, it, expect } from 'vitest';
import { pickCoveringFilingEin } from '../lib/entity-resolution';

describe('pickCoveringFilingEin', () => {
  it('returns null when there are no candidates', () => {
    expect(pickCoveringFilingEin([], '123456789')).toBeNull();
  });

  it('returns the single covering filing when there is one parent', () => {
    expect(
      pickCoveringFilingEin(
        [{ parentEin: '066000798', fyEnd: '2025-06-30' }],
        '060772160'
      )
    ).toBe('066000798');
  });

  it('picks the most recent filing when a component moved between entities', () => {
    expect(
      pickCoveringFilingEin(
        [
          { parentEin: '111111111', fyEnd: '2022-12-31' },
          { parentEin: '222222222', fyEnd: '2025-12-31' },
          { parentEin: '111111111', fyEnd: '2023-12-31' },
        ],
        '987654321'
      )
    ).toBe('222222222');
  });

  it('ignores a candidate that is the component EIN itself', () => {
    expect(
      pickCoveringFilingEin(
        [
          { parentEin: '060772160', fyEnd: '2025-06-30' },
          { parentEin: '066000798', fyEnd: '2024-06-30' },
        ],
        '060772160'
      )
    ).toBe('066000798');
  });

  it('returns null when the only candidate is the component EIN itself', () => {
    expect(
      pickCoveringFilingEin([{ parentEin: '060772160', fyEnd: '2025-06-30' }], '060772160')
    ).toBeNull();
  });

  it('refuses to resolve well-known FAC placeholder EINs', () => {
    const candidates = [{ parentEin: '721563379', fyEnd: '2022-06-30' }];
    expect(pickCoveringFilingEin(candidates, '123456789')).toBeNull();
    expect(pickCoveringFilingEin(candidates, '000000000')).toBeNull();
    expect(pickCoveringFilingEin(candidates, '999999999')).toBeNull();
    expect(pickCoveringFilingEin(candidates, '111111111')).toBeNull();
    // a normal EIN still resolves
    expect(pickCoveringFilingEin(candidates, '987654321')).toBe('721563379');
  });

  it('tolerates a null fiscal-year end without crashing', () => {
    expect(
      pickCoveringFilingEin(
        [
          { parentEin: '111111111', fyEnd: null },
          { parentEin: '222222222', fyEnd: '2020-12-31' },
        ],
        '987654321'
      )
    ).toBe('222222222');
  });
});
