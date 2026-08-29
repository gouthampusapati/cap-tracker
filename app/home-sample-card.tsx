/**
 * Hero preview card — a lightweight, static recreation of what an
 * organization page shows, so a first-time visitor sees the payoff of
 * searching before they commit to typing an EIN (redesign brief,
 * Section 1).
 *
 * Deliberately an *illustration*, not a real organization: it is
 * labelled "Example" and uses representative-but-invented figures. The
 * team weighed spotlighting a real distressed entity by name on the
 * marketing homepage and chose not to. The badge pills below reuse the
 * exact severity-token classes from the real components
 * (app/single-audit/[ein]/finding-card.tsx and page.tsx's risk strip)
 * so the colours a visitor learns here match what they see after a
 * search.
 */
export function HomeSampleCard() {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6">
      <div className="mb-3 flex items-center justify-between">
        <span className="rounded bg-surface-alt px-2 py-1 text-caption font-semibold uppercase tracking-wide text-muted">
          Example
        </span>
        <span className="text-caption text-muted">what a search returns</span>
      </div>

      <h2 className="text-lg font-semibold text-gray-900">Riverside Community Action</h2>
      <p className="mt-0.5 text-small text-gray-500">Nonprofit · Oregon · FY 2025</p>

      {/* Risk strip — mirrors the per-audit-year badge row on the org page. */}
      <div className="mt-4 flex flex-wrap gap-2">
        <span className="inline-block rounded border border-severity-critical/30 bg-severity-critical/10 px-2 py-1 text-xs font-bold text-severity-critical">
          GOING CONCERN
        </span>
        <span className="inline-block rounded border border-severity-critical/30 bg-severity-critical/10 px-2 py-1 text-xs font-bold text-severity-critical">
          MATERIAL WEAKNESS
        </span>
        <span className="inline-block rounded border border-severity-warning/30 bg-severity-warning/10 px-2 py-1 text-xs font-bold text-severity-warning">
          REPEAT OF 2023-002
        </span>
      </div>

      <p className="mt-3 text-small font-semibold text-muted">
        $4.2M federal awards expended · 3 findings
      </p>

      {/* Management-decision countdown — the amber "due-soon" treatment
          from app/management-decision-block.tsx. Figures are frozen (this
          whole card is an "Example"), the same way a screenshot would
          be. */}
      <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3">
        <p className="text-caption font-semibold uppercase tracking-wide text-amber-900/80">
          Management decision deadline
        </p>
        <p className="mt-1 text-small leading-relaxed text-amber-900">
          Due <strong>October 15, 2026</strong> — 47 days from today. Under 2 CFR 200.521(d),
          the pass-through entity that funded this organization must act by then.
        </p>
      </div>

      <p className="mt-4 text-caption text-gray-400">
        Illustration. Search any EIN above for the real, cited record.
      </p>
    </div>
  );
}
