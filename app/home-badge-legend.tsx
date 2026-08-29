/**
 * Badge legend — teaches the badge vocabulary on the homepage itself so
 * it is already familiar once a visitor searches (redesign brief,
 * Section 3 + Visual/UX notes). The pills reuse the exact severity-token
 * classes from the real components.
 *
 * Honest about the two tiers: some badges describe a whole audit year
 * (sourced from the FAC "general" record), others sit on an individual
 * finding. The brief lumped them together; the product does not.
 */

const critical =
  'inline-block rounded border border-severity-critical/30 bg-severity-critical/10 px-2 py-1 text-xs font-bold text-severity-critical';
const warning =
  'inline-block rounded border border-severity-warning/30 bg-severity-warning/10 px-2 py-1 text-xs font-bold text-severity-warning';
const positive =
  'inline-block rounded border border-green-200 bg-green-50 px-2 py-1 text-xs font-bold text-green-700';

function Row({ badge, children }: { badge: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-baseline sm:gap-3">
      <div className="shrink-0 sm:w-52">{badge}</div>
      <p className="text-small text-gray-600">{children}</p>
    </div>
  );
}

export function HomeBadgeLegend() {
  return (
    <section className="my-16">
      <h2 className="text-h4 font-semibold text-gray-900">Learn to read the badges</h2>
      <p className="mt-1 text-small text-gray-500">
        Every record is tagged so you can scan risk at a glance — the same colours you see here.
      </p>

      <div className="mt-6 grid gap-8 md:grid-cols-2">
        <div>
          <h3 className="mb-3 text-caption font-semibold uppercase tracking-wide text-muted">
            On an audit year
          </h3>
          <div className="space-y-3">
            <Row badge={<span className={critical}>GOING CONCERN</span>}>
              The auditor raised substantial doubt about the organization&apos;s ability to keep
              operating.
            </Row>
            <Row badge={<span className={critical}>MATERIAL NONCOMPLIANCE DISCLOSED</span>}>
              The auditor reported material noncompliance with a federal program&apos;s rules.
            </Row>
            <Row badge={<span className={positive}>LOW-RISK AUDITEE</span>}>
              A clean recent track record that qualifies the organization for reduced audit
              coverage under 2 CFR 200.520.
            </Row>
          </div>
        </div>

        <div>
          <h3 className="mb-3 text-caption font-semibold uppercase tracking-wide text-muted">
            On an individual finding
          </h3>
          <div className="space-y-3">
            <Row badge={<span className={critical}>MATERIAL WEAKNESS</span>}>
              An internal-control gap serious enough that a material error could go undetected.
            </Row>
            <Row badge={<span className={warning}>REPEAT OF 2023-002</span>}>
              The same issue was cited in a prior year&apos;s audit — a flag federal agencies
              watch for.
            </Row>
            <Row badge={<span className={warning}>QUESTIONED COSTS</span>}>
              Spending the auditor identified as potentially unallowable under the award.
            </Row>
          </div>
        </div>
      </div>
    </section>
  );
}
