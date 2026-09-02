#!/usr/bin/env node
/**
 * Sprint 4 (FAC_API_Improvement_Sprint_Checklist.md) — pulls FAC's full
 * bulk CSV export (general, findings, findings_text,
 * corrective_action_plans; ~660MB combined, full history 2016-present,
 * confirmed live 2026-08-27 — no API key needed, doesn't touch FAC's
 * rate-limited quota at all) and loads it into a local Turso mirror,
 * so a live per-EIN FAC API call is only needed for an EIN genuinely
 * new since the last sync.
 *
 * Sprint 5 adds additional_eins + additional_ueis (~6.5MB combined) for
 * entity resolution — see lib/entity-resolution.ts.
 *
 * Sprint C widens the `general` mirror with auditor location/contact
 * columns (auditor_city/state/zip/address/phone/contact_name/email) for
 * the /auditors directory. 2026-09-01 adds the AUDITEE contact columns
 * (auditee_contact_name/title/email/phone) for outbound outreach. Both
 * are extra columns off the SAME general.csv row — same row count, no
 * change to the sync's write volume, still zero FAC API calls.
 *
 * Run standalone via Node (a GitHub Actions scheduled workflow, not
 * part of the Next.js app) — NOT via drizzle-kit push. Needs
 * DATABASE_URL + TURSO_AUTH_TOKEN in the environment.
 *
 * Strategy: blue-green table swap, not incremental upsert. The source
 * is a COMPLETE point-in-time export every time, not a diff feed — a
 * full reload into `<table>_new`, then an atomic rename-swap into the
 * live table name, naturally reflects redactions/corrections with no
 * diff logic, and the live tables are never in a half-populated state
 * (see FAC_API_Improvement Sprint 4 plan's "cracks found" section).
 *
 * Column sets mirrored are a SUBSET of each CSV's real columns — mostly
 * what lib/fac-api.ts's FacGeneral/FacFinding/FacFindingText/FacCap
 * interfaces read, plus a few carried purely for internal use (the
 * auditee/auditor contact columns feed outreach, not the app's org
 * pages). This file's CREATE TABLE DDL must stay column-for-column
 * identical to lib/db/schema.ts's fac-mirror Drizzle declarations (the
 * read side) — there's no single source of truth for that today, just
 * this comment on both ends.
 *
 * A truncated/corrupted CSV row fails LOUDLY (parser throws, sync
 * aborts, `_new` tables dropped, live tables untouched, a `failed` row
 * written to fac_mirror_sync_log, and an email sent if RESEND_API_KEY
 * is set) rather than silently loading partial/wrong data — matches
 * this app's "never guess, verify" standard for anything the site's
 * accuracy depends on.
 */

import { createClient } from '@libsql/client';
import { parse } from 'csv-parse';
import { createReadStream } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { pipeline } from 'node:stream/promises';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { downloadWithResume } from './lib/download-csv.mjs';
import { hashRow, taggedRowHash, xorHex, ZERO_DIGEST } from './lib/row-hash.mjs';
import { diffReports, assertDiffSane, deltaByKey } from './lib/mirror-diff.mjs';

// TEST-ONLY: read the CSVs from a local directory instead of FAC. Set by
// test/mirror-sync-equivalence.test.ts so the sync can run end-to-end
// against a committed fixture with no network. Never set in CI/prod.
const FAC_CSV_DIR = process.env.FAC_CSV_DIR || null;

// Two sync modes:
//  - INCREMENTAL (default): diff this week's CSVs against the per-report
//    content_hash stored on fac_mirror_general, then write only the
//    reports that changed — ~40K row-writes/week instead of ~1.5M.
//  - FULL (--full, SYNC_FULL=1, or auto): the blue-green reload — used
//    on the first run, after a mirrored-column change, in TEST mode, or
//    for recovery. Always safe; just expensive.
const FULL_FLAG = process.argv.includes('--full') || process.env.SYNC_FULL === '1';

const DATABASE_URL = process.env.DATABASE_URL;
const TURSO_AUTH_TOKEN = process.env.TURSO_AUTH_TOKEN;

if (!DATABASE_URL) {
  console.error('DATABASE_URL is not set — refusing to run against no configured database.');
  process.exit(1);
}

const client = createClient(
  TURSO_AUTH_TOKEN ? { url: DATABASE_URL, authToken: TURSO_AUTH_TOKEN } : { url: DATABASE_URL }
);

const FAC_CSV_BASE = 'https://app.fac.gov/dissemination/public-data/gsa/full';

// Rows per client.batch() call. 500 measured at ~1.75ms/row against the
// real production DB during this sprint's build (878ms/500 rows) — not
// tuned further than that single measurement; if a real full run turns
// out slow, this is the first knob to try, not the CSV-parsing side.
const BATCH_SIZE = 500;

// FAC's bulk CSVs are large (general.csv is ~270 MB) and their CDN drops
// long transfers over some connections. downloadWithResume() curls each
// to a temp file with `-C -` resume, retrying the whole download this
// many times (scripts/lib/download-csv.mjs).
const DOWNLOAD_MAX_ATTEMPTS = 5;

// TEST-ONLY: caps rows loaded per table, for a fast end-to-end smoke
// test against real data without waiting out a full multi-hour run.
// Unset (undefined) in the real scheduled GitHub Actions run — never
// set there. Deliberately read once at module load so a truncated test
// run can't be mistaken for a real one in the sync log (see
// `truncatedForTest` below).
const TEST_MAX_ROWS_PER_TABLE = process.env.SYNC_TEST_MAX_ROWS_PER_TABLE
  ? Number(process.env.SYNC_TEST_MAX_ROWS_PER_TABLE)
  : null;

/**
 * One table's sync spec: which CSV, which columns to keep (CSV column
 * name -> mirror column name), and the CREATE TABLE DDL for a table
 * under a given name (so it can build both `<name>` for a first-ever
 * run and `<name>_new` for every subsequent one).
 */
