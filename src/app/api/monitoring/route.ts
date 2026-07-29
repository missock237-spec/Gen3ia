// API Monitoring - Dashboard metrics + Alert rules
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { applySecurity } from '@/lib/security';
import { observability } from '@/lib/monitoring/observability';

export async function GET(request: NextRequest) {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error || !auth) return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });
  try {
    const url = new URL(request.url);
    const scope = url.searchParams.get('scope') || 'summary';
    switch (scope) {
      case 'summary': { const metrics = await observability.getMetricsSummary(auth.userId); return NextResponse.json({ success: true, metrics }); }
      case 'alerts': { const rules = await observability.getAlertRules(auth.userId); return NextResponse.json({ success: true, rules }); }
      case 'events': { const events = await observability.getAlertEvents(auth.userId); return NextResponse.json({ success: true, events }); }
      default: return NextResponse.json({ error: 'Scope inconnu' }, { status: 400 });
    }
  } catch (err) { return NextResponse.json({ error: String(err) }, { status: 500 }); }
}

export async function POST(request: NextRequest) {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error || !auth) return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });
  try {
    const body = await request.json();
    const url = new URL(request.url);
    const action = url.searchParams.get('action') || 'create-rule';
    switch (action) {
      case 'create-rule': {
        const rule = await observability.createAlertRule({
          userId: auth.userId, name: body.name,
          description: body.description, agentId: body.agentId,
          condition: body.condition, threshold: body.threshold,
          windowMinutes: body.windowMinutes, channels: body.channels,
          webhookUrl: body.webhookUrl,
        });
        return NextResponse.json({ success: true, rule }, { status: 201 });
      }
      case 'evaluate': { const triggered = await observability.evaluateAlertRules(auth.userId); return NextResponse.json({ success: true, triggered }); }
      case 'toggle': { if (!body.ruleId) return NextResponse.json({ error: 'ruleId requis' }, { status: 400 }); await observability.toggleAlertRule(body.ruleId, auth.userId, body.enabled !== false); return NextResponse.json({ success: true }); }
      case 'delete': { if (!body.ruleId) return NextResponse.json({ error: 'ruleId requis' }, { status: 400 }); await observability.deleteAlertRule(body.ruleId, auth.userId); return NextResponse.json({ success: true }); }
      case 'mark-read': { if (!body.eventId) return NextResponse.json({ error: 'eventId requis' }, { status: 400 }); await observability.markAlertRead(body.eventId, auth.userId); return NextResponse.json({ success: true }); }
      default: return NextResponse.json({ error: 'Action inconnue' }, { status: 400 });
    }
  } catch (err) { return NextResponse.json({ error: String(err) }, { status: 500 }); }
}