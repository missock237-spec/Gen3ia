// API Dataset individuel
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { applySecurity } from '@/lib/security';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error || !auth) return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });
  try {
    const dataset = await prisma.dataset.findFirst({ where: { id: params.id, userId: auth.userId } });
    if (!dataset) return NextResponse.json({ error: 'Dataset introuvable' }, { status: 404 });
    return NextResponse.json({ success: true, dataset });
  } catch (err) { return NextResponse.json({ error: String(err) }, { status: 500 }); }
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error || !auth) return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });
  try {
    const body = await request.json();
    const existing = await prisma.dataset.findFirst({ where: { id: params.id, userId: auth.userId } });
    if (!existing) return NextResponse.json({ error: 'Dataset introuvable' }, { status: 404 });
    const updated = await prisma.dataset.update({ where: { id: params.id }, data: {
      ...(body.name && { name: body.name }),
      ...(body.description !== undefined && { description: body.description }),
      ...(body.schemaInfo && { schemaInfo: JSON.stringify(body.schemaInfo) }),
      ...(body.sampleData && { sampleData: JSON.stringify(body.sampleData), rowCount: body.sampleData.length }),
      ...(body.refreshInterval !== undefined && { refreshInterval: body.refreshInterval }),
      ...(body.tags && { tags: JSON.stringify(body.tags) }),
    }});
    return NextResponse.json({ success: true, dataset: updated });
  } catch (err) { return NextResponse.json({ error: String(err) }, { status: 500 }); }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error || !auth) return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });
  try {
    const dataset = await prisma.dataset.findFirst({ where: { id: params.id, userId: auth.userId } });
    if (!dataset) return NextResponse.json({ error: 'Dataset introuvable' }, { status: 404 });
    await prisma.dataset.delete({ where: { id: params.id } });
    return NextResponse.json({ success: true });
  } catch (err) { return NextResponse.json({ error: String(err) }, { status: 500 }); }
}