const TABLES = [
  {
    key: 'general',
    csvFile: 'general.csv',
    liveTable: 'fac_mirror_general',
    columns: {
      report_id: 'report_id',
      auditee_ein: 'auditee_ein',
      auditee_uei: 'auditee_uei',
      auditee_name: 'auditee_name',
      auditee_city: 'auditee_city',
      auditee_state: 'auditee_state',
      // Auditee contact — for outbound outreach. Verified present in
      // general.csv's header 2026-09-01. Keep in lockstep with
      // lib/db/schema.ts facMirrorGeneral.
      auditee_contact_name: 'auditee_contact_name',
      auditee_contact_title: 'auditee_contact_title',
      auditee_email: 'auditee_email',
      auditee_phone: 'auditee_phone',
      audit_year: 'audit_year',
      fy_end_date: 'fy_end_date',
      fy_start_date: 'fy_start_date',
      total_amount_expended: 'total_amount_expended',
      entity_type: 'entity_type',
      is_low_risk_auditee: 'is_low_risk_auditee',
      is_going_concern_included: 'is_going_concern_included',
      is_material_noncompliance_disclosed: 'is_material_noncompliance_disclosed',
      gaap_results: 'gaap_results',
      auditor_firm_name: 'auditor_firm_name',
      auditor_ein: 'auditor_ein',
      auditor_city: 'auditor_city',
      auditor_state: 'auditor_state',
      auditor_zip: 'auditor_zip',
      auditor_address_line_1: 'auditor_address_line_1',
      auditor_phone: 'auditor_phone',
      auditor_contact_name: 'auditor_contact_name',
      auditor_email: 'auditor_email',
      cognizant_agency: 'cognizant_agency',
      oversight_agency: 'oversight_agency',
      fac_accepted_date: 'fac_accepted_date',
    },
    ddl: (name) => `CREATE TABLE ${name} (
      report_id TEXT PRIMARY KEY,
      auditee_ein TEXT NOT NULL,
      auditee_uei TEXT,
      auditee_name TEXT,
      auditee_city TEXT,
      auditee_state TEXT,
      auditee_contact_name TEXT,
      auditee_contact_title TEXT,
      auditee_email TEXT,
      auditee_phone TEXT,
      audit_year TEXT,
      fy_end_date TEXT,
      fy_start_date TEXT,
      total_amount_expended REAL,
      entity_type TEXT,
      is_low_risk_auditee TEXT,
      is_going_concern_included TEXT,
      is_material_noncompliance_disclosed TEXT,
      gaap_results TEXT,
      auditor_firm_name TEXT,
      auditor_ein TEXT,
      auditor_city TEXT,
      auditor_state TEXT,
      auditor_zip TEXT,
      auditor_address_line_1 TEXT,
      auditor_phone TEXT,
      auditor_contact_name TEXT,
      auditor_email TEXT,
      cognizant_agency TEXT,
      oversight_agency TEXT,
      fac_accepted_date TEXT,
      -- Per-report content digest (row-hash of this general row XOR'd
      -- with the hashes of all the report's child rows). The incremental
      -- sync compares this week's digest to the stored one to decide
      -- which reports to touch. NULL only on rows written by an older
      -- full reload — the next incremental run treats those as changed.
      content_hash TEXT
    )`,
    indexes: (name, idxSuffix) => [
      `CREATE INDEX ein_idx_${idxSuffix} ON ${name} (auditee_ein)`,
      `CREATE INDEX auditor_ein_idx_${idxSuffix} ON ${name} (auditor_ein)`,
      `CREATE INDEX auditor_state_idx_${idxSuffix} ON ${name} (auditor_state)`,
    ],
  },
  {
    key: 'findings',
    csvFile: 'findings.csv',
    liveTable: 'fac_mirror_findings',
    columns: {
      report_id: 'report_id',
      audit_year: 'audit_year',
      reference_number: 'reference_number',
      award_reference: 'award_reference',
      type_requirement: 'type_requirement',
      is_material_weakness: 'is_material_weakness',
      is_significant_deficiency: 'is_significant_deficiency',
      is_modified_opinion: 'is_modified_opinion',
      is_other_matters: 'is_other_matters',
      is_other_findings: 'is_other_findings',
      is_questioned_costs: 'is_questioned_costs',
      is_repeat_finding: 'is_repeat_finding',
      prior_finding_ref_numbers: 'prior_finding_ref_numbers',
    },
    ddl: (name) => `CREATE TABLE ${name} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      report_id TEXT NOT NULL,
      audit_year TEXT,
      reference_number TEXT NOT NULL,
      award_reference TEXT,
      type_requirement TEXT,
      is_material_weakness TEXT,
      is_significant_deficiency TEXT,
      is_modified_opinion TEXT,
      is_other_matters TEXT,
      is_other_findings TEXT,
      is_questioned_costs TEXT,
      is_repeat_finding TEXT,
      prior_finding_ref_numbers TEXT
    )`,
    indexes: (name, idxSuffix) => [`CREATE INDEX report_idx_${idxSuffix} ON ${name} (report_id)`],
  },
  {
    key: 'findings_text',
    csvFile: 'findings_text.csv',
    liveTable: 'fac_mirror_findings_text',
    columns: {
      report_id: 'report_id',
      finding_ref_number: 'finding_ref_number',
      finding_text: 'finding_text',
      contains_chart_or_table: 'contains_chart_or_table',
    },
    ddl: (name) => `CREATE TABLE ${name} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      report_id TEXT NOT NULL,
      finding_ref_number TEXT NOT NULL,
      finding_text TEXT,
      contains_chart_or_table TEXT
    )`,
    indexes: (name, idxSuffix) => [`CREATE INDEX findings_text_ref_idx_${idxSuffix} ON ${name} (report_id, finding_ref_number)`],
  },
  {
    key: 'corrective_action_plans',
    csvFile: 'corrective_action_plans.csv',
    liveTable: 'fac_mirror_corrective_action_plans',
    columns: {
      report_id: 'report_id',
      finding_ref_number: 'finding_ref_number',
      planned_action: 'planned_action',
      contains_chart_or_table: 'contains_chart_or_table',
    },
    ddl: (name) => `CREATE TABLE ${name} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      report_id TEXT NOT NULL,
      finding_ref_number TEXT NOT NULL,
      planned_action TEXT,
      contains_chart_or_table TEXT
    )`,
    indexes: (name, idxSuffix) => [`CREATE INDEX cap_ref_idx_${idxSuffix} ON ${name} (report_id, finding_ref_number)`],
  },
  // Sprint 5 — entity resolution. Both tables are tiny (~72K / ~27K
  // rows, ~6.5MB combined) and let lib/entity-resolution.ts group an
  // org's EINs/UEIs off the mirror with zero FAC calls: an audit filed
  // under several EINs/UEIs lists the extras here, keyed on report_id.
  {
    key: 'additional_eins',
    csvFile: 'additional_eins.csv',
    liveTable: 'fac_mirror_additional_eins',
    columns: {
      report_id: 'report_id',
      auditee_uei: 'auditee_uei',
      audit_year: 'audit_year',
      additional_ein: 'additional_ein',
    },
    ddl: (name) => `CREATE TABLE ${name} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      report_id TEXT NOT NULL,
      auditee_uei TEXT,
      audit_year TEXT,
      additional_ein TEXT NOT NULL
    )`,
    indexes: (name, idxSuffix) => [
      `CREATE INDEX add_eins_report_idx_${idxSuffix} ON ${name} (report_id)`,
      `CREATE INDEX add_eins_ein_idx_${idxSuffix} ON ${name} (additional_ein)`,
    ],
  },
  {
    key: 'additional_ueis',
    csvFile: 'additional_ueis.csv',
    liveTable: 'fac_mirror_additional_ueis',
    columns: {
      report_id: 'report_id',
      auditee_uei: 'auditee_uei',
      audit_year: 'audit_year',
      additional_uei: 'additional_uei',
    },
    ddl: (name) => `CREATE TABLE ${name} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      report_id TEXT NOT NULL,
      auditee_uei TEXT,
      audit_year TEXT,
      additional_uei TEXT NOT NULL
    )`,
    indexes: (name, idxSuffix) => [
      `CREATE INDEX add_ueis_report_idx_${idxSuffix} ON ${name} (report_id)`,
      `CREATE INDEX add_ueis_uei_idx_${idxSuffix} ON ${name} (additional_uei)`,
    ],
  },
];

