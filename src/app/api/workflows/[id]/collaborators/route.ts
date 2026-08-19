// ============================================================
// Workflow Collaborators API — Gérer les collaborateurs
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { applySecurity } from '@/lib/security';
import { createLogger } from '@/lib/logger';

export const dynamic = "force-dynamic";
const log = createLogger('api-workflow-collaborators');

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error || !auth) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  try {
    const workflow = await prisma.workflow.findFirst({
      where: { id: (await params).id, userId: auth.userId },
    });
    if (!workflow) return NextResponse.json({ error: 'Workflow introuvable' }, { status: 404 });

    const collaborators = await prisma.workflowCollaborator.findMany({
      where: { workflowId: (await params).id },
      include: {
        user: { select: { id: true, name: true, email: true, avatar: true, isActive: true } },
      },
      orderBy: { addedAt: 'asc' },
    });

    return NextResponse.json({ success: true, collaborators });
  } catch (err) {
    log.error('collaborators_list_error', { error: String(err) });
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error || !auth) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  try {
    const body = await request.json();
    const url = new URL(request.url);
    const action = url.searchParams.get('action') || 'add';

    const workflow = await prisma.workflow.findFirst({
      where: { id: (await params).id, userId: auth.userId },
    });
    if (!workflow) return NextResponse.json({ error: 'Workflow introuvable' }, { status: 404 });

    switch (action) {
      case 'add': {
        if (!body.userId || !body.role) {
          return NextResponse.json({ error: 'userId et role requis' }, { status: 400 });
        }

        const targetUser = await prisma.user.findUnique({ where: { id: body.userId } });
        if (!targetUser) return NextResponse.json({ error: 'Utilisateur introuvable' }, { status: 404 });

        const existing = await prisma.workflowCollaborator.findUnique({
          where: { workflowId_userId: { workflowId: (await params).id, userId: body.userId } },
        });
        if (existing) return NextResponse.json({ error: 'Déjà collaborateur' }, { status: 409 });

        const validRoles = ['viewer', 'editor', 'admin'];
        if (!validRoles.includes(body.role)) {
          return NextResponse.json({ error: 'Role invalide. Utilisez: viewer, editor, admin' }, { status: 400 });
        }

        const collaborator = await prisma.workflowCollaborator.create({
          data: {
            workflowId: (await params).id,
            userId: body.userId,
            role: body.role,
          },
          include: {
            user: { select: { id: true, name: true, email: true, avatar: true } },
          },
        });

        log.info('collaborator_added', { workflowId: (await params).id, userId: body.userId, role: body.role });
        return NextResponse.json({ success: true, collaborator });
      }

      case 'update': {
        if (!body.collaboratorId || !body.role) {
          return NextResponse.json({ error: 'collaboratorId et role requis' }, { status: 400 });
        }

        const validRoles = ['viewer', 'editor', 'admin'];
        if (!validRoles.includes(body.role)) {
          return NextResponse.json({ error: 'Role invalide' }, { status: 400 });
        }

        const collaborator = await prisma.workflowCollaborator.update({
          where: { id: body.collaboratorId },
          data: { role: body.role },
        });

        return NextResponse.json({ success: true, collaborator });
      }

      default:
        return NextResponse.json({ error: 'Action inconnue' }, { status: 400 });
    }
  } catch (err) {
    log.error('collaborators_action_error', { error: String(err) });
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error || !auth) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  try {
    const { searchParams } = new URL(request.url);
    const collaboratorId = searchParams.get('collaboratorId');

    if (!collaboratorId) return NextResponse.json({ error: 'collaboratorId requis' }, { status: 400 });

    const collab = await prisma.workflowCollaborator.findUnique({
      where: { id: collaboratorId },
    });
    if (!collab) return NextResponse.json({ error: 'Collaborateur introuvable' }, { status: 404 });

    await prisma.workflowCollaborator.delete({ where: { id: collaboratorId } });
    log.info('collaborator_removed', { workflowId: (await params).id, collaboratorId });

    return NextResponse.json({ success: true });
  } catch (err) {
    log.error('collaborators_delete_error', { error: String(err) });
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
