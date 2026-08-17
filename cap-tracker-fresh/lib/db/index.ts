import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from './schema';

const dbPath = process.env.DATABASE_URL || 'cap-tracker.db';
let sqlite: Database.Database;

try {
  sqlite = new Database(dbPath);
  sqlite.pragma('journal_mode = WAL');
} catch (e) {
  console.warn('SQLite failed to initialize, using fallback');
  sqlite = new Database(':memory:');
}

export const db = drizzle(sqlite, { schema });

// Initialize tables
function initializeTables() {
  try {
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        ein TEXT,
        org_name TEXT,
        created_at INTEGER NOT NULL,
        last_login INTEGER
      );

      CREATE TABLE IF NOT EXISTS audit_years (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        ein TEXT NOT NULL,
        fiscal_year_end TEXT,
        fac_report_id TEXT,
        raw_fac_data TEXT,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS findings (
        id TEXT PRIMARY KEY,
        audit_year_id TEXT NOT NULL,
        fac_finding_id TEXT,
        category TEXT,
        description TEXT NOT NULL,
        questioned_costs REAL,
        is_repeat_finding INTEGER DEFAULT 0,
        prior_finding_refs TEXT,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS cap_items (
        id TEXT PRIMARY KEY,
        finding_id TEXT NOT NULL,
        description TEXT NOT NULL,
        owner TEXT,
        due_date INTEGER,
        status TEXT DEFAULT 'open',
        notes TEXT,
        drafted_narrative TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS magic_link_tokens (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        token TEXT NOT NULL UNIQUE,
        expires_at INTEGER NOT NULL,
        used_at INTEGER
      );

      CREATE TABLE IF NOT EXISTS reminders (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        cap_item_id TEXT,
        days_before_due INTEGER,
        enabled INTEGER DEFAULT 0
      );
    `);
    console.log('✓ Database tables initialized');
  } catch (error) {
    console.error('Failed to initialize tables:', error);
  }
}

initializeTables();
