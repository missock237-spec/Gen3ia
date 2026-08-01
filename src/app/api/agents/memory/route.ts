// ============================================================
// GET  /api/agents/memory — Mémoire épisodique d'un agent
// POST /api/agents/memory — Ajouter un souvenir
// POST /api/agents/memory/learn — Apprendre d'une interaction
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { applySecurity } from '@/lib/security';
import {
  storeMemory, retrieveMemories, learnFromInteraction, getAgentMemoryStats, pruneOldMemories,
  type MemoryCategory,
} from '@/lib/agent-memory';
import { createLogger } from '@/lib/logger';

const log = createLogger('api-memory');

// Catégories acceptées par l'API (strictement bornées, jamais de chaîne arbitraire)
const MEMORY_CATEGORIES: readonly MemoryCategory[] = ['preference', 'episodic', 'procedural', 'semantic', 'general'];

function parseMemoryCategory(value: string | null): MemoryCategory | undefined {
  return MEMORY_CATEGORIES.includes(value as MemoryCategory) ? (value as MemoryCategory) : undefined;
}

export async function GET(request: NextRequest) {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error || !auth) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  try {
    const { searchParams } = new URL(request.url);
    const agentId = searchParams.get('agentId');
    const query = searchParams.get('query') || '';
    const category = parseMemoryCategory(searchParams.get('category'));
    const limit = parseInt(searchParams.get('limit') || '10');
    const stats = searchParams.get('stats') === 'true';

    if (!agentId) {
      return NextResponse.json({ error: 'agentId requis' }, { status: 400 });
    }

    if (stats) {
      const memoryStats = await getAgentMemoryStats(agentId);
      return NextResponse.json({ success: true, stats: memoryStats });
    }

    if (query) {
      const memories = await retrieveMemories(agentId, auth.userId, query, { category, limit });
      return NextResponse.json({ success: true, memories, count: memories.length });
    }

    // Lister les souvenirs récents
    const memories = await prisma.agentMemory.findMany({
      where: { agentId, userId: auth.userId },
      orderBy: { lastAccessedAt: 'desc' },
      take: limit,
    });

    return NextResponse.json({ success: true, memories, count: memories.length });
  } catch (err) {
    log.error('memory_get_error', { error: String(err) });
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error || !auth) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  try {
    const body = await request.json();
    const { agentId, content, category, source, relevance, tags } = body;

    if (!agentId || !content) {
      return NextResponse.json({ error: 'agentId et content requis' }, { status: 400 });
    }

    const memory = await storeMemory(agentId, auth.userId, content, {
      category: parseMemoryCategory(category) ?? 'episodic',
      source: source || 'interaction',
      relevance: relevance || 0.7,
      tags: tags || [],
    });

    log.info('memory_stored', { agentId: agentId.slice(0, 8), category: memory.category });

    return NextResponse.json({ success: true, memory });
  } catch (err) {
    log.error('memory_store_error', { error: String(err) });
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error || !auth) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  try {
    const { searchParams } = new URL(request.url);
    const agentId = searchParams.get('agentId');
    const userMessage = searchParams.get('userMessage');
    const agentResponse = searchParams.get('agentResponse');

    if (!agentId || !userMessage) {
      return NextResponse.json({ error: 'agentId et userMessage requis' }, { status: 400 });
    }

    const learnings = await learnFromInteraction(agentId, auth.userId, userMessage, agentResponse || '');

    log.info('memory_learned', { agentId: agentId.slice(0, 8), learnings: learnings.length });

    return NextResponse.json({ success: true, learnings });
  } catch (err) {
    log.error('memory_learn_error', { error: String(err) });
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error || !auth) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  try {
    const { searchParams } = new URL(request.url);
    const agentId = searchParams.get('agentId');
    const prune = searchParams.get('prune') === 'true';

    if (!agentId) {
      return NextResponse.json({ error: 'agentId requis' }, { status: 400 });
    }

    if (prune) {
      const result = await pruneOldMemories(agentId);
      return NextResponse.json({ success: true, pruned: result.pruned, remaining: result.remaining });
    }

    return NextResponse.json({ error: 'Action non spécifiée' }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
