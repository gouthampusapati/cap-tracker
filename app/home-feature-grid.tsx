import Link from 'next/link';

/**
 * "What you get" grid — expanded from the original three call-outs
 * (Audit History / Findings / CAP Text) to cover the shipped features
 * that never got a mention on the homepage: the SEFA breakdown,
 * management-decision tracking, the auditor directory, the portfolio
 * view, and the compliance guide (redesign brief, Section 3).
 *
 * Cards for things you only see *after* a search (history, findings,
 * CAP, SEFA, deadlines) are plain. The three that stand on their own
 * (auditors, portfolio, guide) link out.
 */

type Feature = {
  title: string;
  body: string;
  href?: string;
  // Single <path> d-string, drawn on a shared 24x24 stroke icon.
  icon: string;
  // Optional real badge pills — one card (Risk badges) uses this to show
  // the colour system in place rather than describe it. Same
  // severity-token classes as the org page.
  badges?: { label: string; tone: 'critical' | 'warning' | 'positive' }[];
};

const BADGE_TONES: Record<NonNullable<Feature['badges']>[number]['tone'], string> = {
  critical: 'border-severity-critical/30 bg-severity-critical/10 text-severity-critical',
  warning: 'border-severity-warning/30 bg-severity-warning/10 text-severity-warning',
  positive: 'border-green-200 bg-green-50 text-green-700',
};

const FEATURES: Feature[] = [
  {
    title: 'Audit history',
    body: 'Every year of Single Audit history for an organization, oldest to newest.',
    icon: 'M3 3v18h18M8 17V10M13 17V6M18 17v-4',
  },
  {
    title: 'Findings at a glance',
    body: 'Findings by category, with repeat, material-weakness and questioned-cost flags.',
    icon: 'M5 3v18M5 4h11l-2.5 3.5L16 11H5',
  },
  {
    title: 'Corrective action plans',
    body: 'The full CAP text each organization filed in response to a finding.',
    icon: 'M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9l-6-6zM14 3v6h6M9 13h6M9 17h4',
  },
  {
    title: 'Federal awards (SEFA)',
    body: 'The Schedule of Expenditures of Federal Awards — program and cluster totals, major-program opinions.',
    icon: 'M3 21h18M5 21V10M19 21V10M9 21V10M15 21V10M12 3l8 5H4l8-5z',
  },
  {
    title: 'Management-decision deadlines',
    body: 'The 2 CFR 200.521(d) clock for each audit — the exact date and days remaining.',
    icon: 'M4 5h16v16H4zM4 10h16M9 3v4M15 3v4M12 13v4l3 2',
  },
  {
    title: 'Risk badges',
    body: 'Every record is flagged so you can scan risk at a glance — not buried in raw booleans.',
    icon: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z',
    badges: [
      { label: 'GOING CONCERN', tone: 'critical' },
      { label: 'REPEAT', tone: 'warning' },
      { label: 'LOW-RISK AUDITEE', tone: 'positive' },
    ],
  },
  {
    title: 'Auditor directory',
    body: "Look up an audit firm's full client roster and track record before you hire.",
    href: '/auditors',
    icon: 'M3 6h10M3 12h7M3 18h7M15 13l6 6M20 11.5a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z',
  },
  {
    title: 'Portfolio view',
    body: 'Batch-check up to 10 organizations at once — free, no account.',
    href: '/portfolio',
    icon: 'M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5',
  },
  {
    title: 'Compliance guide',
    body: 'Plain-English reference: compliance requirements A–P, subrecipient monitoring, the deadline calendar.',
    href: '/guide',
    icon: 'M5 4h12a2 2 0 012 2v14H7a2 2 0 01-2-2V4zM5 4v14',
  },
];

function Icon({ d }: { d: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      className="mb-3 h-8 w-8 text-primary transition-colors duration-200 group-hover:text-accent"
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  );
}

export function HomeFeatureGrid() {
  return (
    <div className="my-16 rounded-2xl bg-surface-alt p-8 sm:p-10">
      <h2 className="mb-6 text-h4 font-semibold text-gray-900">What you get</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f) => {
          const inner = (
            <>
              <Icon d={f.icon} />
              <h3 className="mb-1 font-semibold text-gray-900">{f.title}</h3>
              <p className="text-sm text-gray-600">{f.body}</p>
              {f.badges && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {f.badges.map((b) => (
                    <span
                      key={b.label}
                      className={`inline-block rounded border px-1.5 py-0.5 text-[10px] font-bold ${BADGE_TONES[b.tone]}`}
                    >
                      {b.label}
                    </span>
                  ))}
                </div>
              )}
              {f.href && (
                <span className="mt-2 inline-block text-sm font-semibold text-accent">
                  Open →
                </span>
              )}
            </>
          );
          const className =
            'group rounded-xl p-5 transition-all duration-200 hover:bg-white hover:shadow-card';
          return f.href ? (
            <Link key={f.title} href={f.href} className={`${className} block`}>
              {inner}
            </Link>
          ) : (
            <div key={f.title} className={className}>
              {inner}
            </div>
          );
        })}
      </div>
    </div>
  );
}
