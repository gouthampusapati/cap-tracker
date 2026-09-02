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
import { Readable } from 'node:stream';
import { createReadStream } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { pipeline } from 'node:stream/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { isRetriableDownloadError } from './lib/retriable-download.mjs';
import { downloadWithResume } from './lib/download-csv.mjs';
import { hashRow, taggedRowHash, xorHex, ZERO_DIGEST } from './lib/row-hash.mjs';
import { diffReports, assertDiffSane, deltaByKey } from './lib/mirror-diff.mjs';

// TEST-ONLY: read the CSVs from a local directory instead of FAC. Set by
// test/mirror-sync-equivalence.test.ts so the sync can run end-to-end
// against a committed fixture with no network. Never set in CI/prod.
const FAC_CSV_DIR = process.env.FAC_CSV_DIR || null;

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

// FAC's bulk CSVs are large (general.csv alone is hundreds of MB) and
// their CDN occasionally drops a long transfer mid-stream. loadTable()
// retries a failed/truncated download this many times, with exponential
// backoff from this base, re-creating the empty `_new` table first. A
// non-transient error (schema drift, HTTP 4xx) is never retried.
const DOWNLOAD_MAX_ATTEMPTS = 4;
const DOWNLOAD_RETRY_BASE_MS = 5_000;

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
async function loadTableOnce(spec, newTableName) {
  // Local fixture dir (tests) vs a real FAC download.
  const source = FAC_CSV_DIR
    ? createReadStream(join(FAC_CSV_DIR, spec.csvFile))
    : await (async () => {
        const res = await fetch(`${FAC_CSV_BASE}/${spec.csvFile}`);
        if (!res.ok) {
          const err = new Error(`FAC bulk download for ${spec.csvFile} returned HTTP ${res.status}`);
          err.httpStatus = res.status;
          throw err;
        }
        return Readable.fromWeb(res.body);
      })();

  const csvCols = Object.keys(spec.columns);
  const dbCols = Object.values(spec.columns);
  const placeholders = dbCols.map(() => '?').join(', ');
  const insertSql = `INSERT INTO ${newTableName} (${dbCols.join(', ')}) VALUES (${placeholders})`;

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

  try {
    await pipeline(
      source,
      // relax_column_count deliberately left at its default (false) — a
      // header/data mismatch (FAC changing a column set out from under
      // us) should abort the sync loudly, not silently misalign columns.
      // See the FAC_API_Improvement Sprint 4 plan's "schema drift" crack.
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

          batch.push(csvCols.map((c) => record[c] ?? null));
          rowCount++;

          if (batch.length >= BATCH_SIZE) {
            await flush();
            if (rowCount % 50_000 === 0) log(`  ${spec.csvFile}: ${rowCount} rows so far`);
          }

          if (TEST_MAX_ROWS_PER_TABLE !== null && rowCount >= TEST_MAX_ROWS_PER_TABLE) {
            log(`  ${spec.csvFile}: TEST MODE — stopping early at ${rowCount} rows (SYNC_TEST_MAX_ROWS_PER_TABLE set)`);
            stoppedEarlyForTest = true;
            break;
          }
        }
        await flush();
      }
    );
  } catch (err) {
    // Deliberate TEST-MODE early stop: breaking out of the consumer makes
    // pipeline tear down the still-flowing download, which surfaces as an
    // abort / premature-close (the exact code varies by Node version).
    // Not a real failure — everything we meant to load is already
    // committed. Any genuine mid-stream download error happens with
    // stoppedEarlyForTest still false and propagates normally.
    const abortLike =
      err?.code === 'ERR_STREAM_PREMATURE_CLOSE' ||
      err?.code === 'ABORT_ERR' ||
      err?.name === 'AbortError';
    if (!(stoppedEarlyForTest && abortLike)) {
      throw err;
    }
  }

  log(`${spec.csvFile}: ${rowCount} rows loaded into ${newTableName}`);
  return rowCount;
}

/**
 * loadTableOnce with bounded retries for a dropped or truncated
 * download. A retriable failure re-creates the (now partially filled)
 * `_new` table empty and tries again with exponential backoff; a
 * schema-drift or HTTP-4xx error is not retriable and aborts the sync
 * immediately, exactly as before.
 */
