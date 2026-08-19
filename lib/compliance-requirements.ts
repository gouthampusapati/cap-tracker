/**
 * The FAC's compliance requirement letters, as used in the `type_requirement`
 * field on findings. Confirmed against the FAC's own SF-SAC documentation
 * (fac.gov/audit-resources/sf-sac/federal-awards-audit-findings/) rather
 * than assumed from the pre-existing REQUIREMENT_CATEGORIES map in
 * lib/fac-api.ts — that map turned out to already be accurate, but this
 * was checked, not presumed. D and K are officially "Reserved" (retired
 * letters, not currently assignable); O is explicitly invalid ("Entering
 * 'O' will invalidate your workbook"), which is why the letters here skip
 * straight from N to P.
 *
 * `slug` is the anchor id on /guide/compliance-requirements — the one
 * page every finding on every org page links to, letter by letter.
 */
export const REQUIREMENT_INFO: Record<string, { name: string; slug: string }> = {
  A: { name: 'Activities Allowed or Unallowed', slug: 'activities-allowed' },
  B: { name: 'Allowable Costs / Cost Principles', slug: 'allowable-costs' },
  C: { name: 'Cash Management', slug: 'cash-management' },
  E: { name: 'Eligibility', slug: 'eligibility' },
  F: { name: 'Equipment and Real Property Management', slug: 'equipment-and-real-property' },
  G: { name: 'Matching, Level of Effort, Earmarking', slug: 'matching-level-of-effort-earmarking' },
  H: { name: 'Period of Performance', slug: 'period-of-performance' },
  I: { name: 'Procurement and Suspension and Debarment', slug: 'procurement' },
  J: { name: 'Program Income', slug: 'program-income' },
  L: { name: 'Reporting', slug: 'reporting' },
  M: { name: 'Subrecipient Monitoring', slug: 'subrecipient-monitoring' },
  N: { name: 'Special Tests and Provisions', slug: 'special-tests-and-provisions' },
  P: { name: 'Other', slug: 'other' },
};

export const REQUIREMENT_LETTER_ORDER = ['A', 'B', 'C', 'E', 'F', 'G', 'H', 'I', 'J', 'L', 'M', 'N', 'P'];

/** Extracts valid requirement letters from a raw type_requirement value
 * like "BGL" or "I", in the order they appear, ignoring anything that
 * isn't a known letter. */
export function parseRequirementLetters(typeRequirement: string | null | undefined): string[] {
  if (!typeRequirement) return [];
  const seen = new Set<string>();
  const letters: string[] = [];
  for (const ch of typeRequirement.toUpperCase()) {
    if (REQUIREMENT_INFO[ch] && !seen.has(ch)) {
      seen.add(ch);
      letters.push(ch);
    }
  }
  return letters;
}

export interface RequirementLink {
  href: string;
  label: string;
}

/**
 * The link a finding shows: goes to the first letter's anchor on
 * /guide/compliance-requirements, labeled with every matched letter's
 * name (a multi-letter finding like "BGL" names all three, per spec).
 * Returns null only when the raw value has no recognizable letters at
 * all (shouldn't happen with real FAC data, but don't guess).
 */
export function getRequirementLink(typeRequirement: string | null | undefined): RequirementLink | null {
  const letters = parseRequirementLetters(typeRequirement);
  if (letters.length === 0) return null;

  const names = letters.map((l) => REQUIREMENT_INFO[l].name);
  const firstSlug = REQUIREMENT_INFO[letters[0]].slug;

  return {
    href: `/guide/compliance-requirements#${firstSlug}`,
    label: names.length > 1 ? `About ${names.join(', ')} →` : `About ${names[0]} →`,
  };
}
