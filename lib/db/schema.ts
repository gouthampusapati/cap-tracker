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
  category: text('category'),
  description: text('description').notNull(),
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
