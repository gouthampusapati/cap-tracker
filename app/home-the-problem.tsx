import Link from 'next/link';

/**
 * PR-1 (institutional-memory positioning) — "THE PROBLEM", above the
 * existing by-hand/monitored comparison (home-fac-vs-monitoring.tsx).
 * Three problems, each mapped honestly to a shipped-or-planned answer —
 * do not let this drift into claiming a feature that doesn't exist yet.
 *
 * Item 03 links to the subrecipient-monitoring guide for now.
 * TODO(PR-2): once /research/repeat-findings ships, point item 03's
 * link (and its "Shipped" line, if the study itself becomes the citable
 * source rather than just detection) at that page instead.
 *
 * Static server component — no runtime cost, keeps the homepage `○`.
 */

const PROBLEMS = [
  {
    n: '01',
    heading: 'The record leaves when the person does',
    body: "Monitoring history lives in one person's inbox and one shared spreadsheet. When they leave, your next auditor asks for it anyway.",
    answer: 'Planned',
    answerBody: 'Management-decision tracking and letter drafting. Founding customers are shaping it.',
  },
  {
    n: '02',
    heading: "Manual checking doesn't scale",
    body: "Checking three subrecipients works. Checking thirty doesn't. Your monitoring duty under 2 CFR 200.332 doesn't shrink as the portfolio grows.",
    answer: 'Shipped',
    answerBody: 'Continuous monitoring and exception alerts.',
  },
  {
    n: '03',
    heading: 'The same findings come back',
    body: 'Repeat findings are a flag every federal agency sees on your next award. 2 CFR 200.511 expects them closed. They come back when nobody tracks the corrective action through to done.',
    answer: 'Shipped',
    answerBody: 'Repeat-finding detection and management-decision deadline tracking (2 CFR 200.521(d)).',
    link: { href: '/guide/subrecipient-monitoring', label: 'See how repeat findings get tracked' },
  },
];

export function HomeTheProblem() {
  return (
    <section className="bg-white">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20">
        <p className="text-caption font-semibold uppercase tracking-wide text-muted">The problem</p>
        <h2 className="mt-2 text-h3 sm:text-h2 font-medium tracking-tight text-balance text-gray-900">
          Checking findings once isn&apos;t the hard part
        </h2>

        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {PROBLEMS.map((p) => (
            <div key={p.n} className="rounded-xl border border-gray-200 bg-white p-6">
              <p className="text-caption font-semibold text-muted">{p.n}</p>
              <h3 className="mt-2 text-base font-semibold text-gray-900">{p.heading}</h3>
              <p className="mt-2 text-sm text-gray-600">{p.body}</p>
              <div className="mt-4 pt-4 border-t border-gray-100">
                <p className="text-caption font-semibold uppercase tracking-wide text-accent">
                  {p.answer}
                </p>
                <p className="mt-1 text-sm text-gray-700">
                  {p.answerBody}
                  {p.link && (
                    <>
                      {' '}
                      <Link href={p.link.href} className="underline font-semibold hover:text-accent">
                        {p.link.label} &rarr;
                      </Link>
                    </>
                  )}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
