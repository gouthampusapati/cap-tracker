import { NextRequest, NextResponse } from 'next/server';
import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';

const dbPath = process.env.DATABASE_URL || 'cap-tracker.db';
const sqlite = new Database(dbPath);

/**
 * GET /api/cap-items?findingId=X
 * Fetch CAP items for a specific finding
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const findingId = searchParams.get('findingId');

    if (!findingId) {
      return NextResponse.json(
        { error: 'findingId required' },
        { status: 400 }
      );
    }

    const items = sqlite
      .prepare('SELECT * FROM cap_items WHERE finding_id = ? ORDER BY created_at DESC')
      .all(findingId) as Array<any>;

    return NextResponse.json(items, { status: 200 });
  } catch (error) {
    console.error('Error fetching CAP items:', error);
    return NextResponse.json(
      { error: 'Failed to fetch CAP items' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/cap-items
 * Create a new CAP item
 */
export async function POST(req: NextRequest) {
  try {
    const { findingId, owner, dueDate, status, notes, description } = await req.json();

    if (!findingId) {
      return NextResponse.json(
        { error: 'findingId required' },
        { status: 400 }
      );
    }

    const id = randomUUID();
    const now = Date.now();

    sqlite.prepare(`
      INSERT INTO cap_items (id, finding_id, description, owner, due_date, status, notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      findingId,
      description || '',
      owner || '',
      dueDate ? new Date(dueDate).getTime() : null,
      status || 'open',
      notes || '',
      now,
      now
    );

    const item = sqlite.prepare('SELECT * FROM cap_items WHERE id = ?').get(id);

    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    console.error('Error creating CAP item:', error);
    return NextResponse.json(
      { error: 'Failed to create CAP item' },
      { status: 500 }
    );
  }
}
