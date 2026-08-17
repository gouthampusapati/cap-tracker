import { describe, it, expect } from 'vitest';
import {
  mapCategory,
  isYes,
  parsePriorRefs,
  dedupeFindingRows,
} from '../lib/fac-api';

/** Minimal FAC finding row with sensible defaults. */
function row(over: Partial<Record<string, string>> = {}): any {
  return {
    report_id: '2022-12-GSAFAC-0000000112',
    audit_year: '2022',
    reference_number: '2022-001',
    award_reference: 'AWARD-0001',
    type_requirement: 'I',
    is_material_weakness: 'N',
    is_significant_deficiency: 'N',
    is_modified_opinion: 'N',
    is_questioned_costs: 'N',
    is_repeat_finding: 'N',
    prior_finding_ref_numbers: 'N/A',
    ...over,
  };
}

describe('dedupeFindingRows', () => {
  it('collapses one finding cited against several awards', () => {
    const out = dedupeFindingRows([
      row({ award_reference: 'AWARD-0003' }),
      row({ award_reference: 'AWARD-0008' }),
    ]);

    expect(out).toHaveLength(1);
    expect(out[0].award_reference).toBe('AWARD-0003, AWARD-0008');
  });

  it('keeps distinct findings separate', () => {
    const out = dedupeFindingRows([
      row({ reference_number: '2022-001' }),
      row({ reference_number: '2022-002' }),
    ]);
    expect(out).toHaveLength(2);
  });

  it('does not merge the same reference across different reports', () => {
    const out = dedupeFindingRows([
      row({ report_id: 'A', reference_number: '2022-001' }),
      row({ report_id: 'B', reference_number: '2022-001' }),
    ]);
    expect(out).toHaveLength(2);
  });

  it('keeps a flag set if any award row carries it', () => {
    const out = dedupeFindingRows([
      row({ award_reference: 'A1', is_repeat_finding: 'N' }),
      row({ award_reference: 'A2', is_repeat_finding: 'Y' }),
    ]);
    expect(out[0].is_repeat_finding).toBe('Y');
  });

  it('prefers a real prior reference over the N/A placeholder', () => {
    const out = dedupeFindingRows([
      row({ award_reference: 'A1', prior_finding_ref_numbers: 'N/A' }),
      row({ award_reference: 'A2', prior_finding_ref_numbers: '2021-004' }),
    ]);
    expect(parsePriorRefs(out[0].prior_finding_ref_numbers)).toEqual(['2021-004']);
  });

  it('unions compliance requirement letters across award rows', () => {
    const out = dedupeFindingRows([
      row({ award_reference: 'A1', type_requirement: 'B' }),
      row({ award_reference: 'A2', type_requirement: 'L' }),
    ]);
    expect(out[0].type_requirement).toBe('BL');
  });

  it('handles an empty list', () => {
    expect(dedupeFindingRows([])).toEqual([]);
  });
});

describe('mapCategory', () => {
  it('maps the compliance requirement letters we saw in live data', () => {
    expect(mapCategory('I')).toBe('Procurement & Suspension/Debarment');
    expect(mapCategory('C')).toBe('Cash Management');
    expect(mapCategory('L')).toBe('Reporting');
    expect(mapCategory('M')).toBe('Subrecipient Monitoring');
    expect(mapCategory('B')).toBe('Cost Allowability');
  });

  it('handles multi-letter and punctuated values', () => {
    expect(mapCategory('IL')).toBe(
      'Procurement & Suspension/Debarment / Reporting'
    );
    expect(mapCategory('B,C')).toBe('Cost Allowability / Cash Management');
  });

  it('deduplicates repeated letters', () => {
    expect(mapCategory('CC')).toBe('Cash Management');
  });

  it('falls back to Other for empty or unknown values', () => {
    expect(mapCategory('')).toBe('Other');
    expect(mapCategory(null)).toBe('Other');
    expect(mapCategory(undefined)).toBe('Other');
    expect(mapCategory('Z')).toBe('Other');
  });
});

describe('isYes', () => {
  it('treats only Y as true', () => {
    expect(isYes('Y')).toBe(true);
    expect(isYes('y')).toBe(true);
    expect(isYes('N')).toBe(false);
    expect(isYes('')).toBe(false);
    expect(isYes(null)).toBe(false);
    expect(isYes(undefined)).toBe(false);
  });
});

describe('parsePriorRefs', () => {
  it('treats FAC placeholders as no prior findings', () => {
    expect(parsePriorRefs('N/A')).toEqual([]);
    expect(parsePriorRefs('n/a')).toEqual([]);
    expect(parsePriorRefs('None')).toEqual([]);
    expect(parsePriorRefs('')).toEqual([]);
    expect(parsePriorRefs(null)).toEqual([]);
  });

  it('splits real reference lists', () => {
    expect(parsePriorRefs('2022-001')).toEqual(['2022-001']);
    expect(parsePriorRefs('2022-001, 2021-003')).toEqual([
      '2022-001',
      '2021-003',
    ]);
    expect(parsePriorRefs('2022-001; 2021-003')).toEqual([
      '2022-001',
      '2021-003',
    ]);
  });
});
