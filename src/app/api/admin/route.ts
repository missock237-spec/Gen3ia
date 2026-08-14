// API Admin - Gestion utilisateurs, stats systeme, audit
// Réécrite sur la façade Firestore (src/lib/firebase/firestore.ts).
// Les modèles Prisma inexistants (advertising, alertRule, dashboard, activityLog)
// et les méthodes non supportées ($queryRaw, aggregate, _count) ont été retirés.
import { NextRequest, NextResponse } from 'next/server';
import { db, type FirestoreWhereOp } from '@/lib/firebase/firestore';
import { applySecurity } from '@/lib/security';


export const dynamic = "force-dynamic";

/** Convertit un filtre {champ: valeur} en tableau d'opérateurs Firestore. */
function whereEq(filter: Record<string, unknown>): FirestoreWhereOp[] {
  return Object.entries(filter)
    .filter(([k]) => k !== 'id')
    .map(([field, value]) => ({ field, op: '==' as const, value }));
}

/** Somme un champ numérique sur une collection Firestore. */
async function sumField(model: {
  findMany(args?: { where?: FirestoreWhereOp[]; limit?: number }): Promise<Record<string, unknown>[]>;
}, field: string): Promise<number> {
  const items = await model.findMany({ limit: 1000 });
  return items.reduce((acc, it) => acc + (typeof it[field] === 'number' ? (it[field] as number) : 0), 0);
}

export async function GET(request: NextRequest) {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error || !auth) return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });
  if (auth.role !== 'admin') return NextResponse.json({ error: 'Acces reserve aux admins' }, { status: 403 });

  try {
    const url = new URL(request.url);
    const scope = url.searchParams.get('scope') || 'stats';

    switch (scope) {
      case 'stats': {
        const [totalUsers, activeUsers, totalAgents, totalWorkflows, totalExecs, totalMarketplace] =
          await Promise.all([
            db.user.count(),
            db.user.count({ where: [{ field: 'isActive', op: '==', value: true }] }),
            db.agent.count(),
            db.workflow.count(),
            db.agentUsage.count(),
            db.marketplaceListing.count({ where: [{ field: 'status', op: '==', value: 'published' }] }),
          ]);
        const revenue = await sumField(db.credit, 'amount')
          .then((s) => (s > 0 ? s : 0));
        return NextResponse.json({
          success: true,
          stats: {
            totalUsers, activeUsers, totalAgents, totalWorkflows,
            totalExecutions: totalExecs, marketplaceListings: totalMarketplace,
            totalRevenue: revenue,
          },
        });
      }

      case 'users': {
        const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
        const limit = Math.min(50, parseInt(url.searchParams.get('limit') || '20'));
        const search = url.searchParams.get('search') || '';
        const where: FirestoreWhereOp[] = [];
        if (search) {
          where.push({ field: 'email', op: '==', value: search });
        }
        const users = await db.user.findMany({
          where,
          orderBy: [{ field: 'createdAt', direction: 'desc' }],
          limit,
          offset: (page - 1) * limit,
        });
        const total = await db.user.count({ where });
        return NextResponse.json({ success: true, users, total, page, totalPages: Math.ceil(total / limit) });
      }

      case 'user': {
        const userId = url.searchParams.get('userId');
        if (!userId) return NextResponse.json({ error: 'userId requis' }, { status: 400 });
        const user = await db.user.findUnique({ where: { id: userId } });
        if (!user) return NextResponse.json({ error: 'Utilisateur introuvable' }, { status: 404 });
        const agents = await db.agent.count({ where: [{ field: 'userId', op: '==', value: userId }] });
        const workflows = await db.workflow.count({ where: [{ field: 'userId', op: '==', value: userId }] });
        return NextResponse.json({ success: true, user: { ...user, _count: { agents, workflows } } });
      }

      case 'audit': {
        const auditLogs = await db.auditLog.findMany({
          orderBy: [{ field: 'createdAt', direction: 'desc' }],
          limit: 50,
        });
        return NextResponse.json({ success: true, auditLogs });
      }

      case 'system': {
        const [users, agents, workflows, execs, marketplace, conversations] = await Promise.all([
          db.user.count(), db.agent.count(), db.workflow.count(),
          db.agentUsage.count(), db.marketplaceListing.count(), db.conversation.count(),
        ]);
        return NextResponse.json({
          success: true,
          system: {
            database: 'connected',
            uptime: process.uptime(),
            nodeVersion: process.version,
            environment: process.env.NODE_ENV,
            counts: { users, agents, workflows, executions: execs, marketplace, conversations },
          },
        });
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
  if (auth.role !== 'admin') return NextResponse.json({ error: 'Acces reserve aux admins' }, { status: 403 });

  try {
    const body = await request.json();
    const url = new URL(request.url);
    const action = url.searchParams.get('action') || 'update-user';

    switch (action) {
      case 'update-user': {
        if (!body.userId) return NextResponse.json({ error: 'userId requis' }, { status: 400 });
        const data: Record<string, unknown> = {};
        if (body.plan) data.plan = body.plan;
        if (body.role) data.role = body.role;
        if (body.credits !== undefined) data.credits = body.credits;
        if (body.isActive !== undefined) data.isActive = body.isActive;
        if (body.isCreator !== undefined) data.isCreator = body.isCreator;
        const updated = await db.user.update({ where: { id: body.userId }, data });
        return NextResponse.json({ success: true, user: updated });
      }

      case 'delete-user': {
        if (!body.userId) return NextResponse.json({ error: 'userId requis' }, { status: 400 });
        await db.user.delete({ where: { id: body.userId } });
        return NextResponse.json({ success: true });
      }

      case 'add-credits': {
        if (!body.userId || !body.amount) return NextResponse.json({ error: 'userId et amount requis' }, { status: 400 });
        const user = await db.user.findUnique({ where: { id: body.userId } });
        if (!user) return NextResponse.json({ error: 'Utilisateur introuvable' }, { status: 404 });
        const current = (user as Record<string, unknown>).credits ?? 0;
        const updated = await db.user.update({ where: { id: body.userId }, data: { credits: (current as number) + Number(body.amount) } });
        return NextResponse.json({ success: true, user: updated });
      }

      default:
        return NextResponse.json({ error: 'Action inconnue' }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
