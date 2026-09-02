/**
 * Pass-through entity name matching.
 *
 * FAC's passthrough.csv identifies the pass-through of a subaward by a
 * FREE-TEXT name only — no EIN, no UEI (passthrough_id is the *sub's*
 * own award number, useless for entity matching). So linking a
 * pass-through back to an audited organization is name-to-name string
 * matching.
 *
 * The match is deliberately EXACT-ONLY on a normalized, token-sorted key.
 * Loose (token-subset) fuzzy matching was tried and cut: org names share
 * too many structural tokens ("COUNTY", "CITY OF", "HOUSING AUTHORITY",
 * "SCHOOL DISTRICT", "UNIVERSITY"), so a short generic pass-through name
 * is a subset of many unrelated orgs and would mis-attribute one
 * entity's subrecipient portfolio to another. This feeds a cold-email
 * list — a confidently-wrong count is worse than a blank one.
 *
 * Shared by:
 *   - scripts/build-passthrough-summary.mjs  (groups passthrough.csv by
 *     normPassthroughName -> fac_mirror_passthrough_summary.norm_name)
 *   - scripts/export-outreach-list.mjs       (resolves each org_name)
 *
 * Keep the two in lockstep by importing from here — do not reimplement.
 * The stored norm_name form is an API: changing normPassthroughName
 * requires rebuilding fac_mirror_passthrough_summary.
 */

const NOISE =
  /\b(INCORPORATED|INC|LLC|LLP|LP|LTD|CORP|CORPORATION|COMPANY|FOUNDATION|FDN|NONPROFIT|NON PROFIT)\b/g;
const STOP = /\b(THE|OF|FOR|A|AN)\b/g; // NB: "AND" deliberately kept

const ABBR = [
  [/\bDEPT\b/g, 'DEPARTMENT'],
  [/\bDIV\b/g, 'DIVISION'],
  [/\bUNIV\b/g, 'UNIVERSITY'],
  [/\bCNTY\b/g, 'COUNTY'],
  [/\bCMTY\b/g, 'COMMUNITY'],
  [/\bSVCS?\b/g, 'SERVICES'],
  [/\bAUTH\b/g, 'AUTHORITY'],
];

// US state / territory names (+ 2-letter codes) — stripped ONLY when
// they trail a name that is still >= 3 tokens without them. That keeps
// distinctive long names aligned when a subrecipient tacks on the state
// ("SCHOOL DISTRICT OF PALM BEACH COUNTY FLORIDA" -> the auditee's own
// spelling) while NOT collapsing short ambiguous names — "HENRY COUNTY
// IOWA" and "HENRY COUNTY GA" are different entities and must stay so.
const US_STATES = new Set(
  (
    'ALABAMA ALASKA ARIZONA ARKANSAS CALIFORNIA COLORADO CONNECTICUT DELAWARE FLORIDA GEORGIA ' +
    'HAWAII IDAHO ILLINOIS INDIANA IOWA KANSAS KENTUCKY LOUISIANA MAINE MARYLAND MASSACHUSETTS ' +
    'MICHIGAN MINNESOTA MISSISSIPPI MISSOURI MONTANA NEBRASKA NEVADA OHIO OKLAHOMA OREGON ' +
    'PENNSYLVANIA TENNESSEE TEXAS UTAH VERMONT VIRGINIA WASHINGTON WISCONSIN WYOMING ' +
    'AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV OH OK OR PA TN TX UT VT VA WA WI WY'
  ).split(' ')
);

/**
 * Normalize a funder / organization name to a match key: uppercase,
 * punctuation to spaces, "&" -> "AND", expand safe abbreviations, drop
 * entity-type noise + stopwords, drop a trailing state name (only off
 * names that stay >= 3 tokens), then SORT the remaining tokens (so
 * "BRISTOL COUNTY" == "COUNTY OF BRISTOL"). Returns '' for junk input.
 */
export function normPassthroughName(s) {
  let v = String(s ?? '')
    .toUpperCase()
    .replace(/&/g, ' AND ')
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
  if (!v || v === 'GSA MIGRATION' || v === 'N A' || v === 'NA' || v === 'NONE' || v === 'UNKNOWN') {
    return '';
  }
  for (const [re, to] of ABBR) v = v.replace(re, to);
  v = v.replace(NOISE, ' ').replace(STOP, ' ');
  let toks = v.split(/\s+/).filter(Boolean);
  while (toks.length > 3 && US_STATES.has(toks[toks.length - 1])) toks.pop();
  return toks.sort().join(' ');
}

/**
 * Build the exact-match lookup over summary rows (each needs a
 * `norm_name`). `rank` breaks ties when two rows share a norm_name
 * (default: higher `subrecipient_count_all`).
 */
export function buildPassthroughIndex(rows, rank = (r) => Number(r.subrecipient_count_all ?? 0)) {
  const byNorm = new Map();
  for (const r of rows) {
    if (!r.norm_name) continue;
    const prev = byNorm.get(r.norm_name);
    if (!prev || rank(r) > rank(prev)) byNorm.set(r.norm_name, r);
  }
  return { byNorm };
}

/**
 * Resolve an organization name to a pass-through summary row, or null.
 * Returns { row, matchType: 'exact' }.
 */
export function matchPassthroughName(orgName, index) {
  const key = normPassthroughName(orgName);
  if (!key) return null;
  const row = index.byNorm.get(key);
  return row ? { row, matchType: 'exact' } : null;
}
