import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  ein: text('ein'),
  orgName: text('org_name'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  lastLogin: integer('last_login', { mode: 'timestamp' }),
});

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

export const magicLinkTokens = sqliteTable('magic_link_tokens', {
  id: text('id').primaryKey(),
  email: text('email').notNull(),
  token: text('token').notNull().unique(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  usedAt: integer('used_at', { mode: 'timestamp' }),
});

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
