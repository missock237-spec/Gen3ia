// API Agents Specialises - CRUD + Marketplace
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { applySecurity } from '@/lib/security';
import { agentSpecialization } from '@/lib/agent-specialization';
import { createLogger } from '@/lib/logger';





export const dynamic = "force-dynamic";
const log = createLogger('api-agents-specialized');

export async function GET(request: NextRequest) {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error || !auth) return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });

  try {
    const url = new URL(request.url);
    const scope = url.searchParams.get('scope') || 'mine';

    if (scope === 'marketplace') {
      const agents = await agentSpecialization.getMarketplaceAgents({
        category: url.searchParams.get('category') || undefined,
        search: url.searchParams.get('search') || undefined,
      });
      return NextResponse.json({ success: true, agents });
    }

    const agents = await agentSpecialization.getAgents(auth.userId, {
      category: url.searchParams.get('category') || undefined,
      includePublic: scope === 'all',
    });
    return NextResponse.json({ success: true, agents });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error || !auth) return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });

  try {
    const body = await request.json();
    const url = new URL(request.url);
    const action = url.searchParams.get('action') || 'create';

    switch (action) {
      case 'create': {
        const agent = await agentSpecialization.createAgent(auth.userId, body);
        return NextResponse.json({ success: true, agent }, { status: 201 });
      }
      case 'publish': {
        if (!body.agentId) return NextResponse.json({ error: 'agentId requis' }, { status: 400 });
        const agent = await agentSpecialization.publishToMarketplace(body.agentId, auth.userId);
        return NextResponse.json({ success: true, agent });
      }
      case 'clone': {
        if (!body.agentId) return NextResponse.json({ error: 'agentId requis' }, { status: 400 });
        const agent = await agentSpecialization.cloneMarketplaceAgent(body.agentId, auth.userId);
        return NextResponse.json({ success: true, agent });
      }
      default:
        return NextResponse.json({ error: 'Action inconnue' }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}