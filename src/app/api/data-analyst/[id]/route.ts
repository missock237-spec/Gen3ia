// API Data Analyst - Dashboard individuel (get/update/delete/addWidget)
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { applySecurity } from '@/lib/security';
import { dataAnalyst } from '@/lib/data-analyst';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error || !auth) return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });
  try {
    const dashboard = await prisma.dashboard.findFirst({ where: { id: params.id, userId: auth.userId } });
    if (!dashboard) return NextResponse.json({ error: 'Dashboard introuvable' }, { status: 404 });
    return NextResponse.json({ success: true, dashboard });
  } catch (err) { return NextResponse.json({ error: String(err) }, { status: 500 }); }
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error || !auth) return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });
  try {
    const body = await request.json();
    const url = new URL(request.url);
    const action = url.searchParams.get('action') || 'update';

    const existing = await prisma.dashboard.findFirst({ where: { id: params.id, userId: auth.userId } });
    if (!existing) return NextResponse.json({ error: 'Dashboard introuvable' }, { status: 404 });

    if (action === 'widget') {
      if (!body.widget) return NextResponse.json({ error: 'widget requis' }, { status: 400 });
      const updated = await dataAnalyst.addWidget(params.id, auth.userId, body.widget);
      return NextResponse.json({ success: true, dashboard: updated });
    }

    const updated = await prisma.dashboard.update({
      where: { id: params.id },
      data: {
        ...(body.name && { name: body.name }),
        ...(body.description !== undefined && { description: body.description }),
        ...(body.widgets && { widgets: JSON.stringify(body.widgets) }),
        ...(body.layout && { layout: JSON.stringify(body.layout) }),
        ...(body.filters && { filters: JSON.stringify(body.filters) }),
        ...(body.isPublic !== undefined && { isPublic: body.isPublic }),
      },
    });
    return NextResponse.json({ success: true, dashboard: updated });
  } catch (err) { return NextResponse.json({ error: String(err) }, { status: 500 }); }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error || !auth) return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });
  try {
    const dashboard = await prisma.dashboard.findFirst({ where: { id: params.id, userId: auth.userId } });
    if (!dashboard) return NextResponse.json({ error: 'Dashboard introuvable' }, { status: 404 });
    await prisma.dashboard.delete({ where: { id: params.id } });
    return NextResponse.json({ success: true });
  } catch (err) { return NextResponse.json({ error: String(err) }, { status: 500 }); }
}