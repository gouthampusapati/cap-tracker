import type { capItems } from './schema';

/**
 * The dashboard (app/dashboard/page.tsx) expects CAP items shaped like the
 * raw SQLite rows the old direct-better-sqlite3 routes returned —
 * snake_case keys, timestamps as epoch-ms numbers — not Drizzle's mapped
 * camelCase objects with Date instances. Converting explicitly here keeps
 * the API's wire contract unchanged while the actual DB access moves to
 * Drizzle, without having to touch the dashboard itself.
 */
export function serializeCapItem(item: typeof capItems.$inferSelect) {
  return {
    id: item.id,
    finding_id: item.findingId,
    description: item.description,
    owner: item.owner,
    due_date: item.dueDate ? item.dueDate.getTime() : null,
    status: item.status,
    notes: item.notes,
    drafted_narrative: item.draftedNarrative,
    created_at: item.createdAt.getTime(),
    updated_at: item.updatedAt.getTime(),
  };
}
