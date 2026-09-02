#!/usr/bin/env node
/**
 * Read-only diagnostic. Finds "component EINs" — EINs that appear in
 * fac_mirror_additional_eins but are NOT the primary auditee_ein on any
 * fac_mirror_general row. Today /single-audit/<component-ein> 404s for
 * these even though the mirror knows which filing(s) cover them; this
 * lists real examples to check against prod before/after the fallback fix.
 *
 *   node --env-file=.env.local scripts/find-component-eins.mjs [limit]
 *
 * Needs DATABASE_URL + TURSO_AUTH_TOKEN. No writes.
 */

import { createClient } from '@libsql/client';

const DATABASE_URL = process.env.DATABASE_URL;
const TURSO_AUTH_TOKEN = process.env.TURSO_AUTH_TOKEN;
if (!DATABASE_URL) {
  console.error('DATABASE_URL is not set — refusing to run.');
  process.exit(1);
}
const client = createClient(
  TURSO_AUTH_TOKEN ? { url: DATABASE_URL, authToken: TURSO_AUTH_TOKEN } : { url: DATABASE_URL }
);

const limit = Number(process.argv[2] || 15);

// Component EINs (in additional_eins, never a primary auditee_ein),
// joined back to the most recent covering filing for context.
const sql = `
  WITH component AS (
    SELECT a.additional_ein AS ein, a.report_id
    FROM fac_mirror_additional_eins a
    WHERE NOT EXISTS (
      SELECT 1 FROM fac_mirror_general g WHERE g.auditee_ein = a.additional_ein
    )
  ),
  ranked AS (
    SELECT
      c.ein,
      g.auditee_ein   AS parent_ein,
      g.auditee_name  AS parent_name,
      g.audit_year    AS parent_year,
      g.fy_end_date   AS parent_fy_end,
      ROW_NUMBER() OVER (PARTITION BY c.ein ORDER BY g.fy_end_date DESC) AS rn,
      COUNT(*)        OVER (PARTITION BY c.ein) AS covering_filings
    FROM component c
    JOIN fac_mirror_general g ON g.report_id = c.report_id
  )
  SELECT ein, parent_ein, parent_name, parent_year, parent_fy_end, covering_filings
  FROM ranked
  WHERE rn = 1
  ORDER BY covering_filings DESC, parent_fy_end DESC
  LIMIT ${limit};
`;

const [{ rows: totals }, { rows }] = await Promise.all([
  client.execute(`
    SELECT
      (SELECT COUNT(DISTINCT additional_ein) FROM fac_mirror_additional_eins) AS total_additional,
      (SELECT COUNT(*) FROM (
        SELECT DISTINCT a.additional_ein
        FROM fac_mirror_additional_eins a
        WHERE NOT EXISTS (
          SELECT 1 FROM fac_mirror_general g WHERE g.auditee_ein = a.additional_ein
        )
      )) AS component_only
  `),
  client.execute(sql),
]);

const t = totals[0];
console.log(
  `\nadditional_eins distinct: ${Number(t.total_additional).toLocaleString()}  ·  ` +
    `component-only (would 404 today): ${Number(t.component_only).toLocaleString()}\n`
);

console.log('component EIN   parent EIN     covering  most-recent covering filing');
console.log('─'.repeat(90));
for (const r of rows) {
  console.log(
    `${r.ein}   ${r.parent_ein}   ${String(r.covering_filings).padStart(6)}    ` +
      `FY${r.parent_fy_end} — ${r.parent_name}`
  );
}
console.log(
  `\nCheck each:  https://singleauditintel.com/single-audit/<component EIN>   (404 today)\n` +
    `Should resolve to:  https://singleauditintel.com/single-audit/<parent EIN>\n`
);

client.close();
