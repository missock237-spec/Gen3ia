// API Admin - Gestion utilisateurs, stats systeme, audit, publicite
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { applySecurity } from '@/lib/security';
import { getAdEngine } from '@/lib/advertising/ad-engine';





export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error || !auth) return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });
  if (auth.role !== 'admin') return NextResponse.json({ error: 'Acces reserve aux admins' }, { status: 403 });

  try {
    const url = new URL(request.url);
    const scope = url.searchParams.get('scope') || 'stats';

    switch (scope) {
      case 'stats': {
        const [totalUsers, activeUsers, totalAgents, totalWorkflows, totalExecs, totalMarketplace, revenue, totalCampaigns, totalImpressions, totalClicks] = await Promise.all([
          prisma.user.count(),
          prisma.user.count({ where: { isActive: true } }),
          prisma.agent.count(),
          prisma.workflow.count(),
          prisma.agentInvocation.count(),
          prisma.marketplaceListing.count({ where: { status: 'published' } }),
          prisma.agentInvocation.aggregate({ _sum: { cost: true } }),
          prisma.adCampaign.count(),
          prisma.adImpression.count(),
          prisma.adImpression.count({ where: { wasClicked: true } }),
        ]);
        return NextResponse.json({
          success: true,
          stats: {
            totalUsers, activeUsers, totalAgents, totalWorkflows,
            totalExecutions: totalExecs, marketplaceListings: totalMarketplace,
            totalRevenue: revenue._sum.cost || 0,
            advertising: {
              totalCampaigns, totalImpressions, totalClicks,
              ctr: totalImpressions > 0 ? ((totalClicks / totalImpressions) * 100).toFixed(1) : '0',
            },
          },
        });
      }

      case 'users': {
        const page = parseInt(url.searchParams.get('page') || '1');
        const limit = Math.min(50, parseInt(url.searchParams.get('limit') || '20'));
        const search = url.searchParams.get('search') || '';
        const where: any = {};
        if (search) where.OR = [{ email: { contains: search, mode: 'insensitive' } }, { name: { contains: search, mode: 'insensitive' } }];
        const [users, total] = await Promise.all([
          prisma.user.findMany({
            where,
            select: { id: true, email: true, name: true, plan: true, role: true, credits: true, isActive: true, isCreator: true, createdAt: true, lastActiveAt: true, _count: { select: { agents: true, workflows: true } } },
            orderBy: { createdAt: 'desc' },
            skip: (page - 1) * limit,
            take: limit,
          }),
          prisma.user.count({ where }),
        ]);
        return NextResponse.json({ success: true, users, total, page, totalPages: Math.ceil(total / limit) });
      }

      case 'user': {
        const userId = url.searchParams.get('userId');
        if (!userId) return NextResponse.json({ error: 'userId requis' }, { status: 400 });
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, email: true, name: true, plan: true, role: true, credits: true, isActive: true, isCreator: true, isEmailVerified: true, createdAt: true, lastActiveAt: true, _count: { select: { agents: true, workflows: true, conversations: true, datasets: true, dashboards: true, marketplaceListings: true } } },
        });
        if (!user) return NextResponse.json({ error: 'Utilisateur introuvable' }, { status: 404 });
        return NextResponse.json({ success: true, user });
      }

      case 'audit': {
        const auditLogs = await prisma.activityLog.findMany({ orderBy: { createdAt: 'desc' }, take: 50 });
        return NextResponse.json({ success: true, auditLogs });
      }

      case 'system': {
        const [users, agents, workflows, execs, alerts, marketplace, conversations, dashboards] = await Promise.all([
          prisma.user.count(), prisma.agent.count(), prisma.workflow.count(),
          prisma.agentInvocation.count(), prisma.alertRule.count(),
          prisma.marketplaceListing.count(), prisma.conversation.count(), prisma.dashboard.count(),
        ]);
        return NextResponse.json({
          success: true,
          system: {
            database: 'connected',
            uptime: process.uptime(),
            nodeVersion: process.version,
            environment: process.env.NODE_ENV,
            counts: { users, agents, workflows, executions: execs, alerts, marketplace, conversations, dashboards },
          },
        });
      }

      case 'ads-stats': {
        const adEngine = getAdEngine();
        const campaigns = await prisma.adCampaign.findMany({
          where: { isActive: true },
          orderBy: { createdAt: 'desc' },
        });
        const impressionsByDay = await prisma.$queryRaw`
          SELECT DATE(created_at) as date, COUNT(*) as count
          FROM ad_impression
          WHERE created_at > NOW() - INTERVAL '7 days'
          GROUP BY DATE(created_at)
          ORDER BY date ASC
        `;
        const placementStats = await prisma.$queryRaw`
          SELECT placement, COUNT(*) as count
          FROM ad_campaign
          WHERE is_active = true
          GROUP BY placement
        `;
        return NextResponse.json({
          success: true,
          stats: {
            campaigns: campaigns.map(c => ({
              id: c.id, name: c.name, placement: c.placement, format: c.format,
              budgetTotal: c.budgetTotal, budgetSpent: c.budgetSpent,
              status: c.status, rewardPerView: c.rewardPerView, rewardPerClick: c.rewardPerClick,
              targetKeywords: c.targetKeywords, abTestGroup: c.abTestGroup,
            })),
            impressionsByDay: impressionsByDay || [],
            placementStats: placementStats || [],
            creditsDistributed: await prisma.adImpression.aggregate({ _sum: { rewardAmount: true } }),
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
        const data: any = {};
        if (body.plan) data.plan = body.plan;
        if (body.role) data.role = body.role;
        if (body.credits !== undefined) data.credits = body.credits;
        if (body.isActive !== undefined) data.isActive = body.isActive;
        if (body.isCreator !== undefined) data.isCreator = body.isCreator;
        const updated = await prisma.user.update({ where: { id: body.userId }, data, select: { id: true, email: true, name: true, plan: true, role: true, credits: true, isActive: true } });
        return NextResponse.json({ success: true, user: updated });
      }

      case 'delete-user': {
        if (!body.userId) return NextResponse.json({ error: 'userId requis' }, { status: 400 });
        await prisma.user.delete({ where: { id: body.userId } });
        return NextResponse.json({ success: true });
      }

      case 'add-credits': {
        if (!body.userId || !body.amount) return NextResponse.json({ error: 'userId et amount requis' }, { status: 400 });
        const user = await prisma.user.update({ where: { id: body.userId }, data: { credits: { increment: body.amount } }, select: { id: true, name: true, credits: true } });
        return NextResponse.json({ success: true, user });
      }

      case 'create-campaign': {
        const adEngine = getAdEngine();
        const campaign = await adEngine.createCampaign(body);
        return NextResponse.json({ success: true, campaign });
      }

      case 'update-campaign-status': {
        if (!body.campaignId || !body.status) return NextResponse.json({ error: 'campaignId et status requis' }, { status: 400 });
        const adEngine = getAdEngine();
        await adEngine.setCampaignStatus(body.campaignId, body.status);
        return NextResponse.json({ success: true });
      }

      case 'create-ab-test': {
        const adEngine = getAdEngine();
        const { baseCampaign, variants } = body;
        if (!baseCampaign || !variants) return NextResponse.json({ error: 'baseCampaign et variants requis' }, { status: 400 });
        const results = await adEngine.createABTestCampaign(baseCampaign, variants);
        return NextResponse.json({ success: true, campaigns: results });
      }

      default:
        return NextResponse.json({ error: 'Action inconnue' }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
