// ============================================================
// Workflows API - CRUD + Versioning initial
// SECURITE: applySecurity + ownership + rate limit Redis distribué
// ============================================================
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { applySecurity } from '@/lib/security';
import { workflowEngine, WorkflowCanvas } from '@/lib/workflow-engine';
import { workflowVersioning } from '@/lib/workflow-versioning';
import { createLogger } from '@/lib/logger';
import { rateLimit } from '@/lib/rate-limiter';





export const dynamic = "force-dynamic";
const log = createLogger('api-workflows');

export async function GET(request: NextRequest) {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error || !auth) return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });

  const rl = await rateLimit(request, auth.userId);
  if (!rl.allowed) return NextResponse.json({ error: 'Trop de requêtes' }, { status: 429 });

  try {
    const workflows = await prisma.workflow.findMany({
      where: { userId: auth.userId },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true, name: true, description: true, trigger: true, status: true,
        updatedAt: true, createdAt: true, activeBranchId: true, currentVersionId: true,
      },
    });
    return NextResponse.json({ success: true, workflows });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error || !auth) return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });

  const rl = await rateLimit(request, auth.userId);
  if (!rl.allowed) return NextResponse.json({ error: 'Trop de requêtes' }, { status: 429 });

  try {
    const body = await request.json();
    const { name, description, trigger, template } = body;

    if (!name) return NextResponse.json({ error: 'name requis' }, { status: 400 });

    let steps: WorkflowCanvas = { blocks: [], edges: [] };

    if (template) {
      const tmpl = await prisma.workflowTemplate.findUnique({ where: { id: template } });
      if (tmpl) {
        steps = JSON.parse(tmpl.steps);
        await prisma.workflowTemplate.update({
          where: { id: template },
          data: { usageCount: { increment: 1 } },
        });
      }
    }

    // Creer le workflow
    const workflow = await prisma.workflow.create({
      data: {
        name, description: description || '',
        steps: JSON.stringify(steps),
        trigger: trigger || 'manual',
        userId: auth.userId,
      },
    });

    // Initialiser versioning (branche main + v1)
    await workflowVersioning.createWithInitialVersion(
      workflow.id, auth.userId, steps, 'Version initiale'
    );

    log.info('workflow_created_with_versioning', { workflowId: workflow.id });

    const fullWorkflow = await prisma.workflow.findUnique({
      where: { id: workflow.id },
      include: {
        branches: { orderBy: { createdAt: 'asc' } },
        versions: { orderBy: { version: 'desc' }, take: 1 },
      },
    });

    return NextResponse.json({ success: true, workflow: fullWorkflow });
  } catch (err) {
    log.error('workflow_create_error', { error: String(err) });
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error || !auth) return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });

  const rl = await rateLimit(request, auth.userId);
  if (!rl.allowed) return NextResponse.json({ error: 'Trop de requêtes' }, { status: 429 });

  try {
    const body = await request.json();
    const { id, name, description, steps, trigger, status } = body;

    if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 });

    // Ownership check : le workflow doit appartenir à l'utilisateur
    const workflow = await prisma.workflow.findFirst({ where: { id, userId: auth.userId } });
    if (!workflow) return NextResponse.json({ error: 'Workflow introuvable' }, { status: 404 });

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
  if (error || !auth) return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });

  const rl = await rateLimit(request, auth.userId);
  if (!rl.allowed) return NextResponse.json({ error: 'Trop de requêtes' }, { status: 429 });

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 });

    // Ownership check
    const workflow = await prisma.workflow.findFirst({ where: { id, userId: auth.userId } });
    if (!workflow) return NextResponse.json({ error: 'Workflow introuvable' }, { status: 404 });

    await prisma.workflow.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