/**
 * Derived tables — built from the freshly-loaded CSV `_new` tables, not
 * from a CSV of their own, then swapped in atomically alongside
 * everything in TABLES. See buildAuditorFirmsTable.
 */
const DERIVED_TABLES = ['fac_mirror_auditor_firms', 'fac_mirror_org_summary'];

/** Every live table this sync owns — CSV-loaded + derived. */
const ALL_LIVE_TABLES = [...TABLES.map((t) => t.liveTable), ...DERIVED_TABLES];

function log(msg) {
  console.log(`[sync-fac-mirror] ${new Date().toISOString()} ${msg}`);
}

/**
 * Drizzle's sqlite `integer(..., { mode: 'timestamp' })` stores
 * SECONDS-since-epoch, not milliseconds — confirmed live against this
 * same database's fac_fetch_log table while investigating a Turso
 * dashboard read-spike question earlier in this build. This script
 * writes fac_mirror_sync_log via raw SQL, not Drizzle, so it has to
 * match that convention by hand — caught for real here too: an earlier
 * version of this script stored `.getTime()` (milliseconds) directly,
 * which would make any Drizzle-side read of this table (or a duration
 * computed as completed_at - started_at) come out ~1000x wrong.
 */
const REAL_FIRM_EIN =
  "auditor_ein IS NOT NULL AND auditor_ein NOT IN ('', 'GSA_MIGRATION', '999999999')";

/**
 * Roll a fac_mirror_general-shaped table down to one row per audit firm.
 * Two plain GROUP BYs + JS ranking rather than one window-function
 * INSERT…SELECT: on the free-tier Turso a single monster query over all
 * ~413K rows is unreliable (seen it run past 2 min), whereas each of
 * these completes on its own and the ranking is trivial in memory
 * (~8.4K firms, ~48K name/location variants). Shared verbatim with
 * backfill-auditor-firms.mjs so the two can't diverge. `fromTable` is
 * interpolated, never user input.
 */
async function computeAuditorFirmRows(dbClient, fromTable) {
  const agg = (
    await dbClient.execute(`
      SELECT auditor_ein, COUNT(*) AS ac, COUNT(DISTINCT auditee_ein) AS cc, MAX(audit_year) AS my
      FROM ${fromTable} WHERE ${REAL_FIRM_EIN} GROUP BY auditor_ein
    `)
  ).rows;
  const variants = (
    await dbClient.execute(`
      SELECT auditor_ein, auditor_firm_name AS nm, auditor_city AS ci, auditor_state AS st,
             COUNT(*) AS n, MAX(audit_year) AS y
      FROM ${fromTable} WHERE ${REAL_FIRM_EIN}
      GROUP BY auditor_ein, auditor_firm_name, auditor_city, auditor_state
    `)
  ).rows;

  const names = new Map(); // ein -> [{v,n,y}]  (name spellings)
  const locs = new Map(); //  ein -> [{city,state,n,y}]  (city+state pairs)
  for (const r of variants) {
    const ein = r.auditor_ein;
    if (r.nm) {
      if (!names.has(ein)) names.set(ein, []);
      names.get(ein).push({ v: r.nm, n: Number(r.n), y: r.y ?? '' });
    }
    if (r.st) {
      if (!locs.has(ein)) locs.set(ein, []);
      locs.get(ein).push({ city: r.ci ?? '', state: r.st, n: Number(r.n), y: r.y ?? '' });
    }
  }
  // Modal value, tie-broken by most-recent year then alphabetically —
  // mirrors lib/auditors-shared.ts pickFirmName and the old per-request
  // "variant seen most often" location pick.
  const bestName = (arr) =>
    arr?.slice().sort((a, b) => b.n - a.n || b.y.localeCompare(a.y) || a.v.localeCompare(b.v))[0]?.v ?? null;
  const bestLoc = (arr) =>
    arr
      ?.slice()
      .sort(
        (a, b) =>
          b.n - a.n || b.y.localeCompare(a.y) || a.state.localeCompare(b.state) || a.city.localeCompare(b.city)
      )[0] ?? null;

  return agg.map((a) => {
    const loc = bestLoc(locs.get(a.auditor_ein));
    return [
      a.auditor_ein,
      bestName(names.get(a.auditor_ein)),
      loc?.city || null,
      loc?.state || null,
      Number(a.ac),
      Number(a.cc),
      a.my ?? null,
    ];
  });
}

