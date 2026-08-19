import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import * as schema from './schema';

/**
 * DATABASE_URL selects the backend by scheme, so local dev and production
 * use the exact same code path:
 *   - "file:cap-tracker.db"        local SQLite file (default if unset)
 *   - "libsql://<db>.turso.io"     hosted Turso database (needs TURSO_AUTH_TOKEN)
 *
 * Why libsql/Turso and not a plain local SQLite file in production: Vercel's
 * serverless functions have a read-only filesystem outside /tmp, and /tmp is
 * wiped between invocations. A local .db file works fine on a normal server
 * (which is what this app originally targeted — see DEPLOY.md, written for
 * Railway) but throws SQLITE_CANTOPEN on Vercel, and even /tmp would silently
 * lose data between cold starts. libSQL is wire-compatible with SQLite and
 * Drizzle's schema/query code is unchanged — only this client construction
 * differs from a plain better-sqlite3 setup.
 */
const url = process.env.DATABASE_URL || 'file:cap-tracker.db';
const authToken = process.env.TURSO_AUTH_TOKEN;

const client = createClient(authToken ? { url, authToken } : { url });

export const db = drizzle(client, { schema });

// Table creation is handled by `npx drizzle-kit push` (see drizzle.config.ts),
// not at runtime. A remote database shouldn't have every cold serverless
// start racing to CREATE TABLE IF NOT EXISTS against it.
