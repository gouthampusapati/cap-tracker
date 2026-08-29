import Link from 'next/link';

/**
 * Surfaces the already-built /guide content on the homepage instead of
 * hiding it behind a nav click (redesign brief, Section 6). Doubles as
 * internal linking for the SEO sprint. Descriptions are trimmed from
 * app/guide/page.tsx's own `guides` array.
 */
const GUIDES = [
  {
    href: '/guide/compliance-requirements',
    title: 'Compliance requirements A–P',
    blurb: 'What each requirement letter on a finding actually means — the categories auditors cite.',
  },
  {
    href: '/guide/subrecipient-monitoring',
    title: 'Subrecipient monitoring',
    blurb:
      'What 2 CFR 200.332 requires of a pass-through: the 14 subaward data elements, risk assessment, and verifying the audit happened.',
  },
  {
    href: '/guide/management-decisions',
    title: 'Management-decision deadlines',
    blurb:
      'The six-month clock that starts when the FAC accepts a report — and why almost nobody tracks it.',
  },
];

export function HomeGuideTeaser() {
  return (
    <section className="my-16">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-h4 font-semibold text-gray-900">Learn the rules</h2>
        <Link href="/guide" className="shrink-0 text-sm font-semibold text-accent hover:text-blue-800">
          Full compliance guide →
        </Link>
      </div>
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {GUIDES.map((g) => (
          <Link
            key={g.href}
            href={g.href}
            className="group rounded-xl border border-gray-200 bg-white p-5 shadow-card transition-all hover:shadow-card-hover hover:border-accent/40"
          >
            <h3 className="font-semibold text-gray-900 group-hover:text-accent">{g.title}</h3>
            <p className="mt-1.5 text-sm text-gray-600">{g.blurb}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