/** Insert the [ein, name, city, state, ac, cc, year] rows in batches. */
async function insertAuditorFirmRows(dbClient, table, rows) {
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    await dbClient.batch(
      rows.slice(i, i + BATCH_SIZE).map((r) => ({
        sql: `INSERT INTO ${table}
                (auditor_ein, firm_name, city, state, audit_count, client_count, most_recent_year)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: r,
      })),
      'write'
    );
  }
}

const AUDITOR_FIRMS_DDL = (name) => `CREATE TABLE ${name} (
  auditor_ein TEXT PRIMARY KEY,
  firm_name TEXT,
  city TEXT,
  state TEXT,
  audit_count INTEGER NOT NULL,
  client_count INTEGER NOT NULL,
  most_recent_year TEXT
)`;

/**
 * Build the fac_mirror_auditor_firms `_new` table — one row per audit
 * firm (~8.4K), pre-aggregated from the freshly-loaded general `_new`
 * table so the /auditors directory is an indexed LIMIT scan instead of
 * a full GROUP BY + count(distinct) over every ~413K general row on
 * each request (~4.5s before).
 *
 * Runs inside the main try, before the swap: a failure here fails the
 * whole sync and rolls everything back (live tables, including the
 * previous fac_mirror_auditor_firms, stay untouched).
 */
async function buildAuditorFirmsTable(generalNew, firmsNew, idxSuffix) {
  await client.execute(`DROP TABLE IF EXISTS ${firmsNew}`);
  await client.execute(AUDITOR_FIRMS_DDL(firmsNew));

  const rows = await computeAuditorFirmRows(client, generalNew);
  if (rows.length === 0 && TEST_MAX_ROWS_PER_TABLE === null) {
    throw new Error('buildAuditorFirmsTable produced 0 rows — refusing to swap an empty directory in');
  }
  await insertAuditorFirmRows(client, firmsNew, rows);

  await client.execute(
    `CREATE INDEX afirms_state_count_${idxSuffix} ON ${firmsNew} (state, audit_count DESC)`
  );
  await client.execute(`CREATE INDEX afirms_count_${idxSuffix} ON ${firmsNew} (audit_count DESC)`);

  log(`${firmsNew}: ${rows.length} firms aggregated`);
  return rows.length;
}

const ORG_SUMMARY_DDL = (name) => `CREATE TABLE ${name} (
  auditee_ein TEXT PRIMARY KEY,
  name TEXT,
  state TEXT,
  city TEXT,
  audit_count INTEGER NOT NULL,
  most_recent_year TEXT,
  total_expended REAL,
  findings_count INTEGER NOT NULL DEFAULT 0,
  is_going_concern INTEGER NOT NULL DEFAULT 0,
  is_low_risk INTEGER NOT NULL DEFAULT 0
)`;

/**
 * Roll a fac_mirror_general-shaped table (+ its findings) down to one
 * row per audited organization (~68K). Backs the SEO landing pages
 * (/single-audit hub, /single-audit/state/[state]) — an indexed read of
 * this replaces a full GROUP BY + findings JOIN over ~413K general rows
 * per request. name / state / city / total_expended / going-concern /
 * low-risk are taken from the org's MOST RECENT audit year;
 * findings_count is total distinct findings across all its audits.
 *
 * Two plain SELECTs + JS aggregation (same reasoning as
 * computeAuditorFirmRows — a monster window query is unreliable on the
 * free-tier Turso). Shared verbatim with backfill-org-summary.mjs.
 */
async function computeOrgSummaryRows(dbClient, generalTable, findingsTable) {
  const generalRows = (
    await dbClient.execute(`
      SELECT report_id, auditee_ein, audit_year, auditee_name, auditee_city, auditee_state,
             total_amount_expended, is_going_concern_included, is_low_risk_auditee
      FROM ${generalTable}
      WHERE auditee_ein IS NOT NULL AND auditee_ein <> ''
    `)
  ).rows;
  const findingRows = (
    await dbClient.execute(`SELECT report_id, reference_number FROM ${findingsTable}`)
  ).rows;

  const reportEin = new Map();
  for (const r of generalRows) reportEin.set(r.report_id, r.auditee_ein);

  const findingKeys = new Map(); // ein -> Set('<report_id>|<ref>')
  for (const f of findingRows) {
    const ein = reportEin.get(f.report_id);
    if (!ein) continue;
    if (!findingKeys.has(ein)) findingKeys.set(ein, new Set());
    findingKeys.get(ein).add(`${f.report_id}|${f.reference_number}`);
  }

  const byEin = new Map(); // ein -> { count, latest: row }
  for (const r of generalRows) {
    let e = byEin.get(r.auditee_ein);
    if (!e) {
      e = { count: 0, latest: null };
      byEin.set(r.auditee_ein, e);
    }
    e.count += 1;
    if (!e.latest || (r.audit_year ?? '') > (e.latest.audit_year ?? '')) e.latest = r;
  }

  const yes = (v) => (String(v ?? '').toLowerCase() === 'yes' ? 1 : 0);

  return [...byEin.entries()].map(([ein, e]) => {
    const m = e.latest;
    return [
      ein,
      m.auditee_name ?? null,
      (m.auditee_state ?? '').trim().toUpperCase() || null,
      (m.auditee_city ?? '').trim() || null,
      e.count,
      m.audit_year ?? null,
      m.total_amount_expended ?? null,
      findingKeys.get(ein)?.size ?? 0,
      yes(m.is_going_concern_included),
      yes(m.is_low_risk_auditee),
    ];
  });
}

async function insertOrgSummaryRows(dbClient, table, rows) {
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    await dbClient.batch(
      rows.slice(i, i + BATCH_SIZE).map((r) => ({
        sql: `INSERT INTO ${table}
                (auditee_ein, name, state, city, audit_count, most_recent_year,
                 total_expended, findings_count, is_going_concern, is_low_risk)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: r,
      })),
      'write'
    );
  }
}

/**
 * Build fac_mirror_org_summary `_new` from the freshly-loaded general +
 * findings `_new` tables, then swapped in with everything else. See
 * DERIVED_TABLES / the main() swap loop.
 */
