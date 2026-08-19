/**
 * The § 200.521(d) management-decision clock: a pass-through entity must
 * issue a management decision on a subrecipient's audit finding within
 * six months of the FAC accepting the audit report.
 *
 * IMPORTANT — whose deadline this is: this is NOT the audited
 * organization's own obligation. It's the deadline for whichever
 * pass-through entity funded them. Every caller of this module is
 * responsible for labeling it that way; this module only does the date
 * math. Getting that framing backwards would be a real compliance error
 * on a site whose entire value is being right about the rules.
 *
 * Shared between the org page (one deadline per audit report) and the
 * portfolio view (same computation, one row per org) so the two can't
 * drift into disagreeing with each other.
 */

export type ManagementDecisionState = 'future' | 'due-soon' | 'past';

export interface ManagementDecisionDeadline {
  /** The FAC's own acceptance date, unchanged, for display/citation. */
  acceptedDate: string;
  /** acceptedDate + 6 calendar months. */
  deadline: Date;
  /** deadline as "YYYY-MM-DD". */
  deadlineLabel: string;
  /** Negative if the deadline has passed. */
  daysFromToday: number;
  /** future: >30 days out. due-soon: 0-30 days out. past: already passed. */
  state: ManagementDecisionState;
}

const DUE_SOON_WINDOW_DAYS = 30;

/**
 * Returns null (render nothing, per the ground rules) when the input is
 * missing or unparseable — never guess at a compliance deadline.
 */
export function computeManagementDecisionDeadline(
  facAcceptedDate: string | null | undefined,
  now: Date = new Date()
): ManagementDecisionDeadline | null {
  if (!facAcceptedDate) return null;

  // FAC dates are "YYYY-MM-DD" with no time/zone component. Parsing as
  // UTC midnight avoids the deadline shifting by a day depending on the
  // server's local timezone.
  const accepted = new Date(`${facAcceptedDate}T00:00:00Z`);
  if (Number.isNaN(accepted.getTime())) return null;

  const deadline = new Date(accepted);
  deadline.setUTCMonth(deadline.getUTCMonth() + 6);

  const msPerDay = 24 * 60 * 60 * 1000;
  const daysFromToday = Math.round((deadline.getTime() - now.getTime()) / msPerDay);

  const state: ManagementDecisionState =
    daysFromToday < 0 ? 'past' : daysFromToday <= DUE_SOON_WINDOW_DAYS ? 'due-soon' : 'future';

  return {
    acceptedDate: facAcceptedDate,
    deadline,
    deadlineLabel: deadline.toISOString().slice(0, 10),
    daysFromToday,
    state,
  };
}

/**
 * Across every report for an org, the single soonest-upcoming (or, if
 * none upcoming, most-recently-past) deadline — used for portfolio
 * sorting, where one row needs one sortable date per org rather than one
 * per report.
 */
export function soonestDeadline(
  deadlines: Array<ManagementDecisionDeadline | null>
): ManagementDecisionDeadline | null {
  const valid = deadlines.filter((d): d is ManagementDecisionDeadline => d !== null);
  if (valid.length === 0) return null;

  const upcoming = valid.filter((d) => d.state !== 'past').sort((a, b) => a.daysFromToday - b.daysFromToday);
  if (upcoming.length > 0) return upcoming[0];

  // Nothing upcoming — surface the most recently passed deadline instead
  // of silently returning nothing.
  return valid.sort((a, b) => b.daysFromToday - a.daysFromToday)[0];
}
