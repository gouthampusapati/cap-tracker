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

export function ManagementDecisionBlock({ facAcceptedDate }: { facAcceptedDate: string | null }) {
  const result = computeManagementDecisionDeadline(facAcceptedDate);
  if (!result) return null;

  const { deadlineLabel, state, acceptedDate, daysFromToday: days } = result;

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
        <strong>{formatDate(deadlineLabel)}</strong>
        {state === 'past' ? ', which was' : ''} ({timing}).
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
