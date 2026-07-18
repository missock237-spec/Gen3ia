// API REST pour les sessions CodeStudio
import { NextRequest, NextResponse } from 'next/server';
import { createSession, getSession, updateSession, deleteSession, listUserSessions } from '@/lib/code-engine/sandbox';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get('sessionId');
  const userId = searchParams.get('userId');

  if (sessionId) {
    const session = getSession(sessionId);
    if (!session) {
      return NextResponse.json({ error: 'Session introuvable' }, { status: 404 });
    }
    return NextResponse.json({ session });
  }

  if (userId) {
    const sessions = listUserSessions(userId);
    return NextResponse.json({ sessions });
  }

  return NextResponse.json({ error: 'sessionId ou userId requis' }, { status: 400 });
}

export async function POST(request: NextRequest) {
  try {
    const { userId, code, language } = await request.json();
    if (!userId) {
      return NextResponse.json({ error: 'userId requis' }, { status: 400 });
    }
    const session = createSession(userId, code || '', language || 'javascript');
    return NextResponse.json({ session }, { status: 201 });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Erreur' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { sessionId, code, language } = await request.json();
    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId requis' }, { status: 400 });
    }
    const session = updateSession(sessionId, code || '', language);
    if (!session) {
      return NextResponse.json({ error: 'Session introuvable' }, { status: 404 });
    }
    return NextResponse.json({ session });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Erreur' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get('sessionId');
  if (!sessionId) {
    return NextResponse.json({ error: 'sessionId requis' }, { status: 400 });
  }
  const deleted = deleteSession(sessionId);
  if (!deleted) {
    return NextResponse.json({ error: 'Session introuvable' }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}