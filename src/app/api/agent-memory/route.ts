import { NextRequest, NextResponse } from 'next/server';
import { agentMemorySystem, MemoryCategory, MemoryTier } from '@/lib/agent-memory-system';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const agentId = searchParams.get('agentId');
  const userId = searchParams.get('userId');
  const categoryParam = searchParams.get('category');

  if (!agentId || !userId) {
    return NextResponse.json(
      { error: 'agentId and userId query parameters are required' },
      { status: 400 }
    );
  }

  const category = categoryParam && Object.values(MemoryCategory).includes(categoryParam as MemoryCategory)
    ? (categoryParam as MemoryCategory)
    : undefined;

  try {
    const memories = await agentMemorySystem.getMemories(agentId, userId, category);
    return NextResponse.json({ success: true, memories });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to list memories' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { agentId, userId, key, value, tier, category, confidence, tags } = body;

    if (!agentId || !userId || !key || !value) {
      return NextResponse.json(
        { error: 'agentId, userId, key, and value are required' },
        { status: 400 }
      );
    }

    const memory = await agentMemorySystem.store({
      agentId,
      userId,
      key,
      value,
      tier: tier || MemoryTier.PERSISTENT,
      category: category || MemoryCategory.FACT,
      confidence: typeof confidence === 'number' ? confidence : 1.0,
      tags: Array.isArray(tags) ? tags : [],
      updatedAt: new Date().toISOString(),
      lastAccessedAt: new Date().toISOString(),
      accessCount: 0,
    });

    return NextResponse.json({ success: true, memory }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to store memory' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, memoryId, updates } = body;
    const targetId = id || memoryId;

    if (!targetId) {
      return NextResponse.json(
        { error: 'Memory ID (id or memoryId) is required' },
        { status: 400 }
      );
    }

    const memoryUpdates = updates || body;
    await agentMemorySystem.updateMemory(targetId, memoryUpdates);

    return NextResponse.json({ success: true, message: 'Memory updated successfully' });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to update memory' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  let id = searchParams.get('id') || searchParams.get('memoryId');

  if (!id) {
    try {
      const body = await request.json();
      id = body.id || body.memoryId;
    } catch {
      // ignore
    }
  }

  if (!id) {
    return NextResponse.json(
      { error: 'Memory ID (id or memoryId) is required' },
      { status: 400 }
    );
  }

  try {
    await agentMemorySystem.forget(id);
    return NextResponse.json({ success: true, message: 'Memory deleted successfully' });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to delete memory' },
      { status: 500 }
    );
  }
}
