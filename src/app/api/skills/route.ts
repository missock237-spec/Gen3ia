// API Skills — Boucles IA, competences et personnalisations
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { applySecurity } from '@/lib/security';
import { getSkillEngine, SkillCategory } from '@/lib/agent-engine/skill-engine';

const skillEngine = getSkillEngine();

export async function GET(request: NextRequest) {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error || !auth) return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });

  try {
    const url = new URL(request.url);
    const scope = url.searchParams.get('scope') || 'marketplace';

    switch (scope) {
      case 'marketplace': {
        const type = url.searchParams.get('type') || 'skills';
        const category = url.searchParams.get('category');
        const search = url.searchParams.get('search') || '';
        const where: any = { status: 'published' };
        if (category) where.category = category;
        if (search) where.name = { contains: search, mode: 'insensitive' };

        if (type === 'loops') {
          const loops = await prisma.aILoop.findMany({ where, orderBy: { installCount: 'desc' } });
          return NextResponse.json({ success: true, type: 'loops', items: loops });
        } else if (type === 'customizations') {
          const customizations = await prisma.customization.findMany({ where, orderBy: { installCount: 'desc' } });
          return NextResponse.json({ success: true, type: 'customizations', items: customizations });
        }
        const skills = await prisma.skill.findMany({ where, orderBy: { installCount: 'desc' } });
        return NextResponse.json({ success: true, type: 'skills', items: skills });
      }

      case 'installed': {
        const type = url.searchParams.get('type') || 'skills';
        const agentId = url.searchParams.get('agentId');
        if (!agentId) return NextResponse.json({ error: 'agentId requis' }, { status: 400 });

        if (type === 'loops') {
          const loops = await skillEngine.getAgentLoops(agentId);
          return NextResponse.json({ success: true, type: 'loops', items: loops });
        }
        const skills = await skillEngine.getAgentSkills(agentId);
        return NextResponse.json({ success: true, type: 'skills', items: skills });
      }

      case 'my-customizations': {
        const customizations = await skillEngine.getUserCustomizations(auth.id);
        return NextResponse.json({ success: true, items: customizations });
      }

      default:
        return NextResponse.json({ error: 'Scope inconnu' }, { status: 400 });
    }
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
    const action = url.searchParams.get('action') || 'install-skill';

    switch (action) {
      case 'install-skill': {
        if (!body.skillId || !body.agentId) return NextResponse.json({ error: 'skillId et agentId requis' }, { status: 400 });
        const result = await skillEngine.installSkillOnAgent(auth.id, body.skillId, body.agentId);
        return NextResponse.json(result);
      }

      case 'install-loop': {
        if (!body.loopId || !body.agentId) return NextResponse.json({ error: 'loopId et agentId requis' }, { status: 400 });
        const result = await skillEngine.installLoopOnAgent(auth.id, body.loopId, body.agentId);
        return NextResponse.json(result);
      }

      case 'apply-customization': {
        if (!body.customizationId) return NextResponse.json({ error: 'customizationId requis' }, { status: 400 });
        const result = await skillEngine.applyCustomization(auth.id, body.customizationId, body.targetId);
        return NextResponse.json(result);
      }

      case 'uninstall': {
        if (!body.itemId || !body.type) return NextResponse.json({ error: 'itemId et type requis' }, { status: 400 });
        let success = false;
        if (body.type === 'skill') success = await skillEngine.uninstallSkill(body.itemId);
        else if (body.type === 'loop') success = await skillEngine.uninstallLoop(body.itemId);
        return NextResponse.json({ success, message: success ? 'Desinstalle' : 'Erreur de desinstallation' });
      }

      case 'create': {
        if (!body.type || !body.name) return NextResponse.json({ error: 'type et name requis' }, { status: 400 });
        let item;
        if (body.type === 'skill') item = await skillEngine.createSkill({ ...body, authorId: auth.id, authorName: auth.name });
        else if (body.type === 'loop') item = await skillEngine.createLoop({ ...body, authorId: auth.id, authorName: auth.name });
        else return NextResponse.json({ error: 'Type invalide' }, { status: 400 });
        return NextResponse.json({ success: true, item });
      }

      case 'publish': {
        if (!body.itemId || !body.type) return NextResponse.json({ error: 'itemId et type requis' }, { status: 400 });
        await skillEngine.publish(body.type as any, body.itemId);
        return NextResponse.json({ success: true, message: 'Publie' });
      }

      default:
        return NextResponse.json({ error: 'Action inconnue' }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
