import { describe, it, expect } from 'vitest';
import {
  normPassthroughName,
  buildPassthroughIndex,
  matchPassthroughName,
} from '../scripts/lib/passthrough-name.mjs';

describe('normPassthroughName', () => {
  it('is order-independent (sorted tokens)', () => {
    expect(normPassthroughName('Bristol County')).toBe(normPassthroughName('COUNTY OF BRISTOL'));
  });

  it('strips a trailing state off a distinctive (>=3-token) name', () => {
    expect(normPassthroughName('School District of Palm Beach County, Florida')).toBe(
      normPassthroughName('School District of Palm Beach County')
    );
  });

  it('does NOT strip a trailing state off a short name (same-name-different-state collision)', () => {
    expect(normPassthroughName('Henry County, Iowa')).not.toBe(normPassthroughName('Henry County, GA'));
  });

  it('keeps "State of X" intact', () => {
    expect(normPassthroughName('State of Arizona')).toBe('ARIZONA STATE');
  });

  it('expands safe abbreviations and drops "the"/"of"', () => {
    expect(normPassthroughName('CALIFORNIA DEPT OF EDUCATION')).toBe(
      normPassthroughName('California Department of Education')
    );
    expect(normPassthroughName('The University of Chicago')).toBe('CHICAGO UNIVERSITY');
  });

  it('folds "&" to "and" and normalizes punctuation', () => {
    expect(normPassthroughName('Health & Human Services')).toBe(
      normPassthroughName('Health and Human Services')
    );
  });

  it('returns "" for junk / placeholder values', () => {
    for (const junk of ['', '  ', 'N/A', 'GSA_MIGRATION', 'None', 'unknown']) {
      expect(normPassthroughName(junk)).toBe('');
    }
  });
});

describe('matchPassthroughName', () => {
  const index = buildPassthroughIndex([
    { norm_name: normPassthroughName('California Department of Education'), sample_name: 'CA DOE', subrecipient_count_all: 900 },
    { norm_name: normPassthroughName('City of Detroit'), sample_name: 'City of Detroit', subrecipient_count_all: 41 },
    { norm_name: normPassthroughName('County of Fresno'), sample_name: 'County of Fresno', subrecipient_count_all: 30 },
  ]);

  it('matches exactly across spelling variants', () => {
    expect(matchPassthroughName('CALIFORNIA DEPT. OF EDUCATION', index)?.row.sample_name).toBe('CA DOE');
    expect(matchPassthroughName('the city of detroit', index)?.row.sample_name).toBe('City of Detroit');
    expect(matchPassthroughName('Fresno, County of', index)?.row.sample_name).toBe('County of Fresno');
  });

  it('does NOT fuzzy-match a different entity that merely shares tokens', () => {
    // the county's housing authority is not the county government
    expect(matchPassthroughName('Housing Authority of Fresno County', index)).toBeNull();
  });

  it('returns null for an unknown name', () => {
    expect(matchPassthroughName('Some Tiny Nonprofit Nobody Funds', index)).toBeNull();
  });
});