async function buildOrgSummaryTable(generalNew, findingsNew, summaryNew, idxSuffix) {
  await client.execute(`DROP TABLE IF EXISTS ${summaryNew}`);
  await client.execute(ORG_SUMMARY_DDL(summaryNew));

  const rows = await computeOrgSummaryRows(client, generalNew, findingsNew);
  if (rows.length === 0 && TEST_MAX_ROWS_PER_TABLE === null) {
    throw new Error('buildOrgSummaryTable produced 0 rows — refusing to swap an empty summary in');
  }
  await insertOrgSummaryRows(client, summaryNew, rows);

  await client.execute(
    `CREATE INDEX orgsum_state_exp_${idxSuffix} ON ${summaryNew} (state, total_expended DESC)`
  );
  await client.execute(
    `CREATE INDEX orgsum_gc_exp_${idxSuffix} ON ${summaryNew} (is_going_concern, total_expended DESC)`
  );
  await client.execute(`CREATE INDEX orgsum_audits_${idxSuffix} ON ${summaryNew} (audit_count DESC)`);

  log(`${summaryNew}: ${rows.length} organizations aggregated`);
  return rows.length;
}

/**
 * Regenerate lib/site-stats.json — the numbers behind the homepage
 * "stat bar" (redesign brief, Section 2). Plain COUNT(*) reads against
 * the just-swapped live tables: no write-quota cost, so it's safe to
 * run every sync. The GitHub Actions workflow commits the file back to
 * main if it changed. Non-fatal by contract — the caller wraps this in
 * try/catch so a stats hiccup never fails the actual mirror sync.
 */
async function writeSiteStats() {
  if (TEST_MAX_ROWS_PER_TABLE !== null || FAC_CSV_DIR) {
    log('site-stats: skipped (test run — counts would be truncated)');
    return;
  }
  const { rows } = await client.execute(`
    SELECT
      (SELECT COUNT(*) FROM fac_mirror_org_summary) AS organizations,
      (SELECT COUNT(*) FROM fac_mirror_general) AS audit_reports,
      (SELECT COUNT(DISTINCT report_id || '|' || reference_number) FROM fac_mirror_findings) AS findings,
      (SELECT COUNT(*) FROM fac_mirror_auditor_firms) AS audit_firms,
      (SELECT MIN(audit_year) FROM fac_mirror_general) AS earliest_year,
      (SELECT MAX(audit_year) FROM fac_mirror_general) AS latest_year
  `);
  const r = rows[0];
  const stats = {
    organizations: Number(r.organizations),
    auditReports: Number(r.audit_reports),
    findings: Number(r.findings),
    auditFirms: Number(r.audit_firms),
    earliestAuditYear: Number(r.earliest_year),
    latestAuditYear: Number(r.latest_year),
    refreshedAt: new Date().toISOString().slice(0, 10),
  };
  if (!stats.organizations || !stats.auditReports) {
    throw new Error(`refusing to write empty-looking stats: ${JSON.stringify(stats)}`);
  }
  const target = join(dirname(fileURLToPath(import.meta.url)), '..', 'lib', 'site-stats.json');
  await writeFile(target, `${JSON.stringify(stats, null, 2)}\n`);
  log(`site-stats written: ${JSON.stringify(stats)}`);
}

function toEpochSeconds(date) {
  return Math.floor(date.getTime() / 1000);
}

/**
 * Streams one CSV from FAC straight into the `_new` table for its spec
 * — no temp file, no buffering the whole response in memory. Rejects
 * with a real Error (aborting the whole sync) on any parse failure,
 * including a truncated/malformed download — see the file header
 * comment on why that's the deliberate behavior, not a bug to relax.
 *
 * Uses stream.pipeline() (NOT readable.pipe()): pipe() does not forward
 * an error on the *source* stream to the destination, so when FAC's CDN
 * dropped a long download mid-transfer the socket 'error' went unhandled
 * and crashed the whole process (and could, on a clean early EOF, look
 * like a silent truncation). pipeline() propagates it, so it rejects
 * here and loadTable() can retry.
 */
/**
 * Stream one CSV (always a local file now — download happens up front in
 * downloadAllCsvs) into `tableName`. `digestByReport`, when given, is the
 * per-report content digest computed in computeDigests — appended to the
 * general table's rows as content_hash.
 *
 * Uses stream.pipeline() (NOT readable.pipe()): a source error on a large
 * read propagates and rejects instead of surfacing as an unhandled
 * 'error'. Header check aborts loudly on a FAC schema change.
 */
async function loadTableFromFile(spec, tableName, csvDir, digestByReport) {
  const csvCols = Object.keys(spec.columns);
  const isGeneral = spec.key === 'general';
  const dbCols = isGeneral
    ? [...Object.values(spec.columns), 'content_hash']
    : Object.values(spec.columns);
  const placeholders = dbCols.map(() => '?').join(', ');
  const insertSql = `INSERT INTO ${tableName} (${dbCols.join(', ')}) VALUES (${placeholders})`;

  let rowCount = 0;
  let batch = [];
  let headerChecked = false;
  let stoppedEarlyForTest = false;

  const flush = async () => {
    if (batch.length === 0) return;
    await client.batch(
      batch.map((args) => ({ sql: insertSql, args })),
      'write'
    );
    batch = [];
  };

  const toArgs = (record) => {
    const args = csvCols.map((c) => record[c] ?? null);
    if (isGeneral) args.push(digestByReport?.get(record.report_id) ?? ZERO_DIGEST);
    return args;
  };

  try {
    await pipeline(
      createReadStream(join(csvDir, spec.csvFile)),
      parse({ columns: true }),
      async function (records) {
        for await (const record of records) {
          if (!headerChecked) {
            const missing = csvCols.filter((c) => !(c in record));
            if (missing.length > 0) {
              throw new Error(
                `${spec.csvFile}: expected column(s) missing from CSV header: ${missing.join(', ')} — FAC may have changed their export schema. Aborting rather than guessing.`
              );
            }
            headerChecked = true;
          }
          batch.push(toArgs(record));
          rowCount++;
          if (batch.length >= BATCH_SIZE) {
            await flush();
            if (rowCount % 50_000 === 0) log(`  ${spec.csvFile}: ${rowCount} rows so far`);
          }
          if (TEST_MAX_ROWS_PER_TABLE !== null && rowCount >= TEST_MAX_ROWS_PER_TABLE) {
            log(`  ${spec.csvFile}: TEST MODE — stopping early at ${rowCount} rows`);
            stoppedEarlyForTest = true;
            break;
          }
        }
        await flush();
      }
    );
  } catch (err) {
    const abortLike =
      err?.code === 'ERR_STREAM_PREMATURE_CLOSE' ||
      err?.code === 'ABORT_ERR' ||
      err?.name === 'AbortError';
    if (!(stoppedEarlyForTest && abortLike)) throw err;
  }

  log(`${spec.csvFile}: ${rowCount} rows -> ${tableName}`);
  return rowCount;
}

