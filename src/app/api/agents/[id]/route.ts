// ============================================================
// /api/agents/[id] — Détail / mise à jour / suppression d'un agent
// ============================================================
//  Correctif sécurité : ces endpoints étaient auparavant SANS
//  authentification — n'importe quel appelant pouvait lire, modifier
//  ou supprimer l'agent de n'importe quel utilisateur. Désormais :
//    - authentification obligatoire (applySecurity — vérif crypto
//      du cookie de session / Bearer / API key)
//    - propriété vérifiée : seul le propriétaire (ou un admin)
//      peut lire / modifier / supprimer l'agent
//    - PATCH : les champs protégés (id, userId, createdAt, updatedAt)
//      sont filtrés du payload
//    - GET : include { permissions, _count } calculé en mémoire
//      (la façade Firestore ignore include)
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { applySecurity, secureResponse, type SecurityContext } from '@/lib/security';

export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string }> };

type AuthzResult =
  | { ok: true; auth: SecurityContext; agent: Record<string, unknown> }
  | { ok: false; error: NextResponse };

/**
 * Vérifie l'authentification puis la propriété de l'agent.
 * 401 si non authentifié, 404 si l'agent n'existe pas,
 * 403 si l'appelant n'est ni propriétaire ni admin.
 */
async function authorize(request: NextRequest, agentId: string): Promise<AuthzResult> {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error) return { ok: false, error };
  if (!auth) {
    return { ok: false, error: NextResponse.json({ error: 'Authentification requise' }, { status: 401 }) };
  }

  const agent = await db.agent.findUnique({ where: { id: agentId } });
  if (!agent) {
    return { ok: false, error: NextResponse.json({ error: 'Agent non trouvé' }, { status: 404 }) };
  }

  const record = agent as Record<string, unknown>;
  const isAdmin = auth.role === 'admin' || auth.role === 'super_admin';
  if (record.userId !== auth.userId && !isAdmin) {
    return { ok: false, error: NextResponse.json({ error: 'Accès refusé' }, { status: 403 }) };
  }

  return { ok: true, auth, agent: record };
}

// GET /api/agents/[id] — détail + permissions + compteurs
export async function GET(request: NextRequest, ctx: RouteCtx) {
  try {
    const { id } = await ctx.params;
    const authz = await authorize(request, id);
    if (!authz.ok) return authz.error;

    // La façade ignore `include` — jointures explicites en mémoire.
    const [permissions, tasks, memories] = await Promise.all([
      db.agentPermission.findMany({ where: [{ field: 'agentId', op: '==', value: id }] }),
      db.task.count({ where: [{ field: 'agentId', op: '==', value: id }] }),
      db.agentMemory.count({ where: [{ field: 'agentId', op: '==', value: id }] }),
    ]);

    const res = NextResponse.json({
      ...authz.agent,
      permissions,
      _count: { tasks, memories },
    });
    return secureResponse(res, request);
  } catch {
    return NextResponse.json({ error: 'Erreur' }, { status: 500 });
  }
}

// PATCH /api/agents/[id] — mise à jour (propriétaire ou admin)
export async function PATCH(request: NextRequest, ctx: RouteCtx) {
  try {
    const { id } = await ctx.params;
    const authz = await authorize(request, id);
    if (!authz.ok) return authz.error;

    const body = await request.json();
    // Champs protégés : jamais modifiables via cette route.
    const data = { ...(body ?? {}) } as Record<string, unknown>;
    delete data.id;
    delete data.userId;
    delete data.createdAt;
    delete data.updatedAt;

    const updated = await db.agent.update({ where: { id }, data });
    const res = NextResponse.json(updated);
    return secureResponse(res, request);
  } catch {
    return NextResponse.json({ error: 'Erreur' }, { status: 500 });
  }
}

// DELETE /api/agents/[id] — suppression (propriétaire ou admin)
export async function DELETE(request: NextRequest, ctx: RouteCtx) {
  try {
    const { id } = await ctx.params;
    const authz = await authorize(request, id);
    if (!authz.ok) return authz.error;

    await db.agent.delete({ where: { id } });
    const res = NextResponse.json({ success: true });
    return secureResponse(res, request);
  } catch {
    return NextResponse.json({ error: 'Erreur' }, { status: 500 });
  }
}
