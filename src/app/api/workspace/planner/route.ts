import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { dailyPlanner } from '@/lib/workspace-tools/daily-planner';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const session = await getServerSession();
  if (!session?.user.id) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  const { action, data } = await request.json();
  switch (action) {
    case 'add': return NextResponse.json({ success: true, task: dailyPlanner.add(data) });
    case 'update': return NextResponse.json({ success: true, task: dailyPlanner.update(data.id, data) });
    case 'complete': return NextResponse.json({ success: true, task: dailyPlanner.complete(data.id) });
    case 'delete': return NextResponse.json({ success: true, deleted: dailyPlanner.delete(data.id) });
    default: return NextResponse.json({ error: 'Action invalide' }, { status: 400 });
  }
}

export async function GET(request: NextRequest) {
  const session = await getServerSession();
  if (!session?.user.id) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  const url = new URL(request.url);
  if (url.searchParams.get('scope') === 'productivity') return NextResponse.json({ success: true, score: dailyPlanner.getProductivityScore() });
  if (url.searchParams.get('scope') === 'list') return NextResponse.json({ success: true, tasks: dailyPlanner.list(url.searchParams.get('priority') || undefined) });
  return NextResponse.json({ success: true, plan: dailyPlanner.getDailyPlan(url.searchParams.get('date') || undefined) });
}
