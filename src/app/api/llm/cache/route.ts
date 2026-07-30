// ============================================================
// GET /api/llm/cache — Statistiques du cache LLM
// ============================================================

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { getLLMCacheStats } = await import('@/lib/llm');
    const stats = getLLMCacheStats();

    return NextResponse.json({
      success: true,
      stats,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'LLM cache non disponible' },
      { status: 500 }
    );
  }
}
