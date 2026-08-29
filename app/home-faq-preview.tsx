import Link from 'next/link';

/**
 * Three of the highest-intent questions from /faq, on the homepage so a
 * skeptical visitor doesn't have to click through to have them answered
 * (redesign brief, Section 8). Kept as short paraphrases of the /faq
 * answers — the canonical, fuller versions (with FAQPage JSON-LD) live
 * on /faq.
 */
const QA: { q: string; a: string }[] = [
  {
    q: 'Is it really free?',
    a: 'Yes. Every search, the portfolio view, and the auditor directory are free and need no account. A paid Watchlist for continuous monitoring is coming later.',
  },
  {
    q: 'Where does the data come from?',
    a: 'The Federal Audit Clearinghouse — the official public repository of Single Audit reports. This site mirrors those records and adds structure; it never creates or alters audit data.',
  },
  {
    q: 'How current is it?',
    a: 'The bulk data refreshes weekly. Organizations near their filing deadline are checked live against the FAC, and award-level detail is always fetched live. Every page shows its last-refreshed date.',
  },
];

export function HomeFaqPreview() {
  return (
    <section className="my-16">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-h4 font-semibold text-gray-900">Common questions</h2>
        <Link href="/faq" className="shrink-0 text-sm font-semibold text-accent hover:text-blue-800">
          See all FAQs →
        </Link>
      </div>
      <dl className="mt-6 space-y-5">
        {QA.map((item) => (
          <div key={item.q}>
            <dt className="font-semibold text-gray-900">{item.q}</dt>
            <dd className="mt-1 max-w-2xl text-sm text-gray-600">{item.a}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