/**
 * Download all 6 bulk CSVs to a scratch dir, with resume + retry (see
 * scripts/lib/download-csv.mjs). Decouples the fragile network transfer
 * from the row-by-row DB load — the load then reads a local file that
 * can't drop mid-stream. Returns the dir (or FAC_CSV_DIR unchanged).
 */
async function downloadAllCsvs() {
  if (FAC_CSV_DIR) return { dir: FAC_CSV_DIR, cleanup: async () => {} };
  const dir = await mkdtemp(join(tmpdir(), 'fac-sync-'));
  log(`downloading ${TABLES.length} CSVs -> ${dir}`);
  // In parallel — the 6 files are independent and total ~700 MB; six
  // concurrent curls finish in about the time of the largest one.
  await Promise.all(
    TABLES.map(async (spec) => {
      const bytes = await downloadWithResume(`${FAC_CSV_BASE}/${spec.csvFile}`, join(dir, spec.csvFile), {
        attempts: DOWNLOAD_MAX_ATTEMPTS,
        log,
      });
      log(`  ${spec.csvFile}: ${(bytes / 1e6).toFixed(1)} MB`);
    })
  );
  return { dir, cleanup: () => rm(dir, { recursive: true, force: true }).catch(() => {}) };
}

/**
 * Pass 1 — one streaming scan of every CSV, XOR-combining a per-row hash
 * (tagged by table) into a digest per report_id. Order-independent, so
 * the CSVs need no sorting; O(1) memory per report. Also does the header
 * check and returns the row count per table + the set of report_ids that
 * have a general row.
 */
async function computeDigests(csvDir) {
  const digestByReport = new Map();
  const generalReportIds = new Set();
  const rowCounts = {};

  for (const spec of TABLES) {
    const csvCols = Object.keys(spec.columns);
    let n = 0;
    let headerChecked = false;
    await pipeline(
      createReadStream(join(csvDir, spec.csvFile)),
      parse({ columns: true }),
      async function (records) {
        for await (const rec of records) {
          if (!headerChecked) {
            const missing = csvCols.filter((c) => !(c in rec));
            if (missing.length > 0) {
              throw new Error(
                `${spec.csvFile}: expected column(s) missing from CSV header: ${missing.join(', ')} — FAC may have changed their export schema. Aborting rather than guessing.`
              );
            }
            headerChecked = true;
          }
          const rid = rec.report_id;
          if (rid) {
            if (spec.key === 'general') generalReportIds.add(rid);
            const h = taggedRowHash(
              spec.key,
              csvCols.map((c) => rec[c] ?? null)
            );
            digestByReport.set(rid, xorHex(digestByReport.get(rid) ?? ZERO_DIGEST, h));
          }
          n++;
          if (TEST_MAX_ROWS_PER_TABLE !== null && n >= TEST_MAX_ROWS_PER_TABLE) break;
        }
      }
    );
    rowCounts[spec.key] = n;
  }
  return { digestByReport, generalReportIds, rowCounts };
}

/* ---- fac_mirror_meta: tiny key/value store for sync bookkeeping ---- */

// Hash of the mirrored column set. A change here means an old
// content_hash can't be compared to a new one — force a full reload.
const COLUMN_FINGERPRINT = hashRow(TABLES.flatMap((t) => [t.key, ...Object.keys(t.columns)]));

