import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { capItems } from '@/lib/db/schema';
import { serializeCapItem } from '@/lib/db/serialize';

/**
 * PATCH /api/cap-items/:id
 * Update a CAP item
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { owner, dueDate, status, notes, description } = await req.json();

    const updates: Partial<typeof capItems.$inferInsert> = { updatedAt: new Date() };

    if (owner !== undefined) updates.owner = owner;
    if (dueDate !== undefined) updates.dueDate = dueDate ? new Date(dueDate) : null;
    if (status !== undefined) updates.status = status;
    if (notes !== undefined) updates.notes = notes;
    if (description !== undefined) updates.description = description;

    if (Object.keys(updates).length === 1) {
      // Only updatedAt got set — none of the actual fields were present.
      return NextResponse.json(
        { error: 'No fields to update' },
        { status: 400 }
      );
    }

    await db.update(capItems).set(updates).where(eq(capItems.id, id));

    const [item] = await db.select().from(capItems).where(eq(capItems.id, id)).limit(1);

    return NextResponse.json(serializeCapItem(item), { status: 200 });
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
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    await db.delete(capItems).where(eq(capItems.id, id));

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
