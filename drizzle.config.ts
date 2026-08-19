import { defineConfig } from 'drizzle-kit';
import { readFileSync, existsSync } from 'node:fs';

// Unlike Next.js, the drizzle-kit CLI doesn't auto-load .env.local — without
// this, `npx drizzle-kit push` silently falls back to the default local
// SQLite file instead of Turso, with no indication it targeted the wrong
// database. (Found this the hard way: the first push run warned about
// dropping columns from a *local* findings table that doesn't exist on
// Turso at all.)
if (existsSync('.env.local')) {
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const match = line.match(/^([A-Z_]+)=(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
}

export default defineConfig({
  schema: './lib/db/schema.ts',
  out: './drizzle',
  dialect: 'turso',
  dbCredentials: {
    url: process.env.DATABASE_URL || 'file:cap-tracker.db',
    authToken: process.env.TURSO_AUTH_TOKEN,
  },
});
