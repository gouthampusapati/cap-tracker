import {
  computeManagementDecisionDeadline,
  type ManagementDecisionState,
} from '@/lib/management-decision';
import { TrackedLink } from '@/app/tracked-link';
import { EVENT_ORG_PAGE_CLICKTHROUGH } from '@/lib/analytics-events';

const stateStyles: Record<ManagementDecisionState, string> = {
  // Neutral, informational — not urgent, not alarming.
  future: 'bg-blue-50 border-blue-200 text-blue-900',
  // Visually distinct so it stands out as time-sensitive, but amber
  // reads as "pay attention," not an accusation.
  'due-soon': 'bg-amber-50 border-amber-300 text-amber-900',
  // Deliberately grey/neutral, not red — a passed deadline is a fact
  // about a third party (the pass-through entity, not the audited org
  // on this page) that this site cannot verify one way or the other.
  past: 'bg-gray-100 border-gray-300 text-gray-700',
};

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * `variant`: an org with many audit years would otherwise render this
 * same alert-style card once per year — for a finding from 2019, "past
 * due (2,400 days ago)" repeated seven times reads as a pile-on against
 * the audited org, even though the deadline is the pass-through's
 * obligation, not theirs, and whether it was actually met isn't
 * something this site can verify either way. 'full' (default) is the
 * bordered/backgrounded card with the complete sentence and guide link;
 * 'plain' states the same two dates factually on one muted line, no
 * "X days ago" framing, no border, no repeated link. Callers should use
 * 'full' only for the most recent fiscal year and 'plain' for the rest
 * — see the sortedYears.map call site in app/single-audit/[ein]/page.tsx.
 */
export function ManagementDecisionBlock({
  facAcceptedDate,
  variant = 'full',
}: {
  facAcceptedDate: string | null;
  variant?: 'full' | 'plain';
}) {
  const result = computeManagementDecisionDeadline(facAcceptedDate);
  if (!result) return null;

  const { deadlineLabel, state, acceptedDate, daysFromToday: days } = result;

  if (variant === 'plain') {
    return (
      <p className="text-xs text-gray-500 mb-4">
        FAC accepted this audit on {formatDate(acceptedDate)} — management decision was due{' '}
        {formatDate(deadlineLabel)}.
      </p>
    );
  }

  let timing: string;
  if (state === 'past') {
    timing = `${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} ago`;
  } else if (days === 0) {
    timing = 'today';
  } else {
    timing = `${days} day${days === 1 ? '' : 's'} from today`;
  }

  return (
    <div className={`border rounded-lg p-4 mb-4 ${stateStyles[state]}`}>
      <p className="text-xs font-semibold uppercase opacity-80 mb-1">
        Management decision deadline — for entities that funded this organization
      </p>
      <p className="text-sm leading-relaxed">
        The FAC accepted this audit on {formatDate(acceptedDate)}. Under 2 CFR 200.521(d), a
        pass-through entity that provided federal funds to this organization for this audit
        period must issue a management decision on these findings by{' '}
        <strong>{formatDate(deadlineLabel)}</strong> ({timing}).
      </p>
      <TrackedLink
        href="/guide/management-decisions"
        event={EVENT_ORG_PAGE_CLICKTHROUGH}
        eventData={{ destination: 'guide', source: 'management_decision_block' }}
        className="text-sm underline font-semibold opacity-90 hover:opacity-100"
      >
        What is a management decision? →
      </TrackedLink>
    </div>
  );
}
