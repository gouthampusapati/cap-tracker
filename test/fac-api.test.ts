import { describe, it, expect } from 'vitest';
import {
  mapCategory,
  isYes,
  isYesNo,
  parsePriorRefs,
  parseGaapResults,
  entityTypeLabel,
  agencyPrefixLabel,
  agencyName,
  awardOpinionLabel,
  resolveClusterName,
  formatAln,
  normalizeAwards,
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

describe('agencyName', () => {
  it('returns the bare name for a mapped prefix, no bracket wrapper', () => {
    expect(agencyName('21')).toBe('Department of the Treasury');
    expect(agencyName('84')).toBe('Department of Education');
  });
  it('returns null for an unmapped prefix or missing input', () => {
    expect(agencyName('05')).toBeNull();
    expect(agencyName('')).toBeNull();
    expect(agencyName(null)).toBeNull();
  });
});

describe('awardOpinionLabel', () => {
  // federal_awards.audit_report_type domain confirmed live: exactly
  // U/Q/A/D exist (S, GC, UM return zero rows).
  it('spells out every real opinion letter', () => {
    expect(awardOpinionLabel('U')).toBe('Unmodified Opinion');
    expect(awardOpinionLabel('Q')).toBe('Qualified Opinion');
    expect(awardOpinionLabel('A')).toBe('Adverse Opinion');
    expect(awardOpinionLabel('D')).toBe('Disclaimer of Opinion');
    expect(awardOpinionLabel('u')).toBe('Unmodified Opinion');
  });
  it('returns null for blank (every non-major award) or unknown', () => {
    expect(awardOpinionLabel('')).toBeNull();
    expect(awardOpinionLabel(null)).toBeNull();
    expect(awardOpinionLabel('X')).toBeNull();
  });
});

describe('resolveClusterName', () => {
  const r = (o: Partial<Record<string, string>>) => ({
    cluster_name: '',
    other_cluster_name: '',
    state_cluster_name: '',
    ...o,
  });
  it('treats N/A, GSA_MIGRATION and empty as unclustered', () => {
    expect(resolveClusterName(r({ cluster_name: 'N/A' }))).toBeNull();
    expect(resolveClusterName(r({ cluster_name: 'GSA_MIGRATION' }))).toBeNull();
    expect(resolveClusterName(r({ cluster_name: '' }))).toBeNull();
  });
  it('passes through a normal cluster name', () => {
    expect(resolveClusterName(r({ cluster_name: 'RESEARCH AND DEVELOPMENT' }))).toBe(
      'RESEARCH AND DEVELOPMENT'
    );
  });
  it('resolves the two catch-all cluster values from their sibling column', () => {
    expect(
      resolveClusterName(
        r({ cluster_name: 'OTHER CLUSTER NOT LISTED ABOVE', other_cluster_name: 'NON-R&D' })
      )
    ).toBe('NON-R&D');
    expect(
      resolveClusterName(
        r({ cluster_name: 'STATE CLUSTER', state_cluster_name: 'FOSTER CARE AND ADOPTION CLUSTER' })
      )
    ).toBe('FOSTER CARE AND ADOPTION CLUSTER');
  });
  it('keeps the catch-all label if the sibling column is empty', () => {
    expect(resolveClusterName(r({ cluster_name: 'STATE CLUSTER' }))).toBe('STATE CLUSTER');
  });
});

describe('formatAln', () => {
  it('joins prefix and extension', () => {
    expect(formatAln('21', '027')).toBe('21.027');
    expect(formatAln('10', 'U01')).toBe('10.U01');
  });
  it('handles a missing extension or prefix', () => {
    expect(formatAln('93', '')).toBe('93');
    expect(formatAln('', '027')).toBe('027');
  });
});

describe('normalizeAwards', () => {
  const raw = (o: Partial<Record<string, unknown>> = {}): any => ({
    report_id: '2024-12-GSAFAC-0000376537',
    audit_year: '2024',
    award_reference: 'AWARD-00007',
    federal_agency_prefix: '15',
    federal_award_extension: '504',
    additional_award_identification: '',
    federal_program_name: 'Water Recycling and Desalination Construction Programs',
    amount_expended: 3763605,
    cluster_name: 'N/A',
    other_cluster_name: '',
    state_cluster_name: '',
    cluster_total: 0,
    federal_program_total: 3763605,
    is_major: 'Y',
    audit_report_type: 'A',
    is_loan: 'N',
    loan_balance: '',
    is_direct: 'Y',
    is_passthrough_award: 'N',
    passthrough_amount: null,
    findings_count: 1,
    ...o,
  });

  it('maps a real Cheney 2024 major-program row', () => {
    const [a] = normalizeAwards([raw()]);
    expect(a.aln).toBe('15.504');
    expect(a.agencyPrefix).toBe('15');
    expect(a.isMajor).toBe(true);
    expect(a.majorProgramOpinion).toBe('Adverse Opinion');
    expect(a.clusterName).toBeNull();
    expect(a.isDirect).toBe(true);
    expect(a.isPassthrough).toBe(false);
    expect(a.findingsCount).toBe(1);
  });

  it('never sets a major-program opinion for a non-major award, even if the letter is present', () => {
    // audit_report_type is blank for non-major awards in live data, but
    // guard against a stray value rather than trust it.
    const [a] = normalizeAwards([raw({ is_major: 'N', audit_report_type: 'U' })]);
    expect(a.isMajor).toBe(false);
    expect(a.majorProgramOpinion).toBeNull();
  });

  it('parses loan_balance as a number, and empty string as null (not 0)', () => {
    expect(normalizeAwards([raw({ is_loan: 'Y', loan_balance: '4136834' })])[0].loanBalance).toBe(
      4136834
    );
    expect(normalizeAwards([raw()])[0].loanBalance).toBeNull();
  });

  it('carries a numeric passthrough_amount and tolerates null', () => {
    expect(
      normalizeAwards([raw({ is_passthrough_award: 'Y', passthrough_amount: 633506 })])[0]
        .passthroughAmount
    ).toBe(633506);
    expect(normalizeAwards([raw()])[0].passthroughAmount).toBeNull();
  });

  it('treats is_direct and is_passthrough as independent, not a binary', () => {
    const [a] = normalizeAwards([raw({ is_direct: 'Y', is_passthrough_award: 'Y' })]);
    expect(a.isDirect).toBe(true);
    expect(a.isPassthrough).toBe(true);
  });

  it('handles an empty list', () => {
    expect(normalizeAwards([])).toEqual([]);
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
