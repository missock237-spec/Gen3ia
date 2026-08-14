// API Agent Specialise - Update/Delete individuel
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { applySecurity } from '@/lib/security';
import { agentSpecialization } from '@/lib/agent-specialization';





export const dynamic = "force-dynamic";
export async function GET(request: NextRequest, { params }: { params: { agentId: string } }) {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error || !auth) return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });
  try {
    const agent = await prisma.agent.findFirst({
      where: { id: params.agentId, OR: [{ ownerId: auth.userId }, { isPublic: true }] },
      include: { tools: true, owner: { select: { name: true, avatar: true } } },
    });
    if (!agent) return NextResponse.json({ error: 'Agent introuvable' }, { status: 404 });
    return NextResponse.json({ success: true, agent });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: { agentId: string } }) {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error || !auth) return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });
  try {
    const body = await request.json();
    const agent = await agentSpecialization.updateAgent(params.agentId, auth.userId, body);
    return NextResponse.json({ success: true, agent });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { agentId: string } }) {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error || !auth) return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });
  try {
    const agent = await prisma.agent.findFirst({ where: { id: params.agentId, ownerId: auth.userId } });
    if (!agent) return NextResponse.json({ error: 'Agent introuvable' }, { status: 404 });
    await prisma.agent.delete({ where: { id: params.agentId } });
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}