async function ensureMetaTable() {
  await client.execute(
    `CREATE TABLE IF NOT EXISTS fac_mirror_meta (key TEXT PRIMARY KEY, value TEXT)`
  );
}
async function readMeta(key) {
  await ensureMetaTable();
  const { rows } = await client.execute({
    sql: `SELECT value FROM fac_mirror_meta WHERE key = ?`,
    args: [key],
  });
  return rows[0]?.value ?? null;
}
async function writeMeta(key, value) {
  await ensureMetaTable();
  await client.execute({
    sql: `INSERT INTO fac_mirror_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    args: [key, value],
  });
}

/** Whether this run must be a full reload rather than an incremental diff. */
async function needsFullReload() {
  if (FULL_FLAG) return { full: true, why: '--full / SYNC_FULL' };
  if (TEST_MAX_ROWS_PER_TABLE !== null) return { full: true, why: 'TEST mode' };

  const info = await client
    .execute(`PRAGMA table_info(fac_mirror_general)`)
    .catch(() => ({ rows: [] }));
  const cols = new Set(info.rows.map((r) => r.name));
  if (cols.size === 0) return { full: true, why: 'fac_mirror_general does not exist yet' };
  if (!cols.has('content_hash')) return { full: true, why: 'no content_hash column' };

  const [{ n }] = (
    await client.execute(`SELECT count(*) n FROM fac_mirror_general`).catch(() => ({ rows: [{ n: 0 }] }))
  ).rows;
  if (Number(n) === 0) return { full: true, why: 'fac_mirror_general is empty' };

  if ((await readMeta('column_fingerprint')) !== COLUMN_FINGERPRINT) {
    return { full: true, why: 'mirrored column set changed' };
  }
  return { full: false };
}

/* ---- FULL reload (blue-green, unchanged apart from content_hash) ---- */

async function runFullReload(csvDir, digestByReport, idxSuffix) {
  const rowCounts = {};
  for (const spec of TABLES) {
    const newTableName = `${spec.liveTable}_new`;
    await client.execute(`DROP TABLE IF EXISTS ${newTableName}`);
    await client.execute(spec.ddl(newTableName));
    rowCounts[spec.key] = await loadTableFromFile(spec, newTableName, csvDir, digestByReport);
    for (const indexSql of spec.indexes(newTableName, idxSuffix)) {
      await client.execute(indexSql);
    }
  }

  rowCounts.auditor_firms = await buildAuditorFirmsTable(
    'fac_mirror_general_new',
    'fac_mirror_auditor_firms_new',
    idxSuffix
  );
  rowCounts.org_summary = await buildOrgSummaryTable(
    'fac_mirror_general_new',
    'fac_mirror_findings_new',
    'fac_mirror_org_summary_new',
    idxSuffix
  );

  log('swapping all tables into place');
  const existing = await client
    .execute(
      `SELECT name FROM sqlite_master WHERE type='table' AND name IN (${ALL_LIVE_TABLES.map(
        () => '?'
      ).join(',')})`,
      ALL_LIVE_TABLES
    )
    .catch(() => ({ rows: [] }));
  const liveTablesExist = new Set(existing.rows?.map((r) => r.name) ?? []);

  const finalSwap = [];
  for (const t of ALL_LIVE_TABLES) {
    if (liveTablesExist.has(t)) {
      finalSwap.push(`DROP TABLE IF EXISTS ${t}_old`);
      finalSwap.push(`ALTER TABLE ${t} RENAME TO ${t}_old`);
    }
    finalSwap.push(`ALTER TABLE ${t}_new RENAME TO ${t}`);
  }
  await client.batch(finalSwap, 'write');
  for (const t of ALL_LIVE_TABLES) {
    await client.execute(`DROP TABLE IF EXISTS ${t}_old`);
  }
  return rowCounts;
}

/* ---- INCREMENTAL: write only the reports that changed ---- */

const IN_CHUNK = 400; // report_ids per DELETE ... WHERE report_id IN (...)

async function deleteByReportIds(table, ids) {
  const list = [...ids];
  for (let i = 0; i < list.length; i += IN_CHUNK) {
    const chunk = list.slice(i, i + IN_CHUNK);
    await client.batch(
      [
        {
          sql: `DELETE FROM ${table} WHERE report_id IN (${chunk.map(() => '?').join(',')})`,
          args: chunk,
        },
      ],
      'write'
    );
  }
}

/** Rows from one CSV whose report_id is in `keep`, as INSERT arg arrays. */
async function collectRows(csvDir, spec, keep, digestByReport) {
  const csvCols = Object.keys(spec.columns);
  const isGeneral = spec.key === 'general';
  const out = [];
  await pipeline(
    createReadStream(join(csvDir, spec.csvFile)),
    parse({ columns: true }),
    async function (records) {
      for await (const rec of records) {
        if (!keep.has(rec.report_id)) continue;
        const args = csvCols.map((c) => rec[c] ?? null);
        if (isGeneral) args.push(digestByReport.get(rec.report_id) ?? ZERO_DIGEST);
        out.push(args);
      }
    }
  );
  return out;
}

async function insertRows(spec, table, rows) {
  if (rows.length === 0) return;
  const isGeneral = spec.key === 'general';
  const dbCols = isGeneral
    ? [...Object.values(spec.columns), 'content_hash']
    : Object.values(spec.columns);
  const insertSql = `INSERT INTO ${table} (${dbCols.join(', ')}) VALUES (${dbCols
    .map(() => '?')
    .join(', ')})`;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    await client.batch(
      rows.slice(i, i + BATCH_SIZE).map((args) => ({ sql: insertSql, args })),
      'write'
    );
  }
}

/**
 * Rebuild a derived table (org_summary / auditor_firms) from the
 * now-updated live base tables, but write only the delta — a week with
 * no material change writes ~0 rows instead of 68K.
 */
async function applyDerivedDelta(cols, keyIdx, keyCol, table, incomingRows) {
  const { rows: liveRows } = await client.execute(`SELECT ${cols.join(', ')} FROM ${table}`);
  const liveHashes = new Map();
  for (const r of liveRows) liveHashes.set(r[keyCol], hashRow(cols.map((c) => r[c] ?? null)));

  const incoming = incomingRows.map((row) => ({
    key: String(row[keyIdx]),
    hash: hashRow(row.map((v) => v ?? null)),
    row,
  }));
  const { upserts, deleteKeys } = deltaByKey(incoming, liveHashes);

  const ph = cols.map(() => '?').join(', ');
  const setClause = cols
    .filter((c) => c !== keyCol)
    .map((c) => `${c} = excluded.${c}`)
    .join(', ');
  for (let i = 0; i < upserts.length; i += BATCH_SIZE) {
    await client.batch(
      upserts.slice(i, i + BATCH_SIZE).map((row) => ({
        sql: `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${ph}) ON CONFLICT(${keyCol}) DO UPDATE SET ${setClause}`,
        args: row,
      })),
      'write'
    );
  }
  for (let i = 0; i < deleteKeys.length; i += IN_CHUNK) {
    const chunk = deleteKeys.slice(i, i + IN_CHUNK);
    await client.batch(
      [{ sql: `DELETE FROM ${table} WHERE ${keyCol} IN (${chunk.map(() => '?').join(',')})`, args: chunk }],
      'write'
    );
  }
  log(`  ${table}: +${upserts.length} ~/  -${deleteKeys.length}`);
  return { upserts: upserts.length, deletes: deleteKeys.length };
}

async function runIncremental(csvDir, digestByReport, generalReportIds) {
  // live per-report digests
  const live = new Map();
  let after = '';
  for (;;) {
    const { rows } = await client.execute({
      sql: `SELECT report_id, content_hash FROM fac_mirror_general WHERE report_id > ? ORDER BY report_id LIMIT 20000`,
      args: [after],
    });
    for (const r of rows) live.set(r.report_id, r.content_hash ?? '');
    if (rows.length < 20000) break;
    after = rows[rows.length - 1].report_id;
  }

  const { changed, removed, unchanged } = diffReports(digestByReport, live);
  assertDiffSane({
    changed,
    removed,
    incomingCount: generalReportIds.size,
    liveCount: live.size,
  });
  log(
    `incremental diff: ${changed.size} changed/new, ${removed.size} removed, ${unchanged} unchanged`
  );

  if (changed.size === 0 && removed.size === 0) {
    log('mirror already current — no reports changed, nothing to write');
    return { changed: 0, removed: 0, unchanged, writes: 0 };
  }

  const touched = new Set([...changed, ...removed]);

  // pass 2 — collect the rows we need to (re)insert for changed reports
  const rowsByKey = {};
  for (const spec of TABLES) {
    rowsByKey[spec.key] = await collectRows(csvDir, spec, changed, digestByReport);
  }

  // apply the base-table delta: clear every touched report, reinsert the
  // changed ones. Batched — a reader mid-apply may briefly see a changed
  // report's child rows lag its general row by a few seconds; acceptable
  // for a weekly reference mirror with the app's own live-fetch fallback.
  for (const spec of TABLES) await deleteByReportIds(spec.liveTable, touched);
  for (const spec of TABLES) await insertRows(spec, spec.liveTable, rowsByKey[spec.key]);

  // derived tables — recompute from the updated live tables, write only
  // the delta.
  const firmRows = await computeAuditorFirmRows(client, 'fac_mirror_general');
  const summaryRows = await computeOrgSummaryRows(
    client,
    'fac_mirror_general',
    'fac_mirror_findings'
  );
  const firmDelta = await applyDerivedDelta(
    ['auditor_ein', 'firm_name', 'city', 'state', 'audit_count', 'client_count', 'most_recent_year'],
    0,
    'auditor_ein',
    'fac_mirror_auditor_firms',
    firmRows
  );
  const sumDelta = await applyDerivedDelta(
    [
      'auditee_ein',
      'name',
      'state',
      'city',
      'audit_count',
      'most_recent_year',
      'total_expended',
      'findings_count',
      'is_going_concern',
      'is_low_risk',
    ],
    0,
    'auditee_ein',
    'fac_mirror_org_summary',
    summaryRows
  );

  const baseWrites =
    [...touched].length + TABLES.reduce((s, spec) => s + rowsByKey[spec.key].length, 0);
  return {
    changed: changed.size,
    removed: removed.size,
    unchanged,
    writes: baseWrites + firmDelta.upserts + firmDelta.deletes + sumDelta.upserts + sumDelta.deletes,
  };
}

async function main() {
  const syncId = randomUUID();
  const startedAt = new Date();
  const idxSuffix = syncId.replace(/-/g, '');

  await client.execute(`
    CREATE TABLE IF NOT EXISTS fac_mirror_sync_log (
      id TEXT PRIMARY KEY,
      started_at INTEGER NOT NULL,
      completed_at INTEGER,
      status TEXT NOT NULL,
      row_counts TEXT,
      error TEXT
    )
  `);
  await client.execute({
    sql: 'INSERT INTO fac_mirror_sync_log (id, started_at, status) VALUES (?, ?, ?)',
    args: [syncId, toEpochSeconds(startedAt), 'running'],
  });

  let downloaded = { dir: null, cleanup: async () => {} };
  try {
    const mode = await needsFullReload();
    if (mode.full && mode.why) log(`FULL reload (${mode.why})`);

    downloaded = await downloadAllCsvs();
    const { digestByReport, generalReportIds, rowCounts: csvRowCounts } = await computeDigests(
      downloaded.dir
    );

    let summary;
    if (mode.full) {
      const counts = await runFullReload(downloaded.dir, digestByReport, idxSuffix);
      summary = { mode: 'full', ...counts };
    } else {
      const result = await runIncremental(downloaded.dir, digestByReport, generalReportIds);
      summary = { mode: 'incremental', csv: csvRowCounts, ...result };
    }

    await writeMeta('column_fingerprint', COLUMN_FINGERPRINT);

    const payload =
      TEST_MAX_ROWS_PER_TABLE !== null ? { ...summary, TEST_RUN_TRUNCATED: true } : summary;
    await client.execute({
      sql: 'UPDATE fac_mirror_sync_log SET completed_at = ?, status = ?, row_counts = ? WHERE id = ?',
      args: [toEpochSeconds(new Date()), 'success', JSON.stringify(payload), syncId],
    });
    log(`sync complete: ${JSON.stringify(payload)}`);

    try {
      await writeSiteStats();
    } catch (err) {
      log(`site-stats refresh failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log(`SYNC FAILED: ${message}`);

    // A full reload leaves half-built `_new` tables; drop them. The
    // incremental path writes in place and is transactionally partial at
    // worst — the diff is idempotent, so the next run re-applies the
    // remainder.
    for (const t of ALL_LIVE_TABLES) {
      await client.execute(`DROP TABLE IF EXISTS ${t}_new`).catch(() => {});
    }

    await client.execute({
      sql: 'UPDATE fac_mirror_sync_log SET completed_at = ?, status = ?, error = ? WHERE id = ?',
      args: [toEpochSeconds(new Date()), 'failed', message, syncId],
    });
    await notifyOnFailure(message);
    process.exitCode = 1;
  } finally {
    await downloaded.cleanup();
  }
}

