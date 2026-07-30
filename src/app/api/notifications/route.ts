// API Notifications
import { NextRequest, NextResponse } from 'next/server';
import { applySecurity } from '@/lib/security';
import { notificationEngine } from '@/lib/notification-engine';

export async function GET(request: NextRequest) {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error || !auth) return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });
  try {
    const url = new URL(request.url);
    const scope = url.searchParams.get('scope') || 'list';
    switch (scope) {
      case 'list': { const unreadOnly = url.searchParams.get('unread') === 'true'; const limit = parseInt(url.searchParams.get('limit') || '30'); const result = await notificationEngine.list(auth.userId, { unreadOnly, limit }); return NextResponse.json({ success: true, ...result }); }
      case 'unread': { const count = await notificationEngine.getUnreadCount(auth.userId); return NextResponse.json({ success: true, count }); }
      default: return NextResponse.json({ error: 'Scope inconnu' }, { status: 400 });
    }
  } catch (err) { return NextResponse.json({ error: String(err) }, { status: 500 }); }
}

export async function POST(request: NextRequest) {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error || !auth) return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });
  try {
    const body = await request.json(); const url = new URL(request.url); const action = url.searchParams.get('action') || 'mark-read';
    switch (action) {
      case 'mark-read': { if (!body.id) return NextResponse.json({ error: 'id requis' }, { status: 400 }); await notificationEngine.markRead(body.id, auth.userId); return NextResponse.json({ success: true }); }
      case 'mark-all-read': { await notificationEngine.markAllRead(auth.userId); return NextResponse.json({ success: true }); }
      case 'delete': { if (!body.id) return NextResponse.json({ error: 'id requis' }, { status: 400 }); await notificationEngine.delete(body.id, auth.userId); return NextResponse.json({ success: true }); }
      default: return NextResponse.json({ error: 'Action inconnue' }, { status: 400 });
    }
  } catch (err) { return NextResponse.json({ error: String(err) }, { status: 500 }); }
}