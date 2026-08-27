import { describe, it, expect } from 'vitest';
import {
  mapCategory,
  isYes,
  isYesNo,
  parsePriorRefs,
  parseGaapResults,
  entityTypeLabel,
  agencyPrefixLabel,
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
    is_other_matters: 'N',
    is_other_findings: 'N',
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

  it('OR-merges is_modified_opinion, is_other_matters, and is_other_findings across award rows', () => {
    const out = dedupeFindingRows([
      row({
        award_reference: 'A1',
        is_modified_opinion: 'N',
        is_other_matters: 'Y',
        is_other_findings: 'N',
      }),
      row({
        award_reference: 'A2',
        is_modified_opinion: 'Y',
        is_other_matters: 'N',
        is_other_findings: 'Y',
      }),
    ]);
    expect(out[0].is_modified_opinion).toBe('Y');
    expect(out[0].is_other_matters).toBe('Y');
    expect(out[0].is_other_findings).toBe('Y');
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

describe('isYesNo', () => {
  // general's boolean fields use "Yes"/"No", a different convention
  // from findings' "Y"/"N" (isYes above) — confirmed live 2026-08 across
  // 300+ rows per field. Mixing these up is a real bug that already
  // shipped once (is_low_risk_auditee compared against 'Y' and was
  // always false) before this test existed.
  it('treats only "Yes" (case-insensitive) as true', () => {
    expect(isYesNo('Yes')).toBe(true);
    expect(isYesNo('yes')).toBe(true);
    expect(isYesNo('YES')).toBe(true);
    expect(isYesNo('No')).toBe(false);
    expect(isYesNo('')).toBe(false);
    expect(isYesNo(null)).toBe(false);
    expect(isYesNo(undefined)).toBe(false);
  });

  it('does not treat bare "Y" as true — that would silently paper over the isYes/isYesNo mixup', () => {
    expect(isYesNo('Y')).toBe(false);
  });
});

describe('parseGaapResults', () => {
  it('parses a single clean opinion', () => {
    const r = parseGaapResults('unmodified_opinion');
    expect(r.types).toEqual(['unmodified_opinion']);
    expect(r.worst).toBe('unmodified_opinion');
    expect(r.worstLabel).toBe('Unmodified Opinion');
  });

  it('picks the worst opinion when a report has multiple opinion units', () => {
    // Confirmed live: this exact combination is real production data,
    // not a hypothetical edge case.
    const r = parseGaapResults('unmodified_opinion,qualified_opinion');
    expect(r.types).toEqual(['unmodified_opinion', 'qualified_opinion']);
    expect(r.worst).toBe('qualified_opinion');
  });

  it('ranks disclaimer_of_opinion as worse than adverse_opinion', () => {
    expect(parseGaapResults('adverse_opinion,disclaimer_of_opinion').worst).toBe(
      'disclaimer_of_opinion'
    );
  });

  it('handles the non-GAAP-basis value distinctly from a missing value', () => {
    expect(parseGaapResults('not_gaap').worst).toBe('not_gaap');
    expect(parseGaapResults('').worst).toBeNull();
    expect(parseGaapResults(null).worst).toBeNull();
  });
});

describe('entityTypeLabel', () => {
  it('labels every entity_type value confirmed live', () => {
    expect(entityTypeLabel('state')).toBe('State Government');
    expect(entityTypeLabel('local')).toBe('Local Government');
    expect(entityTypeLabel('higher-ed')).toBe('Higher Education');
    expect(entityTypeLabel('non-profit')).toBe('Non-Profit');
    expect(entityTypeLabel('tribal')).toBe('Tribal Government');
  });

  it('returns null for unknown/missing rather than a not-useful label', () => {
    expect(entityTypeLabel('unknown')).toBeNull();
    expect(entityTypeLabel('')).toBeNull();
    expect(entityTypeLabel(null)).toBeNull();
  });
});

describe('agencyPrefixLabel', () => {
  it('appends the verified agency name in brackets for a mapped code', () => {
    expect(agencyPrefixLabel('14')).toBe(
      '14 [Department of Housing and Urban Development]'
    );
    expect(agencyPrefixLabel('93')).toBe(
      '93 [Department of Health and Human Services]'
    );
  });

  it('falls back to the raw code for a deliberately unmapped/ambiguous prefix', () => {
    // 05/95 (HIDTA, indistinguishable), 06 (no data), 70/90/92 (mixed
    // evidence), 99 (FAC's own "Other Federal Assistance" catch-all) —
    // see AGENCY_PREFIX_LABELS' comment in lib/fac-api.ts.
    expect(agencyPrefixLabel('05')).toBe('05');
    expect(agencyPrefixLabel('95')).toBe('95');
    expect(agencyPrefixLabel('06')).toBe('06');
    expect(agencyPrefixLabel('99')).toBe('99');
  });

  it('returns null for missing input', () => {
    expect(agencyPrefixLabel(null)).toBeNull();
    expect(agencyPrefixLabel(undefined)).toBeNull();
    expect(agencyPrefixLabel('')).toBeNull();
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
