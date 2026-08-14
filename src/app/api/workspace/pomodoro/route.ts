import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { pomodoroTimer } from '@/lib/workspace-tools/pomodoro';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const session = await getServerSession();
  if (!session?.user.id) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  const { action, data } = await request.json();
  switch (action) {
    case 'start': return NextResponse.json({ success: true, session: pomodoroTimer.start(data.taskLabel, data.durationMin) });
    case 'complete': return NextResponse.json({ success: true, session: pomodoroTimer.complete() });
    case 'interrupt': return NextResponse.json({ success: true, session: pomodoroTimer.interrupt() });
    default: return NextResponse.json({ error: 'Action invalide' }, { status: 400 });
  }
}

export async function GET(request: NextRequest) {
  const session = await getServerSession();
  if (!session?.user.id) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  const url = new URL(request.url);
  if (url.searchParams.get('scope') === 'stats') return NextResponse.json({ success: true, stats: pomodoroTimer.getStats() });
  if (url.searchParams.get('scope') === 'sessions') return NextResponse.json({ success: true, sessions: pomodoroTimer.getSessions() });
  return NextResponse.json({ success: true, current: pomodoroTimer.getCurrent(), nextBreak: pomodoroTimer.getNextBreak() });
}
