import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { meetingNotesProcessor } from '@/lib/workspace-tools/meeting-notes';

export const maxDuration = 30;
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session?.user.id) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const { notes } = await request.json();
    if (!notes || typeof notes !== 'string') {
      return NextResponse.json({ error: 'Notes requises' }, { status: 400 });
    }
    if (notes.length > 50000) {
      return NextResponse.json({ error: 'Notes trop longues (max 50KB)' }, { status: 400 });
    }

    const result = await meetingNotesProcessor.process(notes);

    await prisma.agentActionLog.create({
      data: {
        action: 'workspace:meeting-notes:process',
        details: JSON.stringify({ title: result.title, participants: result.participants.length }),
        status: 'completed',
        result: JSON.stringify({ decisions: result.decisions.length, actionItems: result.actionItems.length }),
        userId: session.user.id,
      },
    });

    return NextResponse.json({ success: true, result, timestamp: new Date().toISOString() });
  } catch (error) {
    return NextResponse.json({
      success: false, error: 'Erreur: ' + (error instanceof Error ? error.message : 'Inconnue'),
    }, { status: 500 });
  }
}
