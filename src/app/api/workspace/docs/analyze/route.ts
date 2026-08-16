import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { documentAnalyzer } from '@/lib/workspace-tools/document-analyzer';

export const maxDuration = 30;
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session?.user.id) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const { content, language } = await request.json();
    if (!content || typeof content !== 'string') {
      return NextResponse.json({ error: 'Contenu requis' }, { status: 400 });
    }
    if (content.length > 100000) {
      return NextResponse.json({ error: 'Document trop long (max 100KB)' }, { status: 400 });
    }

    const analysis = await documentAnalyzer.analyze(content, { language });

    await prisma.agentActionLog.create({
      data: {
        action: 'workspace:docs:analyze',
        details: JSON.stringify({ wordCount: analysis.wordCount, language: analysis.language }),
        status: 'completed',
        result: JSON.stringify({ keyPoints: analysis.keyPoints.length, actionItems: analysis.actionItems.length }),
        userId: session.user.id,
      },
    });

    return NextResponse.json({ success: true, analysis, timestamp: new Date().toISOString() });
  } catch (error) {
    return NextResponse.json({
      success: false, error: 'Erreur: ' + (error instanceof Error ? error.message : 'Inconnue'),
    }, { status: 500 });
  }
}
