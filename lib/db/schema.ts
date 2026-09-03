import { sql } from 'drizzle-orm';
import { sqliteTable, text, integer, real, primaryKey, index, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  ein: text('ein'),
  orgName: text('org_name'),
  // .default(...) added after a live bug: the Auth.js Drizzle adapter's
  // createUser only populates its own standard AdapterUser fields (id,
  // name, email, emailVerified, image) — it has no idea this app added
  // a required createdAt column, so it inserted NULL, which this NOT
  // NULL column then rejected with SQLITE_CONSTRAINT. Every account
  // tested before this always already had a users row from /api/import
  // (guest or typed-email), so it only ever hit the *update* path — a
  // genuinely brand-new sign-up (Google or magic-link) with no prior
  // row is what first hit the *insert* path and crashed. A DB-level
  // default fixes it for any caller that omits the column, not just
  // this one adapter method.
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  lastLogin: integer('last_login', { mode: 'timestamp' }),
  // Below: read by the Auth.js Drizzle adapter (see root auth.ts) for
  // Google sign-in. Nullable and unused for guest/typed-email rows —
  // those keep working exactly as before this was added.
  name: text('name'),
  image: text('image'),
  emailVerified: integer('email_verified', { mode: 'timestamp' }),
});

/**
 * Auth.js OAuth account link — one row per (provider, providerAccountId)
 * a user has signed in with, currently just Google. Column *property*
 * names below (refresh_token, access_token, etc.) look out of place next
 * to this file's usual camelCase, but they're not a style choice: the
 * Drizzle adapter's `DefaultSQLiteAccountsTable` type
 * (@auth/drizzle-adapter/lib/sqlite.d.ts) accesses these properties by
 * these exact snake_case names internally, so they can't be renamed. No
 * `sessions` table: sessions use Auth.js's JWT strategy (cookie-based, no
 * DB row). lib/auth-guard.ts treats "does this user have a row here" as
 * the signal that their account is real (Google- or email-linked) rather
 * than guest/never-signed-in — provider-agnostic, so magic-link sign-in
 * (provider: 'email', see verificationTokens below) needed zero changes
 * there.
 */
export const accounts = sqliteTable(
  'accounts',
  {
    userId: text('user_id').notNull(),
    type: text('type').notNull(),
    provider: text('provider').notNull(),
    providerAccountId: text('provider_account_id').notNull(),
    refresh_token: text('refresh_token'),
    access_token: text('access_token'),
    expires_at: integer('expires_at'),
    token_type: text('token_type'),
    scope: text('scope'),
    id_token: text('id_token'),
    session_state: text('session_state'),
  },
  (account) => ({
    compoundKey: primaryKey({ columns: [account.provider, account.providerAccountId] }),
  })
);

