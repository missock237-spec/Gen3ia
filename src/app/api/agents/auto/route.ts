import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { autoScheduler } from "@/lib/auto-scheduler";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { agentId, autoExecute } = body;
    if (!agentId || !autoExecute) return NextResponse.json({ error: "Champs requis: agentId, autoExecute" }, { status: 400 });
    const agent = await prisma.agent.findUnique({ where: { id: agentId } });
    if (!agent) return NextResponse.json({ error: "Agent introuvable" }, { status: 404 });
    let config: Record<string, unknown> = {};
    try { config = JSON.parse(agent.config); } catch { config = {}; }
    config.autoExecute = { trigger: autoExecute.trigger ?? "schedule", schedule: autoExecute.schedule ?? "every_day", input: autoExecute.input ?? null, cooldownMinutes: autoExecute.cooldownMinutes ?? 60, isActive: autoExecute.isActive ?? true };
    await prisma.agent.update({ where: { id: agentId }, data: { config: JSON.stringify(config) } });
    if (autoExecute.isActive) {
      await autoScheduler.scheduleAgent({ id: agent.id, name: agent.name, type: agent.type, config: JSON.stringify(config), userId: agent.userId });
    }
    logger.info("auto_execution_configured", { agentId, active: autoExecute.isActive });
    return NextResponse.json({ success: true, message: `Auto-execution ${autoExecute.isActive ? "activee" : "desactivee"} pour ${agent.name}` });
  } catch (error) {
    logger.error("auto_config_error", { error: String(error) });
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "Parametre requis: userId" }, { status: 400 });
  const agents = await prisma.agent.findMany({
    where: { userId }, select: { id: true, name: true, type: true, status: true, config: true,
      executions: { where: { status: "completed" }, orderBy: { createdAt: "desc" }, take: 5, select: { createdAt: true, status: true, estimatedCost: true } } },
  });
  const result = agents.map((a) => {
    let auto = null; try { const p = JSON.parse(a.config); auto = p.autoExecute ?? null; } catch {}
    return { id: a.id, name: a.name, type: a.type, status: a.status, autoExecute: auto, lastExecutions: a.executions };
  });
  return NextResponse.json({ agents: result });
}