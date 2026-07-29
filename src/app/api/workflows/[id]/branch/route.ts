// ============================================================
// Workflow Branch API — Créer / Switch / Merge des branches
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { applySecurity } from '@/lib/security';
import { workflowVersioning } from '@/lib/workflow-versioning';
import { createLogger } from '@/lib/logger';

const log = createLogger('api-workflow-branch');

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error || !auth) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  try {
    const workflow = await prisma.workflow.findFirst({
      where: { id: params.id, userId: auth.userId },
    });
    if (!workflow) return NextResponse.json({ error: 'Workflow introuvable' }, { status: 404 });

    const branches = await prisma.workflowBranch.findMany({
      where: { workflowId: params.id },
      include: {
        versions: { orderBy: { version: 'desc' }, take: 1 },
        _count: { select: { versions: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    return NextResponse.json({ success: true, branches });
  } catch (err) {
    log.error('branch_list_error', { error: String(err) });
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error || !auth) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  try {
    const body = await request.json();
    const url = new URL(request.url);
    const action = url.searchParams.get('action') || 'create';

    const workflow = await prisma.workflow.findFirst({
      where: { id: params.id, userId: auth.userId },
    });
    if (!workflow) return NextResponse.json({ error: 'Workflow introuvable' }, { status: 404 });

    switch (action) {
      case 'create': {
        if (!body.name) return NextResponse.json({ error: 'name requis' }, { status: 400 });
        const result = await workflowVersioning.createBranch(
          params.id, auth.userId, body.name, body.sourceVersionId
        );
        return NextResponse.json({ success: true, ...result });
      }

      case 'switch': {
        if (!body.branchId) return NextResponse.json({ error: 'branchId requis' }, { status: 400 });
        const result = await workflowVersioning.switchBranch(params.id, body.branchId);
        return NextResponse.json({ success: true, ...result });
      }

      case 'merge': {
        if (!body.sourceBranchId) return NextResponse.json({ error: 'sourceBranchId requis' }, { status: 400 });
        const version = await workflowVersioning.mergeBranch(params.id, body.sourceBranchId, auth.userId);
        return NextResponse.json({ success: true, version });
      }

      default:
        return NextResponse.json({ error: 'Action inconnue' }, { status: 400 });
    }
  } catch (err) {
    log.error('branch_action_error', { error: String(err) });
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error || !auth) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  try {
    const { searchParams } = new URL(request.url);
    const branchId = searchParams.get('branchId');

    if (!branchId) return NextResponse.json({ error: 'branchId requis' }, { status: 400 });

    const branch = await prisma.workflowBranch.findFirst({
      where: { id: branchId, workflowId: params.id },
    });
    if (!branch) return NextResponse.json({ error: 'Branche introuvable' }, { status: 404 });
    if (branch.isDefault) return NextResponse.json({ error: 'Impossible de supprimer la branche principale' }, { status: 400 });

    await prisma.workflowBranch.delete({ where: { id: branchId } });
    return NextResponse.json({ success: true });
  } catch (err) {
    log.error('branch_delete_error', { error: String(err) });
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
