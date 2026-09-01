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

/** Fired when the Founding Customer form is submitted successfully.
 * Carries the role bucket and, when the form collected them, the
 * interest level and org-count bucket — never the email address, per
 * the ground rule above. This is the cleanest read available on the
 * recipient-vs-pass-through-vs-adviser split, plus how much of the
 * qualified intent is "would pay now" vs "wants to test first". */
export const EVENT_FOUNDING_SUBMIT = 'founding_submit';

/** Fired the first time someone focuses a field in the Founding
 * Customer form (not on every keystroke). Paired with
 * EVENT_FOUNDING_SUBMIT this gives the form's start→finish completion
 * rate — the single number that says whether the qualifying questions
 * are worth their friction. */
export const EVENT_FOUNDING_FORM_START = 'founding_form_start';

/** Fired when a contextual "Monitor these organizations" CTA is
 * clicked (portfolio results today; more surfaces later). Carries the
 * surface it was clicked from, never any EIN. Tells us which page
 * actually drives commercial intent vs. which just gets traffic. */
export const EVENT_MONITOR_CTA_CLICK = 'monitor_cta_click';

/** Fired once per /pricing view. The denominator for "of people who
 * saw pricing, how many started the founding form" — worth knowing
 * separately from homepage-band conversions, which are lower intent. */
export const EVENT_PRICING_VIEW = 'pricing_view';

/** Fired once per homepage view, when the portfolio monitoring mockup
 * (app/home-portfolio-mockup.tsx) first scrolls into view. The mockup is
 * the homepage's primary product visual; this is the read on how many
 * visitors actually scroll past the hero/stat bar to the monitoring
 * story. Paired with EVENT_MONITOR_CTA_CLICK it gives the mockup-seen →
 * founding-CTA-click rate for the homepage. No EIN or org, per the
 * ground rule above. */
export const EVENT_HOME_MOCKUP_VIEW = 'home_mockup_view';

export function bucketEinCount(count: number): string {
  if (count <= 1) return '1';
  if (count <= 5) return '2-5';
  if (count <= 20) return '6-20';
  return '21-50';
}
