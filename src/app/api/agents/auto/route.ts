// Auto Execution

import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { db } from '@/lib/db';
import { applySecurity, secureResponse } from '@/lib/security';
import { autoScheduler } from '@/lib/auto-scheduler';





export const dynamic = "force-dynamic";
const log = createLogger('auto-exec');

const VALID_TRIGGERS = ['schedule', 'event', 'webhook', 'instant'];
const VALID_SCHEDULES = ['every_minute', 'every_5_minutes', 'every_15_minutes', 'every_hour', 'every_6_hours', 'every_day', 'every_week', 'custom_cron'];

export async function POST(request: NextRequest) {
  const { auth, error: secError } = await applySecurity(request, { requireAuth: true });
  if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

  try {
    const body = await request.json();
    const { agentId, autoExecute } = body;

    if (!agentId || !autoExecute) {
      return NextResponse.json({ error: 'Champs requis: agentId, autoExecute' }, { status: 400 });
    }

    const agent = await db.agent.findUnique({
      where: { id: agentId },
      select: { id: true, userId: true, name: true, type: true, config: true },
    });

    if (!agent) return NextResponse.json({ error: 'Agent introuvable' }, { status: 404 });
    if (agent.userId !== auth.userId) return NextResponse.json({ error: 'Acces refuse' }, { status: 403 });

    const trigger = VALID_TRIGGERS.includes(autoExecute.trigger) ? autoExecute.trigger : 'schedule';
    const schedule = autoExecute.schedule && VALID_SCHEDULES.includes(autoExecute.schedule) ? autoExecute.schedule : 'every_day';
    const cooldownMinutes = Math.max(1, Math.min(Number(autoExecute.cooldownMinutes) || 60, 1440));

    let config: Record<string, unknown> = {};
    try { config = JSON.parse(agent.config); } catch { config = {}; }

    config.autoExecute = {
      trigger,
      schedule,
      input: String(autoExecute.input || '').slice(0, 2000) || null,
      cooldownMinutes,
      isActive: autoExecute.isActive !== false,
    };

    await db.agent.update({
      where: { id: agentId },
      data: { config: JSON.stringify(config) },
    });

    if (autoExecute.isActive !== false) {
      await autoScheduler.scheduleAgent({
        id: agent.id,
        name: agent.name,
        type: agent.type,
        config: JSON.stringify(config),
        userId: agent.userId,
      });
    }

    log.info('auto_execution_configured', { agentId, active: autoExecute.isActive, trigger, schedule });

    const res = NextResponse.json({
      success: true,
      message: `Auto-execution ${autoExecute.isActive !== false ? 'activee' : 'desactivee'} pour ${agent.name}`,
    });
    return secureResponse(res, request);
  } catch (error) {
    log.error('auto_config_error', { error: String(error) });
    return NextResponse.json({ error: 'Erreur interne' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const { auth, error: secError } = await applySecurity(request, { requireAuth: true });
  if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

  try {
    const agents = await db.agent.findMany({
      where: { userId: auth.userId },
      select: {
        id: true, name: true, type: true, status: true, config: true,
        executions: {
          where: { status: 'completed' },
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: { createdAt: true, status: true, estimatedCost: true },
        },
      },
    });

    const result = agents.map((a) => {
      let auto = null;
      try { const p = JSON.parse(a.config); auto = p.autoExecute ?? null; } catch {}
      return { id: a.id, name: a.name, type: a.type, status: a.status, autoExecute: auto, lastExecutions: a.executions };
    });

    const res = NextResponse.json({ agents: result });
    return secureResponse(res, request);
  } catch (error) {
    log.error('auto_list_error', { error: String(error) });
    return NextResponse.json({ error: 'Erreur de chargement' }, { status: 500 });
  }
}
