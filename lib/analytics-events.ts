/**
 * Custom Vercel Analytics events — Task 4's instrumentation. Every
 * decision after this (pricing, audience) depends on this data, per the
 * brief, so what gets tracked and why is documented here rather than
 * scattered across call sites.
 *
 * Ground rule: never send an EIN, org name, or anything else that could
 * identify what a specific visitor looked at — only counts and buckets.
 */

/** Fired when a link on an org page (header nav, a finding's requirement
 * link, or the management-decision block) is clicked, so we can tell
 * whether org-page visitors go on to the guides or the portfolio view —
 * the brief calls this out specifically as worth knowing. */
export const EVENT_ORG_PAGE_CLICKTHROUGH = 'org_page_clickthrough';

/** Fired on every /portfolio submission with the EIN count, bucketed.
 * This is the closest direct signal the brief has to the
 * recipient-vs-pass-through question it says must be answered before
 * anything is priced: one EIN suggests a recipient looking up itself,
 * twenty suggests a pass-through monitoring a portfolio. */
export const EVENT_PORTFOLIO_SUBMIT = 'portfolio_submit';

/** Fired when the homepage early-access form is submitted successfully.
 * Carries the role bucket only (recipient/passthrough/adviser/other) —
 * never the email address, per the ground rule above. This is the
 * cleanest read available on the recipient-vs-pass-through-vs-adviser
 * split everything downstream depends on. */
export const EVENT_EARLY_ACCESS_SUBMIT = 'early_access_submit';

export function bucketEinCount(count: number): string {
  if (count <= 1) return '1';
  if (count <= 5) return '2-5';
  if (count <= 20) return '6-20';
  return '21-50';
}