async function loadTable(spec, newTableName) {
  log(`downloading ${spec.csvFile} -> ${newTableName}`);
  for (let attempt = 1; ; attempt++) {
    try {
      return await loadTableOnce(spec, newTableName);
    } catch (err) {
      if (attempt >= DOWNLOAD_MAX_ATTEMPTS || !isRetriableDownloadError(err)) throw err;
      const backoffMs = DOWNLOAD_RETRY_BASE_MS * 2 ** (attempt - 1);
      const message = err instanceof Error ? err.message : String(err);
      log(
        `  ${spec.csvFile}: download failed on attempt ${attempt}/${DOWNLOAD_MAX_ATTEMPTS} (${message}) — retrying in ${backoffMs}ms`
      );
      await sleep(backoffMs);
      // The failed attempt may have inserted a partial prefix of the
      // file — start the retry from a clean, empty table.
      await client.execute(`DROP TABLE IF EXISTS ${newTableName}`);
      await client.execute(spec.ddl(newTableName));
    }
  }
}

async function main() {
  const syncId = randomUUID();
  const startedAt = new Date();

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

  const rowCounts = {};
  // Index names must be globally unique in SQLite and, critically, an
  // index does NOT get renamed when its table does (ALTER TABLE RENAME
  // only renames the table) — so an index built on `<table>_new` keeps
  // that literal name forever after the swap, and the NEXT run's
  // CREATE INDEX with the same name collides with it. Suffixing with
  // this run's syncId (hyphens stripped — not a valid identifier char)
  // guarantees each run's index names are new; the stale-named index
  // from the previous run is dropped automatically when its now-`_old`
  // table gets dropped a few lines below. Caught by an actual second
  // local test run before this was ever scheduled to run twice for
  // real — see the Sprint 4 build notes.
  const idxSuffix = syncId.replace(/-/g, '');

  try {
    for (const spec of TABLES) {
      const newTableName = `${spec.liveTable}_new`;
      await client.execute(`DROP TABLE IF EXISTS ${newTableName}`);
      await client.execute(spec.ddl(newTableName));
      const count = await loadTable(spec, newTableName);
      rowCounts[spec.key] = count;
      for (const indexSql of spec.indexes(newTableName, idxSuffix)) {
        await client.execute(indexSql);
      }
    }

    // Derived tables — built from the `_new` CSV data just loaded, then
    // swapped in with everything else below.
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

    // Atomic swap, every table (CSV-loaded + derived) in one
    // transaction — either all of them flip to the new data or none do.
    log('swapping all tables into place');

    // First run ever: the live tables don't exist yet, so a
    // `RENAME <live> TO <live>_old` would fail. Detect that per-table
    // and skip the rename-out step for any that aren't there yet.
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

    const completedAt = new Date();
    const rowCountsPayload =
      TEST_MAX_ROWS_PER_TABLE !== null ? { ...rowCounts, TEST_RUN_TRUNCATED: true } : rowCounts;
    await client.execute({
      sql: 'UPDATE fac_mirror_sync_log SET completed_at = ?, status = ?, row_counts = ? WHERE id = ?',
      args: [toEpochSeconds(completedAt), 'success', JSON.stringify(rowCountsPayload), syncId],
    });
    log(`sync complete: ${JSON.stringify(rowCountsPayload)}`);

    // Homepage stat-bar numbers. Non-fatal: the mirror is already
    // swapped and healthy at this point — a stats failure must not turn
    // a successful sync into a failed one.
    try {
      await writeSiteStats();
    } catch (err) {
      log(`site-stats refresh failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log(`SYNC FAILED: ${message}`);

    // Leave live tables untouched — just drop whatever `_new` tables
    // got partway built, so a retry starts clean.
    for (const t of ALL_LIVE_TABLES) {
      await client.execute(`DROP TABLE IF EXISTS ${t}_new`).catch(() => {});
    }

    await client.execute({
      sql: 'UPDATE fac_mirror_sync_log SET completed_at = ?, status = ?, error = ? WHERE id = ?',
      args: [toEpochSeconds(new Date()), 'failed', message, syncId],
    });

    await notifyOnFailure(message);
    process.exitCode = 1;
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