export const auditYears = sqliteTable('audit_years', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  ein: text('ein').notNull(),
  fiscalYearEnd: text('fiscal_year_end'),
  facReportId: text('fac_report_id'),
  rawFacData: text('raw_fac_data'), // JSON
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const findings = sqliteTable('findings', {
  id: text('id').primaryKey(),
  auditYearId: text('audit_year_id').notNull(),
  facFindingId: text('fac_finding_id'),
  // The FAC report this finding came from — distinct from audit_years.id
  // (an internal row id) and duplicating audit_years.fac_report_id, kept
  // directly on the finding so /api/findings can select it without
  // depending on the join. Previously added via a runtime ALTER TABLE in
  // app/api/import/route.ts because it was never added here; that hack is
  // gone now that it's part of the schema.
  facReportId: text('fac_report_id'),
  category: text('category'),
  description: text('description').notNull(),
  // The auditee's own corrective action plan narrative, as submitted to
  // the FAC. Same history as fac_report_id above — was runtime-patched
  // in, now part of the schema.
  plannedAction: text('planned_action'),
  questionedCosts: real('questioned_costs'),
  isRepeatFinding: integer('is_repeat_finding', { mode: 'boolean' }).default(false),
  priorFindingRefs: text('prior_finding_refs'), // JSON array
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const capItems = sqliteTable('cap_items', {
  id: text('id').primaryKey(),
  findingId: text('finding_id').notNull(),
  description: text('description').notNull(),
  owner: text('owner'),
  dueDate: integer('due_date', { mode: 'timestamp' }),
  status: text('status').default('open'), // open, in_progress, resolved
  notes: text('notes'),
  draftedNarrative: text('drafted_narrative'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

/**
 * Auth.js verification-token store for the Email (magic-link) provider —
 * see root auth.ts. Token generation, hashing, expiry-checking, and
 * one-time-use invalidation are all handled by @auth/core + the adapter
 * once this table is wired into DrizzleAdapter's verificationTokensTable
 * option; nothing here is queried directly by app code. Column names
 * (identifier/token/expires, not email/token/expiresAt) match Auth.js's
 * own expected shape, same reasoning as accounts' snake_case columns
 * above. Supersedes the old hand-rolled magic_link_tokens table (removed
 * — it was dead code, wrong shape for the adapter, and superseded by
 * this actual working implementation).
 */
export const verificationTokens = sqliteTable(
  'verification_tokens',
  {
    identifier: text('identifier').notNull(),
    token: text('token').notNull(),
    expires: integer('expires', { mode: 'timestamp' }).notNull(),
  },
  (vt) => ({
    compoundKey: primaryKey({ columns: [vt.identifier, vt.token] }),
  })
);

export const reminders = sqliteTable('reminders', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  capItemId: text('cap_item_id'),
  daysBeforeDue: integer('days_before_due'),
  enabled: integer('enabled', { mode: 'boolean' }).default(false),
});

/**
 * Public org data cache — unrelated to the private, user-tracked tables
 * above. Keyed on EIN only, no user association. Backs both
 * /single-audit/[ein] and /portfolio: a cache hit serves instantly and
 * doesn't touch the FAC at all, which matters given FAC's ~1,000/hour
 * shared quota — see lib/public-org-cache.ts for the read/write logic.
 * `snapshot` is the full ImportedOrg shape (lib/fac-api.ts) as JSON;
 * `found` distinguishes "FAC genuinely has zero reports for this EIN"
 * (cache the negative result too, worth remembering) from "we haven't
 * looked yet" (no row at all).
 */
export const publicOrgCache = sqliteTable('public_org_cache', {
  ein: text('ein').primaryKey(),
  found: integer('found', { mode: 'boolean' }).notNull(),
  snapshot: text('snapshot'), // JSON ImportedOrg, null when found = false
  syncedAt: integer('synced_at', { mode: 'timestamp' }).notNull(),
});

/**
 * Per-EIN cache of the SEFA award detail behind
 * /single-audit/[ein]/risk-assessment. That page's data (`federal_awards`
 * + `notes_to_sefa`) is the ONE public dataset not in the local bulk
 * mirror — the CSVs are ~1.3 GB / ~700 MB — so before this table every
 * uncached page render was 2 live FAC calls, and crawler traffic walking
 * the org-page → risk-assessment link (once per ISR window, per URL) kept
 * the shared FAC budget (lib/fac-budget.ts) pinned. This collapses that
 * to one fetch per EIN per filing-aware TTL (lib/federal-awards.ts),
 * exactly like public_org_cache does for the org page. `snapshot` is the
 * OrgAwardsData shape as JSON; `found` = false caches "this EIN has no
 * SEFA detail" so repeat crawls of a genuinely-empty EIN also cost 0.
 */
export const federalAwardsCache = sqliteTable('federal_awards_cache', {
  ein: text('ein').primaryKey(),
  found: integer('found', { mode: 'boolean' }).notNull(),
  snapshot: text('snapshot'), // JSON OrgAwardsData, null when found = false
  syncedAt: integer('synced_at', { mode: 'timestamp' }).notNull(),
});

/**
 * One row per live FAC fetch attempt (not per FAC call — each fetch is
 * ~4 calls, see lib/fac-api.ts). Backs the shared, site-wide throttle in
 * lib/fac-budget.ts: counting rows in the last hour tells every
 * serverless instance, across every consumer (org pages, /portfolio,
 * /api/org/[ein]), how much of FAC's shared ~1,000/hour quota has
 * already been spent — something a per-IP limiter can't do, since a
 * crawler's requests arrive from many different IPs. Rows older than a
 * couple of windows are pruned opportunistically; this table is meant to
 * stay small.
 */
export const facFetchLog = sqliteTable('fac_fetch_log', {
  id: text('id').primaryKey(),
  fetchedAt: integer('fetched_at', { mode: 'timestamp' }).notNull(),
});

/**
 * One row per individual FAC API call (the finer grain facFetchLog
 * doesn't capture — a "fetch" is ~4 of these). Written from
 * lib/fac-api.ts's facGet, powers the /admin/fac-usage day×hour report
 * and makes the api.data.gov rate-limit headers queryable instead of
 * console-only. Pruned opportunistically to ~14 days (lib/fac-usage.ts);
 * meant to stay small.
 *
 *  - `path`      FAC table hit ("general", "findings", "federal_awards"…)
 *  - `status`    HTTP status of the response (0 if the fetch threw)
 *  - `keyLabel`  which key served it — "primary" | "fallback"
 *  - `rateRemaining` / `rateLimit`  parsed x-ratelimit-* headers, or null
 */
export const facApiCallLog = sqliteTable(
  'fac_api_call_log',
  {
    id: text('id').primaryKey(),
    calledAt: integer('called_at', { mode: 'timestamp' }).notNull(),
    path: text('path').notNull(),
    status: integer('status').notNull(),
    keyLabel: text('key_label').notNull(),
    rateRemaining: integer('rate_remaining'),
    rateLimit: integer('rate_limit'),
  },
  (t) => ({
    calledAtIdx: index('fac_api_call_log_called_at_idx').on(t.calledAt),
  })
);

/**
 * Local mirror of FAC's bulk CSV export — Sprint 4,
 * FAC_API_Improvement_Sprint_Checklist.md. Populated ONLY by
 * scripts/sync-fac-mirror.mjs, via a blue-green table-rename swap, NOT
 * by `drizzle-kit push` the way every other table in this file is —
 * that script's raw CREATE TABLE SQL has to build a table under a
 * dynamic `_new` suffix name at runtime, which Drizzle's static schema
 * can't do itself. These declarations exist for the READ side
 * (lib/public-org-cache.ts querying the live, un-suffixed table names)
 * — the sync script's raw DDL is a separate representation of the exact
 * same column list. Change one, change the other; there's no single
 * source of truth enforcing that today, only this comment.
 *
 * Column sets are a SUBSET of each CSV's real columns — only the
 * fields lib/fac-api.ts's FacGeneral/FacFinding/FacFindingText/FacCap
 * interfaces actually read, verified live against real sample rows
 * 2026-08-27 to use the exact same column names and "Yes"/"No" /
 * "Y"/"N" value encodings as the live JSON API — so every existing
 * parsing helper (isYes, isYesNo, mapCategory, parseGaapResults, etc.)
 * runs unchanged against rows read from these tables.
 */
export const facMirrorGeneral = sqliteTable(
  'fac_mirror_general',
  {
    reportId: text('report_id').primaryKey(),
    auditeeEin: text('auditee_ein').notNull(),
    auditeeUei: text('auditee_uei'),
    auditeeName: text('auditee_name'),
    // Auditee location — added for the SEO landing pages (state org
    // index). Feeds fac_mirror_org_summary; also shown on the org page.
    auditeeCity: text('auditee_city'),
    auditeeState: text('auditee_state'),
    // Auditee contact — the audited org's own contact person, for
    // outbound outreach. Public record (FAC dissemination). Same "keep
    // in lockstep with scripts/sync-fac-mirror.mjs's CREATE DDL + CSV
    // column map" rule as every fac_mirror_* column; verified against
    // general.csv's live header 2026-09-01.
    auditeeContactName: text('auditee_contact_name'),
    auditeeContactTitle: text('auditee_contact_title'),
    auditeeEmail: text('auditee_email'),
    auditeePhone: text('auditee_phone'),
    auditYear: text('audit_year'),
    fyEndDate: text('fy_end_date'),
    fyStartDate: text('fy_start_date'),
    totalAmountExpended: real('total_amount_expended'),
    entityType: text('entity_type'),
    isLowRiskAuditee: text('is_low_risk_auditee'),
    isGoingConcernIncluded: text('is_going_concern_included'),
    isMaterialNoncomplianceDisclosed: text('is_material_noncompliance_disclosed'),
    gaapResults: text('gaap_results'),
    auditorFirmName: text('auditor_firm_name'),
    auditorEin: text('auditor_ein'),
    // Auditor firm listing fields — added Sprint C for the /auditors
    // directory. All public record (FAC dissemination); contactName /
    // email are individuals, surfaced more cautiously in the UI.
    auditorCity: text('auditor_city'),
    auditorState: text('auditor_state'),
    auditorZip: text('auditor_zip'),
    auditorAddressLine1: text('auditor_address_line_1'),
    auditorPhone: text('auditor_phone'),
    auditorContactName: text('auditor_contact_name'),
    auditorEmail: text('auditor_email'),
    cognizantAgency: text('cognizant_agency'),
    oversightAgency: text('oversight_agency'),
    facAcceptedDate: text('fac_accepted_date'),
    // Per-report content digest maintained by scripts/sync-fac-mirror.mjs
    // for its incremental diff — not read by the app. Kept here so the
    // Drizzle schema stays column-for-column with the sync's raw DDL.
    contentHash: text('content_hash'),
  },
  (t) => ({
    einIdx: index('fac_mirror_general_ein_idx').on(t.auditeeEin),
    auditorEinIdx: index('fac_mirror_general_auditor_ein_idx').on(t.auditorEin),
    auditorStateIdx: index('fac_mirror_general_auditor_state_idx').on(t.auditorState),
  })
);

/**
 * Derived, NOT loaded from a CSV — one row per audit firm (~8.4K),
 * pre-aggregated from fac_mirror_general by scripts/sync-fac-mirror.mjs
 * (buildAuditorFirmsTable) and swapped in with the rest of the mirror.
 * Backs the /auditors directory: an indexed LIMIT scan here replaces a
 * full GROUP BY + count(distinct) over every ~413K general row per
 * request (~4.5s before). firm_name / city / state are the modal
 * (most-frequent) values per firm, tie-broken by most-recent audit year
 * — matches lib/auditors-shared.ts pickFirmName. Index names below are
 * informational; the sync script owns the real (suffixed) ones.
 */
export const facMirrorAuditorFirms = sqliteTable(
  'fac_mirror_auditor_firms',
  {
    auditorEin: text('auditor_ein').primaryKey(),
    firmName: text('firm_name'),
    city: text('city'),
    state: text('state'),
    auditCount: integer('audit_count').notNull(),
    clientCount: integer('client_count').notNull(),
    mostRecentYear: text('most_recent_year'),
  },
  (t) => ({
    stateCountIdx: index('fac_mirror_auditor_firms_state_count_idx').on(t.state, t.auditCount),
    countIdx: index('fac_mirror_auditor_firms_count_idx').on(t.auditCount),
  })
);

/**
 * Derived — one row per audited organization (~68K), pre-aggregated from
 * fac_mirror_general + fac_mirror_findings by scripts/sync-fac-mirror.mjs
 * (buildOrgSummaryTable), swapped in with the rest of the mirror. Backs
 * the SEO landing pages: the /single-audit hub and /single-audit/state/*
 * state indexes read this instead of a full GROUP BY + findings JOIN
 * over ~413K general rows per request. name / state / city /
 * total_expended / is_going_concern / is_low_risk are the org's
 * MOST-RECENT audit year; findings_count and audit_count span all years.
 * Index names below are informational; the sync script owns the real
 * (suffixed) ones.
 */
export const facMirrorOrgSummary = sqliteTable(
  'fac_mirror_org_summary',
  {
    auditeeEin: text('auditee_ein').primaryKey(),
    name: text('name'),
    state: text('state'),
    city: text('city'),
    auditCount: integer('audit_count').notNull(),
    mostRecentYear: text('most_recent_year'),
    totalExpended: real('total_expended'),
    findingsCount: integer('findings_count').notNull().default(0),
    isGoingConcern: integer('is_going_concern').notNull().default(0),
    isLowRisk: integer('is_low_risk').notNull().default(0),
  },
  (t) => ({
    stateExpIdx: index('fac_mirror_org_summary_state_exp_idx').on(t.state, t.totalExpended),
    goingConcernIdx: index('fac_mirror_org_summary_gc_exp_idx').on(t.isGoingConcern, t.totalExpended),
    auditsIdx: index('fac_mirror_org_summary_audits_idx').on(t.auditCount),
  })
);

export const facMirrorFindings = sqliteTable(
  'fac_mirror_findings',
  {
    // Synthetic key, not (report_id, reference_number, award_reference)
    // — matches the live API's /findings shape, one row per award a
    // finding is cited against; dedupeFindingRows collapses this the
    // same way regardless of which source (API or mirror) the rows
    // came from.
    id: integer('id').primaryKey({ autoIncrement: true }),
    reportId: text('report_id').notNull(),
    auditYear: text('audit_year'),
    referenceNumber: text('reference_number').notNull(),
    awardReference: text('award_reference'),
    typeRequirement: text('type_requirement'),
    isMaterialWeakness: text('is_material_weakness'),
    isSignificantDeficiency: text('is_significant_deficiency'),
    isModifiedOpinion: text('is_modified_opinion'),
    isOtherMatters: text('is_other_matters'),
    isOtherFindings: text('is_other_findings'),
    isQuestionedCosts: text('is_questioned_costs'),
    isRepeatFinding: text('is_repeat_finding'),
    priorFindingRefNumbers: text('prior_finding_ref_numbers'),
  },
  (t) => ({
    reportIdx: index('fac_mirror_findings_report_idx').on(t.reportId),
  })
);

export const facMirrorFindingsText = sqliteTable(
  'fac_mirror_findings_text',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    reportId: text('report_id').notNull(),
    findingRefNumber: text('finding_ref_number').notNull(),
    findingText: text('finding_text'),
    containsChartOrTable: text('contains_chart_or_table'),
  },
  (t) => ({
    reportRefIdx: index('fac_mirror_findings_text_report_ref_idx').on(t.reportId, t.findingRefNumber),
  })
);

export const facMirrorCorrectiveActionPlans = sqliteTable(
  'fac_mirror_corrective_action_plans',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    reportId: text('report_id').notNull(),
    findingRefNumber: text('finding_ref_number').notNull(),
    plannedAction: text('planned_action'),
    containsChartOrTable: text('contains_chart_or_table'),
  },
  (t) => ({
    reportRefIdx: index('fac_mirror_cap_report_ref_idx').on(t.reportId, t.findingRefNumber),
  })
);

/**
 * Sprint 5 — additional EINs / UEIs an audit was filed under, keyed on
 * report_id (the extras beyond general.auditee_ein / .auditee_uei).
 * Read side for lib/entity-resolution.ts; populated by
 * scripts/sync-fac-mirror.mjs like every other fac_mirror_* table (raw
 * DDL + blue-green swap, NOT drizzle-kit push — index names here are
 * informational, the sync script owns the real ones).
 */
export const facMirrorAdditionalEins = sqliteTable(
  'fac_mirror_additional_eins',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    reportId: text('report_id').notNull(),
    auditeeUei: text('auditee_uei'),
    auditYear: text('audit_year'),
    additionalEin: text('additional_ein').notNull(),
  },
  (t) => ({
    reportIdx: index('fac_mirror_additional_eins_report_idx').on(t.reportId),
    einIdx: index('fac_mirror_additional_eins_ein_idx').on(t.additionalEin),
  })
);

export const facMirrorAdditionalUeis = sqliteTable(
  'fac_mirror_additional_ueis',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    reportId: text('report_id').notNull(),
    auditeeUei: text('auditee_uei'),
    auditYear: text('audit_year'),
    additionalUei: text('additional_uei').notNull(),
  },
  (t) => ({
    reportIdx: index('fac_mirror_additional_ueis_report_idx').on(t.reportId),
    ueiIdx: index('fac_mirror_additional_ueis_uei_idx').on(t.additionalUei),
  })
);

/**
 * Derived — one row per pass-through ENTITY, keyed by its normalized
 * name (FAC's passthrough.csv gives pass-throughs a free-text name only,
 * no EIN). Carries how many audited subrecipients name it as their
 * pass-through: a floor on that entity's subrecipient-portfolio size,
 * used as "signal 2" of cold-outreach pass-through targeting.
 *
 * Built by scripts/build-passthrough-summary.mjs (a SEPARATE weekly job,
 * not sync-fac-mirror.mjs — passthrough.csv is ~530MB / ~4.9M rows and
 * is never mirrored raw, only streamed + aggregated). Blue-green swap,
 * raw DDL — NOT drizzle-kit push. Join to it with the shared matcher in
 * scripts/lib/passthrough-name.mjs, never a bare name equality.
 */
export const facMirrorPassthroughSummary = sqliteTable(
  'fac_mirror_passthrough_summary',
  {
    normName: text('norm_name').primaryKey(),
    sampleName: text('sample_name'),
    subrecipientCountRecent: integer('subrecipient_count_recent').notNull().default(0),
    subrecipientCountAll: integer('subrecipient_count_all').notNull().default(0),
    subawardRows: integer('subaward_rows').notNull().default(0),
  },
  (t) => ({
    recentIdx: index('fac_mirror_passthrough_summary_recent_idx').on(t.subrecipientCountRecent),
  })
);

/**
 * One row per sync attempt (not per table) — lets the app and a human
 * both tell how fresh the mirror actually is, and makes a failed sync
 * visible instead of silently leaving stale data in place indefinitely.
 * `rowCounts` is JSON ({general: n, findings: n, ...}), set on success;
 * `error` set on failure. status: 'running' | 'success' | 'failed'.
 */
export const facMirrorSyncLog = sqliteTable('fac_mirror_sync_log', {
  id: text('id').primaryKey(),
  startedAt: integer('started_at', { mode: 'timestamp' }).notNull(),
  completedAt: integer('completed_at', { mode: 'timestamp' }),
  status: text('status').notNull(),
  rowCounts: text('row_counts'),
  error: text('error'),
});

/**
 * Small key/value store for the mirror sync's own bookkeeping — created
 * and written only by scripts/sync-fac-mirror.mjs, not read by the app.
 * Currently just `column_fingerprint` (a hash of the mirrored column
 * set): if it changes, the incremental diff can't trust an old
 * content_hash and the next run does a full reload instead.
 */
export const facMirrorMeta = sqliteTable('fac_mirror_meta', {
  key: text('key').primaryKey(),
  value: text('value'),
});

/**
 * Founding Customer Program signups — the qualifying form on /pricing
 * (app/waitlist-form.tsx), plus the dashboard's "Generate Draft"
 * feature-demand CTA (a different intent, disambiguated by `source`).
 *
 * Replaces the old `waitlist_signups` table (dropped — it only ever
 * held the owner's own test rows). No uniqueness constraint on email:
 * the same person signing up from two CTAs is two distinct outreach
 * signals, not a duplicate. `source` / `segment` / `interestLevel` /
 * `orgCount` / `currentMethod` are validated against fixed allowlists
 * at the API layer (app/api/waitlist/route.ts), not here.
 *
 * `segment` (role) is required at the form/API layer for every signup;
 * `interestLevel` + `orgCount` are required for the qualifying form;
 * `organization` + `currentMethod` are always optional. All nullable at
 * the DB level (the dashboard CTA sends only segment + email). There is
 * deliberately NO willingness-to-pay column — that signal comes from
 * the sales conversation, not a radio button.
 */
export const foundingSignups = sqliteTable('founding_signups', {
  id: text('id').primaryKey(),
  email: text('email').notNull(),
  source: text('source').notNull(),
  ein: text('ein'), // set when the signup came from an org page; null otherwise
  segment: text('segment'),
  organization: text('organization'), // optional free-text org/firm name (qualifying form only)
  interestLevel: text('interest_level'),
  orgCount: text('org_count'),
  currentMethod: text('current_method'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

/* ---------------------------------------------------------------------- *
 * Continuous monitoring — the paid "Stop checking. Start monitoring."
 * product (Founding Customer Validation Plan). A customer saves EINs to
 * a watchlist; scripts/monitor-fac-changes.mjs runs weekly (after the
 * FAC mirror sync), diffs each watched org's current mirror state
 * against the last-seen snapshot we persist here, and emails a digest.
 *
 * These are app-owned tables (plain additive DDL, migrated by
 * scripts/create-monitor-tables.mjs) — NOT the fac_mirror_* blue-green
 * path. Timestamps are SECONDS-since-epoch (Drizzle `mode: 'timestamp'`).
 * ---------------------------------------------------------------------- */

/**
 * Who is allowed to use continuous monitoring, and until when. During
 * validation this is a hand-managed allowlist (Turso dashboard, or
 * scripts/grant-monitor-access.mjs) — a pilot customer / test user gets
 * a row with an expiry. The monitor job and (PR 2) the watchlist UI
 * check `now < expires_at`; an expired or absent grant means no alerts
 * and no digest. Keyed on lowercased email so a grant can be created
 * before the user has ever signed in.
 */
export const monitorAccess = sqliteTable('monitor_access', {
  email: text('email').primaryKey(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  grantedAt: integer('granted_at', { mode: 'timestamp' }).notNull(),
  note: text('note'),
});

/** One row per (user, monitored org). userId is users.id. */
export const watchlist = sqliteTable(
  'watchlist',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    ein: text('ein').notNull(),
    // Snapshot of the org name when it was added — for the digest and
    // the /watchlist UI without a join. Refreshed by the monitor job.
    label: text('label'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  },
  (t) => ({
    userEinIdx: uniqueIndex('watchlist_user_ein_idx').on(t.userId, t.ein),
    einIdx: index('watchlist_ein_idx').on(t.ein),
  })
);

/**
 * Last-seen FAC state per watched EIN — NOT per user (the FAC record is
 * the same for everyone watching that org). The mirror keeps no history
 * (blue-green swap drops `_old` weekly), so a change is only detectable
 * against a snapshot we persist ourselves. A watched EIN with no row
 * here yet is baselined on the next monitor run (recorded, no alerts) —
 * monitoring is "tell me what changes from now on".
 */
export const monitorState = sqliteTable('monitor_state', {
  ein: text('ein').primaryKey(),
  orgName: text('org_name'),
  latestReportId: text('latest_report_id'),
  latestAuditYear: text('latest_audit_year'),
  latestFacAcceptedDate: text('latest_fac_accepted_date'),
  // JSON string[] of "<reportId>::<referenceNumber>" for every finding
  // seen, and the subset flagged as a repeat finding.
  findingRefs: text('finding_refs'),
  repeatFindingRefs: text('repeat_finding_refs'),
  // The soonest management-decision deadline (YYYY-MM-DD) across the
  // org's reports, and the deadline label we last sent a `deadline`
  // alert for — so a deadline entering the 30-day window alerts once.
  soonestMdDeadline: text('soonest_md_deadline'),
  mdDeadlineAlerted: text('md_deadline_alerted'),
  checkedAt: integer('checked_at', { mode: 'timestamp' }).notNull(),
});

/**
 * One row per (user, org, change). Written by the monitor job, cleared
 * of "unsent" status by the digest phase. `payloadJson` carries whatever
 * the digest and the /watchlist feed need to render the line without a
 * FAC read (org name, audit year, finding ref/description, deadline).
 */
export const monitorAlert = sqliteTable(
  'monitor_alert',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    ein: text('ein').notNull(),
    // 'new_audit' | 'new_finding' | 'repeat_finding' | 'deadline'
    type: text('type').notNull(),
    payloadJson: text('payload_json').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    digestSentAt: integer('digest_sent_at', { mode: 'timestamp' }),
  },
  (t) => ({
    userUnsentIdx: index('monitor_alert_user_unsent_idx').on(t.userId, t.digestSentAt),
  })
);

/** Per-user monitor preferences. Currently just the digest opt-out that
 * backs the email unsubscribe link (app/api/monitor/unsubscribe). */
export const monitorPrefs = sqliteTable('monitor_prefs', {
  userId: text('user_id').primaryKey(),
  digestOptOut: integer('digest_opt_out', { mode: 'boolean' }).notNull().default(false),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});
