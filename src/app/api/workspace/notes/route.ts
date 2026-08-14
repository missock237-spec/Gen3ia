import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { quickNotes } from '@/lib/workspace-tools/quick-notes';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const session = await getServerSession();
  if (!session?.user.id) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  const { action, data } = await request.json();
  switch (action) {
    case 'create': return NextResponse.json({ success: true, note: quickNotes.create(data.title, data.content, data.tags, data.color) });
    case 'update': return NextResponse.json({ success: true, note: quickNotes.update(data.id, data) });
    case 'delete': return NextResponse.json({ success: true, deleted: quickNotes.delete(data.id) });
    case 'pin': return NextResponse.json({ success: true, note: quickNotes.pin(data.id, data.pinned) });
    case 'search': return NextResponse.json({ success: true, results: quickNotes.search(data.query, data.tags) });
    case 'export': return NextResponse.json({ success: true, data: quickNotes.exportAll() });
    case 'import': return NextResponse.json({ success: true, count: quickNotes.import(data.json) });
    default: return NextResponse.json({ error: 'Action invalide' }, { status: 400 });
  }
}

export async function GET(request: NextRequest) {
  const session = await getServerSession();
  if (!session?.user.id) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  const url = new URL(request.url);
  if (url.searchParams.get('scope') === 'tags') return NextResponse.json({ success: true, tags: quickNotes.getAllTags() });
  return NextResponse.json({ success: true, notes: quickNotes.list() });
}
