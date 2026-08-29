/**
 * US state / territory code -> full name. Client-safe (no imports).
 * Home for what used to live in lib/auditors-shared.ts — now shared by
 * the auditor directory and the org state-index pages, so it's not
 * auditor-specific.
 */
export const US_STATES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', DC: 'District of Columbia',
  FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois',
  IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana',
  ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota',
  MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada',
  NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York',
  NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon',
  PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota',
  TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia',
  WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
  PR: 'Puerto Rico', GU: 'Guam', VI: 'U.S. Virgin Islands', AS: 'American Samoa',
  MP: 'Northern Mariana Islands',
};

export function stateName(code: string | null | undefined): string | null {
  if (!code) return null;
  return US_STATES[code.trim().toUpperCase()] ?? null;
}

/** '' when not a recognised code; otherwise the upper-cased code. */
export function cleanStateCode(v: string | null | undefined): string {
  const s = (v ?? '').trim().toUpperCase();
  return US_STATES[s] ? s : '';
}
