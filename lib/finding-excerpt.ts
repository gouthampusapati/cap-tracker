/**
 * Pure text helper — no DB/FAC imports, safe to use from a client or
 * server component. Extracts the actual "Condition" text from a
 * finding's raw `description` blob for the collapsed-state excerpt on
 * the org page (see app/single-audit/[ein]/finding-card.tsx).
 *
 * FAC finding narratives are one long unstructured string that always
 * starts with boilerplate (finding title, category, repeat-finding
 * flag) before the actual regulatory sections begin — confirmed against
 * real finding text via /api/org/[ein] that these narratives reliably
 * embed "Condition:" (and usually "Criteria:") as literal section
 * headers. Clamping the raw string's first two lines (the previous
 * behavior) showed that boilerplate, not the condition. This finds the
 * "Condition:" header and returns everything from there onward — still
 * a long string, but CSS line-clamp-2 in the caller only shows its
 * first two visual lines, which now actually are about the condition.
 *
 * Falls back to the raw description if no "Condition:" header is found
 * (some finding narratives don't follow the pattern) — the caller's
 * line-clamp still keeps the collapsed state to two lines either way.
 */
export function extractConditionExcerpt(description: string): string {
  const match = description.match(/Condition:\s*/);
  if (!match || match.index === undefined) {
    return description.trim();
  }
  return description.slice(match.index + match[0].length).trim();
}
