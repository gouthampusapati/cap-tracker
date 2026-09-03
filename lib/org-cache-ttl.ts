/**
 * Filing-aware cache TTL for public org data. Pulled into its own
 * module (no `db`/`server-only` imports) so it's a pure, directly unit
 * testable function — lib/public-org-cache.ts pulls in `server-only`
 * via lib/db, which vitest can't load outside a Server Component
 * context.
 *
 * TTL is filing-aware, not a flat window — a Single Audit is an annual,
 * point-in-time filing; once FAC accepts a report it doesn't change
 * retroactively, and FAC's own advanced search only refreshes once
 * daily (fac.gov/dissemination/search). Re-checking every 24h regardless
 * was already tighter than FAC's own pipeline and, for an org mid-cycle
 * with no new filing plausible for months, pure waste against the
 * shared budget (lib/fac-budget.ts). See
 * FAC_API_Improvement_Sprint_Checklist.md, Sprint 3.
 */

// An org not near its next expected filing: safe to trust the cache for
// a while, since nothing about a past-accepted report can retroactively
// change and a new one isn't plausible yet.
export const DEFAULT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// An EIN with zero audit history on file. Even less likely to change
// overnight than an existing org gaining a new report — a brand-new
// Single Audit filer is rare and, being genuinely new to FAC, in no
// hurry either way. Longer than DEFAULT_MAX_AGE_MS specifically because
// there's no per-org filing-deadline signal to shorten it back down for
// (no reports on file means no fy_end_date to compute from).
export const NOT_FOUND_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// An org whose next filing is plausibly due soon (see
// nextExpectedFilingDeadline). This was 24h — but the bulk mirror only
// refreshes weekly, so between syncs EVERY near-deadline org's mirror
// copy is >24h old and falls through to a live FAC fetch. In September
// (12/31 and 9/30 fiscal-year-ends both filing) that cohort is huge, and
// a crawler walking the sitemap turned it into a sustained ~2k calls/hr
// against the shared quota (Sep 2026). The 24h window was optimising for
// a faster path that's too expensive to actually take at scale, and it
// bought nothing real: the mirror IS the data source and it's weekly, so
// a just-filed audit for a near-deadline org can't surface faster than
// the next Monday sync anyway. 6 days keeps the weekly-synced copy
// trusted for the whole cycle (0 FAC calls) while still re-checking a day
// sooner than DEFAULT if a sync is ever missed.
export const NEAR_DEADLINE_MAX_AGE_MS = 6 * 24 * 60 * 60 * 1000; // 6 days

// How far around the computed statutory deadline counts as "plausibly
// due soon" — wide on both sides: some auditees file early, and FAC
// processing/acceptance lag after an on-time submission is real and
// unpredictable, so the window has to cover after the deadline too, not
// just approach it.
const DEADLINE_WINDOW_MS = 60 * 24 * 60 * 60 * 1000; // ±60 days

// 2 CFR 200.512(a)(1): the Single Audit reporting package is due to FAC
// no later than 9 months after the end of the audit period.
const STATUTORY_DEADLINE_MONTHS_AFTER_FYE = 9;

/**
 * Adds `months` to a UTC date without JS Date's day-of-month overflow
 * trap — e.g. Dec 31 + 9 months via plain setUTCMonth lands on Oct 1
 * (September only has 30 days, so day 31 rolls into the next month)
 * instead of Sep 30. Confirmed live in Node before relying on it: this
 * is exactly the kind of silent-wrong-by-a-day bug this app's whole
 * discipline is about catching before it ships, not after.
 */
function addMonthsClamped(date: Date, months: number): Date {
  const day = date.getUTCDate();
  const d = new Date(date);
  d.setUTCDate(1); // park on a day that exists in every month first
  d.setUTCMonth(d.getUTCMonth() + months);
  const daysInTargetMonth = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, daysInTargetMonth));
  return d;
}

/**
 * Estimates when an org's NEXT Single Audit (the one after the most
 * recent report on file) is statutorily due, from that most recent
 * report's fiscal-year-end date. Assumes an annual cycle — FAC's public
 * fields don't reliably distinguish an org on a biennial cycle from
 * one that simply hasn't filed since, and assuming annual only ever
 * narrows the "check sooner" window too early for a biennial filer, not
 * too late, which is the safe direction to be wrong in here.
 *
 * Returns null for an unparseable date rather than guessing — callers
 * fall back to DEFAULT_MAX_AGE_MS in that case, same as an org with no
 * deadline signal at all.
 */
export function nextExpectedFilingDeadline(mostRecentFyEndDate: string): Date | null {
  const fyEnd = new Date(`${mostRecentFyEndDate}T00:00:00Z`);
  if (Number.isNaN(fyEnd.getTime())) return null;

  const nextFyEnd = new Date(fyEnd);
  nextFyEnd.setUTCFullYear(nextFyEnd.getUTCFullYear() + 1);

  return addMonthsClamped(nextFyEnd, STATUTORY_DEADLINE_MONTHS_AFTER_FYE);
}

/**
 * The effective cache TTL for one org, given what (if anything) is
 * already cached for it. `now` is a parameter (not Date.now() read
 * inline) purely so this stays a pure, directly testable function.
 */
export function effectiveMaxAgeMs(
  found: boolean,
  mostRecentFyEndDate: string | null | undefined,
  now: number
): number {
  if (!found) return NOT_FOUND_MAX_AGE_MS;

  const deadline = mostRecentFyEndDate ? nextExpectedFilingDeadline(mostRecentFyEndDate) : null;
  if (!deadline) return DEFAULT_MAX_AGE_MS;

  const distanceMs = Math.abs(now - deadline.getTime());
  return distanceMs <= DEADLINE_WINDOW_MS ? NEAR_DEADLINE_MAX_AGE_MS : DEFAULT_MAX_AGE_MS;
}
