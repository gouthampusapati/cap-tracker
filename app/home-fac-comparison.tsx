/**
 * "It's all public — why use this?" — the compact comparison from the
 * redesign brief (Section 4). A data-literate visitor's first reaction
 * is "isn't this all on FAC.gov already?" — yes, it is, and this says so
 * plainly. The point isn't that the data is different; it's how quickly
 * you can read it.
 */

const ROWS: { fac: string; here: string }[] = [
  {
    fac: 'Yes/No columns for going concern, material weakness, low-risk auditee',
    here: 'Colour-coded badges you can scan down a page at a glance',
  },
  {
    fac: 'The raw date the FAC accepted a report',
    here: 'A 2 CFR 200.521(d) management-decision countdown, deadline already computed',
  },
  {
    fac: 'One EIN at a time',
    here: 'Paste up to 10 EINs — or a whole subrecipient list — and check them together',
  },
  {
    fac: "An audit firm's name as free text, spelled differently each year",
    here: "A firm's full client roster, audit count, and findings history on one page",
  },
  {
    fac: 'Finding and corrective-action text inside a PDF you download',
    here: 'That text inline and deep-linkable, finding by finding',
  },
];

export function HomeFacComparison() {
  return (
    <section className="my-16">
      <h2 className="text-h4 font-semibold text-gray-900">It&apos;s all public. Why use this?</h2>
      <p className="mt-2 max-w-2xl text-gray-600">
        Every record here comes straight from the Federal Audit Clearinghouse — the same public
        data, nothing added or changed. What&apos;s different is how fast you can read it.
      </p>

      <div className="mt-6 overflow-hidden rounded-xl border border-gray-200">
        <div className="grid grid-cols-1 sm:grid-cols-2 bg-gray-50 text-caption font-semibold uppercase tracking-wide text-muted">
          <div className="px-4 py-2.5">Raw FAC search</div>
          <div className="hidden border-l border-gray-200 px-4 py-2.5 sm:block">
            Single Audit Intelligence
          </div>
        </div>
        {ROWS.map((r, i) => (
          <div
            key={i}
            className={`grid grid-cols-1 sm:grid-cols-2 ${
              i > 0 ? 'border-t border-gray-200' : ''
            }`}
          >
            <div className="px-4 py-3 text-sm text-gray-500">{r.fac}</div>
            <div className="border-t border-gray-200 bg-white px-4 py-3 text-sm text-gray-800 sm:border-l sm:border-t-0">
              {/* label only shows on mobile, where the column header is hidden */}
              <span className="mb-0.5 block text-caption font-semibold uppercase tracking-wide text-accent sm:hidden">
                Here
              </span>
              {r.here}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
