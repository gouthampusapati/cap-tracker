import { NextRequest, NextResponse } from 'next/server';
import Database from 'better-sqlite3';

const dbPath = process.env.DATABASE_URL || 'cap-tracker.db';
const sqlite = new Database(dbPath);

/**
 * PATCH /api/cap-items/:id
 * Update a CAP item
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const { owner, dueDate, status, notes, description } = await req.json();

    const now = Date.now();
    const updates: string[] = [];
    const values: any[] = [];

    if (owner !== undefined) {
      updates.push('owner = ?');
      values.push(owner);
    }
    if (dueDate !== undefined) {
      updates.push('due_date = ?');
      values.push(dueDate ? new Date(dueDate).getTime() : null);
    }
    if (status !== undefined) {
      updates.push('status = ?');
      values.push(status);
    }
    if (notes !== undefined) {
      updates.push('notes = ?');
      values.push(notes);
    }
    if (description !== undefined) {
      updates.push('description = ?');
      values.push(description);
    }

    if (updates.length === 0) {
      return NextResponse.json(
        { error: 'No fields to update' },
        { status: 400 }
      );
    }

    updates.push('updated_at = ?');
    values.push(now);
    values.push(id);

    sqlite.prepare(`
      UPDATE cap_items
      SET ${updates.join(', ')}
      WHERE id = ?
    `).run(...values);

    const item = sqlite.prepare('SELECT * FROM cap_items WHERE id = ?').get(id);

    return NextResponse.json(item, { status: 200 });
  } catch (error) {
    console.error('Error updating CAP item:', error);
    return NextResponse.json(
      { error: 'Failed to update CAP item' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/cap-items/:id
 * Delete a CAP item
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    sqlite.prepare('DELETE FROM cap_items WHERE id = ?').run(id);

    return NextResponse.json(
      { success: true, message: 'CAP item deleted' },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error deleting CAP item:', error);
    return NextResponse.json(
      { error: 'Failed to delete CAP item' },
      { status: 500 }
    );
  }
}
