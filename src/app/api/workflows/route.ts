// ============================================================
// Workflows API — CRUD pour le canvas no-code
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { applySecurity } from '@/lib/security';
import { workflowEngine, WorkflowCanvas } from '@/lib/workflow-engine';
import { createLogger } from '@/lib/logger';

const log = createLogger('api-workflows');

export async function GET(request: NextRequest) {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error || !auth) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  try {
    const workflows = await prisma.workflow.findMany({
      where: { userId: auth.userId },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, name: true, description: true, trigger: true, status: true, updatedAt: true, createdAt: true },
    });

    return NextResponse.json({ success: true, workflows });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error || !auth) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  try {
    const body = await request.json();
    const { name, description, trigger, template } = body;

    if (!name) {
      return NextResponse.json({ error: 'name requis' }, { status: 400 });
    }

    let steps: WorkflowCanvas = { blocks: [], edges: [] };

    // Si un template est fourni, charger ses étapes
    if (template) {
      const tmpl = await prisma.workflowTemplate.findUnique({
        where: { id: template },
      });
      if (tmpl) {
        steps = JSON.parse(tmpl.steps);
        await prisma.workflowTemplate.update({
          where: { id: template },
          data: { usageCount: { increment: 1 } },
        });
      }
    }

    const workflow = await prisma.workflow.create({
      data: {
        name,
        description: description || '',
        steps: JSON.stringify(steps),
        trigger: trigger || 'manual',
        userId: auth.userId,
      },
    });

    log.info('workflow_created', { workflowId: workflow.id });

    return NextResponse.json({ success: true, workflow });
  } catch (err) {
    log.error('workflow_create_error', { error: String(err) });
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error || !auth) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  try {
    const body = await request.json();
    const { id, name, description, steps, trigger, status } = body;

    if (!id) {
      return NextResponse.json({ error: 'id requis' }, { status: 400 });
    }

    const workflow = await prisma.workflow.findFirst({
      where: { id, userId: auth.userId },
    });

    if (!workflow) {
      return NextResponse.json({ error: 'Workflow introuvable' }, { status: 404 });
    }

    const updated = await prisma.workflow.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(steps !== undefined && { steps: JSON.stringify(steps) }),
        ...(trigger !== undefined && { trigger }),
        ...(status !== undefined && { status }),
      },
    });

    // Si test demandé, exécuter le canvas
    if (body.test && steps) {
      const result = await workflowEngine.execute(steps as WorkflowCanvas);
      return NextResponse.json({ success: true, workflow: updated, test: result });
    }

    return NextResponse.json({ success: true, workflow: updated });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error || !auth) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'id requis' }, { status: 400 });
    }

    const workflow = await prisma.workflow.findFirst({
      where: { id, userId: auth.userId },
    });

    if (!workflow) {
      return NextResponse.json({ error: 'Workflow introuvable' }, { status: 404 });
    }

    await prisma.workflow.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}