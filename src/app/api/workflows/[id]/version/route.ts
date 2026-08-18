// Workflow Versioning API - Save/Restore/List
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { applySecurity } from '@/lib/security';
import { workflowVersioning } from '@/lib/workflow-versioning';
import { createLogger } from '@/lib/logger';

export const dynamic = "force-dynamic";
const log = createLogger('api-workflow-version');

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error || !auth) return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });

  try {
    const workflow = await prisma.workflow.findFirst({ where: { id: (await params).id, userId: auth.userId } });
    if (!workflow) return NextResponse.json({ error: 'Workflow introuvable' }, { status: 404 });

    const history = await workflowVersioning.getHistory((await params).id);
    return NextResponse.json({ success: true, ...history });
  } catch (err) {
    log.error('version_history_error', { error: String(err) });
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error || !auth) return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });

  try {
    const body = await request.json();
    const url = new URL(request.url);
    const action = url.searchParams.get('action') || 'save';

    const workflow = await prisma.workflow.findFirst({ where: { id: (await params).id, userId: auth.userId } });
    if (!workflow) return NextResponse.json({ error: 'Workflow introuvable' }, { status: 404 });

    switch (action) {
      case 'save': {
        if (!body.steps) return NextResponse.json({ error: 'steps requis' }, { status: 400 });
        const version = await workflowVersioning.saveVersion((await params).id, auth.userId, body.steps, body.message || 'Sauvegarde');
        return NextResponse.json({ success: true, version });
      }
      case 'restore': {
        if (!body.versionId) return NextResponse.json({ error: 'versionId requis' }, { status: 400 });
        const version = await workflowVersioning.restoreVersion((await params).id, body.versionId);
        return NextResponse.json({ success: true, version });
      }
      default:
        return NextResponse.json({ error: 'Action inconnue' }, { status: 400 });
    }
  } catch (err) {
    log.error('version_action_error', { error: String(err) });
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
