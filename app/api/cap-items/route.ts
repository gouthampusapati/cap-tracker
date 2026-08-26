import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { eq, desc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { capItems } from '@/lib/db/schema';
import { serializeCapItem } from '@/lib/db/serialize';
import { authorizeFindingAccess } from '@/lib/auth-guard';

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

    const authorized = await authorizeFindingAccess(findingId);
    if ('notFound' in authorized) return NextResponse.json([]);
    if ('response' in authorized) return authorized.response;

    const items = await db
      .select()
      .from(capItems)
      .where(eq(capItems.findingId, findingId))
      .orderBy(desc(capItems.createdAt));

    return NextResponse.json(items.map(serializeCapItem), { status: 200 });
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

    const authorized = await authorizeFindingAccess(findingId);
    if ('notFound' in authorized) {
      return NextResponse.json({ error: 'Finding not found' }, { status: 404 });
    }
    if ('response' in authorized) return authorized.response;

    const id = randomUUID();
    const now = new Date();

    await db.insert(capItems).values({
      id,
      findingId,
      description: description || '',
      owner: owner || '',
      dueDate: dueDate ? new Date(dueDate) : null,
      status: status || 'open',
      notes: notes || '',
      createdAt: now,
      updatedAt: now,
    });

    const [item] = await db.select().from(capItems).where(eq(capItems.id, id)).limit(1);

    return NextResponse.json(serializeCapItem(item), { status: 201 });
  } catch (error) {
    console.error('Error creating CAP item:', error);
    return NextResponse.json(
      { error: 'Failed to create CAP item' },
      { status: 500 }
    );
  }
}
