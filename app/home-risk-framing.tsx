/**
 * Homepage repositioning §D — the short risk beat, placed right before
 * the closing "Request Founding Access" band so it's the last thing a
 * scroller reads before the ask.
 *
 * Deliberately stays inside monitor / surface / prioritise. NO claims
 * about avoiding federal penalties, preventing findings, or guaranteeing
 * compliance (source brief §6, and the validation plan).
 *
 * Naming: "watch" is a verb; the product noun elsewhere is "portfolio
 * intelligence" — see app/home-fac-vs-monitoring.tsx.
 *
 * Static server component — homepage stays `○` (Static).
 */

const SLIPS = [
  'A new audit finding',
  'A repeat finding',
  'A management decision',
  'A corrective-action deadline',
];

export function HomeRiskFraming() {
  return (
    <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20">
      <h2 className="text-h3 sm:text-h2 font-medium tracking-tight text-balance text-gray-900">
        The cost isn&apos;t the spreadsheet. It&apos;s what falls through the cracks.
      </h2>

      <div className="mt-8 flex flex-wrap gap-3">
        {SLIPS.map((slip) => (
          <span
            key={slip}
            className="rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-600 shadow-card"
          >
            {slip}
          </span>
        ))}
      </div>

      <p className="mt-8 max-w-2xl text-lg font-light text-gray-600">
        Single Audit Intelligence continuously watches your portfolio so your team can spend its
        time on the exceptions, not the search.
      </p>
      <p className="mt-4 text-xl sm:text-h3 font-medium tracking-tight text-balance text-gray-900">
        Focus your team&apos;s attention where it matters.
      </p>
    </section>
  );
}
