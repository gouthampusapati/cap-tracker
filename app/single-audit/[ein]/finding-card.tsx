import { TrackedLink } from '@/app/tracked-link';
import { EVENT_ORG_PAGE_CLICKTHROUGH } from '@/lib/analytics-events';
import { getRequirementLink } from '@/lib/compliance-requirements';
import { extractConditionExcerpt } from '@/lib/finding-excerpt';
import type { Finding } from './page';

/**
 * A single finding, collapsed by default. Server component — no client
 * JS needed for expand/collapse, that's native <details>/<summary>
 * behavior. All content (collapsed excerpt AND full detail) ships in
 * the server-rendered HTML regardless of open/closed state; only
 * default browser CSS hides the closed body visually, which is what
 * keeps this SEO-safe (confirmed: Google indexes collapsed <details>
 * content).
 *
 * Card background/border is neutral regardless of finding category —
 * previously each category (Cost Allowability, Procurement, Cash
 * Management...) got its own background color from the same red/
 * yellow/blue family the site's severity scale uses, which is the same
 * "brand/category color doubling as a status signal" problem the
 * design tokens plan explicitly rules out for brand blue. Only the
 * severity badges below carry color now, via the severity-* tokens —
 * MATERIAL WEAKNESS is severity-critical, REPEAT and QUESTIONED COSTS
 * are severity-warning, matching the client's own token spec
 * (Phase 1.1) rather than the previous ad-hoc red/yellow choices.
 *
 * data-severity carries which severity flags apply, space-separated —
 * the severity filter (severity-filter.tsx) targets this attribute via
 * a CSS selector rather than removing cards from the DOM, so every
 * finding stays in the server HTML regardless of filter state.
 */
export function FindingCard({ finding }: { finding: Finding }) {
  const id = `${finding.reportId}-${finding.facFindingId}`;
  const conditionExcerpt = finding.description ? extractConditionExcerpt(finding.description) : '';
  const link = getRequirementLink(finding.typeRequirement);

  const severityFlags = [
    finding.isMaterialWeakness && 'material',
    finding.isRepeatFinding && 'repeat',
    finding.hasQuestionedCosts && 'questioned',
    // New tokens, no filter button targets these yet (see
    // severity-filter.tsx) — space-separated data-severity is a
    // whitespace token match (~= in globals.css), so adding more here
    // doesn't affect the existing material/repeat/questioned filters.
    finding.isSignificantDeficiency && 'significant',
    finding.isModifiedOpinion && 'modified',
    (finding.isOtherMatters || finding.isOtherFindings) && 'other',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <details
      id={id}
      data-severity={severityFlags || undefined}
      className="finding-card group bg-surface border border-border rounded-lg scroll-mt-20"
    >
      <summary className="finding-summary cursor-pointer list-none p-4 sm:p-5 [&::-webkit-details-marker]:hidden">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="text-sm font-mono font-semibold text-text">{finding.facFindingId}</div>
            <div className="text-sm text-muted mt-0.5">{finding.category}</div>
          </div>
          <div className="flex gap-2 flex-wrap">
            {finding.isMaterialWeakness && (
              <span className="inline-block bg-severity-critical/10 text-severity-critical border border-severity-critical/30 text-xs font-bold px-2 py-1 rounded">
                MATERIAL WEAKNESS
              </span>
            )}
            {/* Modified opinion sits with material weakness at
                severity-critical — a qualified/adverse/disclaimer
                opinion on this specific finding's award is at least as
                consequential as a material weakness, not a lesser
                cousin of it. */}
            {finding.isModifiedOpinion && (
              <span className="inline-block bg-severity-critical/10 text-severity-critical border border-severity-critical/30 text-xs font-bold px-2 py-1 rounded">
                MODIFIED OPINION
              </span>
            )}
            {finding.isSignificantDeficiency && (
              <span className="inline-block bg-severity-warning/10 text-severity-warning border border-severity-warning/30 text-xs font-bold px-2 py-1 rounded">
                SIGNIFICANT DEFICIENCY
              </span>
            )}
            {finding.isRepeatFinding && (
              <span className="inline-block bg-severity-warning/10 text-severity-warning border border-severity-warning/30 text-xs font-bold px-2 py-1 rounded">
                REPEAT
              </span>
            )}
            {finding.hasQuestionedCosts && (
              <span className="inline-block bg-severity-warning/10 text-severity-warning border border-severity-warning/30 text-xs font-bold px-2 py-1 rounded">
                QUESTIONED COSTS
              </span>
            )}
            {/* severity-neutral — "informational" per its own token
                comment in globals.css, first real use of this tier.
                Collapsed to one badge even if both flags are set,
                rather than two near-identical pills. */}
            {(finding.isOtherMatters || finding.isOtherFindings) && (
              <span className="inline-block bg-severity-neutral/10 text-severity-neutral border border-severity-neutral/30 text-xs font-bold px-2 py-1 rounded">
                OTHER MATTERS
              </span>
            )}
          </div>
        </div>

        {conditionExcerpt && (
          <p className="text-sm text-muted line-clamp-2 max-w-prose mt-2">{conditionExcerpt}</p>
        )}

        <span className="inline-block text-xs font-semibold text-accent mt-2 group-open:hidden">
          Show full finding ▾
        </span>
        <span className="hidden text-xs font-semibold text-accent mt-2 group-open:inline-block">
          Hide full finding ▴
        </span>
      </summary>

      <div className="finding-detail px-4 sm:px-5 pb-4 sm:pb-5 pt-1 border-t border-border">
        {finding.description && (
          <div className="mb-3 mt-3">
            <div className="text-xs font-semibold uppercase text-muted mb-1">Full finding narrative</div>
            <p className="text-sm text-text whitespace-pre-line max-w-prose">{finding.description}</p>
          </div>
        )}

        {finding.plannedAction && (
          <div className="mb-3">
            <div className="text-xs font-semibold uppercase text-muted mb-1">Corrective Action Plan</div>
            <p className="text-sm text-text whitespace-pre-line max-w-prose">{finding.plannedAction}</p>
          </div>
        )}

        {finding.priorRefs.length > 0 && (
          <div className="mb-3">
            <div className="text-xs font-semibold uppercase text-muted mb-1">Prior Finding References</div>
            <p className="text-sm text-text break-words">{finding.priorRefs.join(', ')}</p>
          </div>
        )}

        {/* Requirement link — every finding links to its type_requirement
            letter's explanation, not just Subrecipient Monitoring findings. */}
        {link && (
          <TrackedLink
            href={link.href}
            event={EVENT_ORG_PAGE_CLICKTHROUGH}
            eventData={{ destination: 'guide', source: 'finding' }}
            className="text-sm underline font-semibold text-accent"
          >
            {link.label}
          </TrackedLink>
        )}
      </div>
    </details>
  );
}