/**
 * Standalone-safe: does NOT import lib/send-owner-notification.ts,
 * which is guarded by `import 'server-only'` and lives inside the
 * Next.js app's module graph — this script runs in a separate GitHub
 * Actions job, not the Next.js build, so it talks to Resend directly
 * rather than depending on Next-specific module resolution. Silently
 * no-ops if RESEND_API_KEY isn't set, same fallback behavior as the
 * app's own email sending.
 */
async function notifyOnFailure(errorMessage) {
  const apiKey = process.env.RESEND_API_KEY;
  const notifyEmail = process.env.WAITLIST_NOTIFY_EMAIL;
  if (!apiKey || !notifyEmail) {
    log('RESEND_API_KEY or WAITLIST_NOTIFY_EMAIL not set — skipping failure email');
    return;
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev',
        to: notifyEmail,
        subject: 'FAC mirror sync failed',
        text: `The scheduled FAC bulk-CSV mirror sync failed:\n\n${errorMessage}\n\nThe live mirror tables were left untouched (still serving whatever data they had before this run). Check the GitHub Actions run log for the full trace.`,
      }),
    });
    if (!res.ok) {
      log(`failure-notification email itself failed to send: HTTP ${res.status}`);
    }
  } catch (err) {
    log(`failure-notification email itself threw: ${err instanceof Error ? err.message : String(err)}`);
  }
}

main()
  .catch((err) => {
    console.error('FATAL (outside the normal error handling path):', err);
    process.exitCode = 1;
  })
  .finally(() => client.close());
