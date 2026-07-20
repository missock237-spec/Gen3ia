// ============================================================
// POST /api/agents/run — Exécuter un agent (ReAct Loop)
// ============================================================
// Boucle ReAct complète : Think → Act → Observe
// Avec checkpointing (reprise sur panne) + supervisor (garde-fou) + logs structurés
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { checkpointManager } from "@/lib/checkpoint";
import { supervisor } from "@/lib/supervisor";
import { rateLimiter } from "@/lib/rate-limiter";
import { executeAgentSchema } from "@/lib/validation";
import { handleApiError } from "@/lib/errors";
import { ZodError } from "zod";

interface ReActStep {
  thought: string;
  action: string;
  actionInput: string;
  observation: string;
  cost: number;
  tokens: number;
  timestamp: string;
}

export async function POST(request: NextRequest) {
  try {
    // 1. Rate limiting
    const identifier = request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? "127.0.0.1";
    const { allowed, remaining, resetIn } = await rateLimiter.check(identifier, "/api/agents/run");

    if (!allowed) {
      return NextResponse.json(
        { error: "Trop de requêtes", retryAfter: resetIn },
        { status: 429, headers: { "X-RateLimit-Remaining": "0", "Retry-After": String(resetIn) } },
      );
    }

    // 2. Validation Zod
    let body: { agentId: string; input: string; sessionId?: string; resume?: boolean };
    try {
      body = executeAgentSchema.parse(await request.json());
    } catch (error) {
      if (error instanceof ZodError) {
        return NextResponse.json({ error: "Données invalides", details: error.errors }, { status: 400 });
      }
      throw error;
    }

    const { agentId, input, sessionId: existingSessionId, resume } = body;

    // 3. Charger l'agent
    const agent = await prisma.agent.findUnique({ where: { id: agentId } });
    if (!agent) {
      return NextResponse.json({ error: "Agent introuvable" }, { status: 404 });
    }

    // 4. Générer ou reprendre une session
    const sessionId = existingSessionId ?? `session_${agentId}_${Date.now()}`;

    // 5. Vérifier les crédits
    const user = await prisma.user.findUnique({ where: { id: agent.userId }, select: { credits: true, plan: true } });
    if (!user || user.credits < 1) {
      return NextResponse.json({ error: "Crédits insuffisants" }, { status: 402 });
    }

    logger.info("agent_execution_started", { agentId, sessionId, inputLength: input.length, resume: !!resume });

    // 6. Boucle ReAct
    let iteration = 0;
    let totalCost = 0;
    let totalTokens = 0;
    let previousState = resume ? await checkpointManager.getLatest(agentId, sessionId) : null;
    if (previousState) {
      iteration = previousState.step;
      totalCost = previousState.totalCost;
      totalTokens = previousState.totalTokens;
    }

    const steps: ReActStep[] = [];
    const maxIterations = 25;
    const maxCostLimit = 1.0;
    const maxTokens = 10000;

    while (iteration < maxIterations) {
      // 6a. Check supervisor
      const supervisorResult = await supervisor.check(
        agentId, sessionId, iteration, totalCost, totalTokens,
        { maxIterations, maxCostLimit, maxTokens },
      );

      if (supervisorResult.decision === "stop") {
        logger.info("agent_stopped_by_supervisor", { agentId, sessionId, reason: supervisorResult.reason });
        break;
      }

      // 6b. Penser (Think) — appeler le LLM
      iteration++;
      const thought = `[Étape ${iteration}] Analyse de: "${input.slice(0, 100)}${input.length > 100 ? "..." : ""}"`;

      // Simulation — REMPLACER par un vrai appel OpenAI/LLM ici
      const stepCost = 0.0002;
      const stepTokens = 150;
      totalCost += stepCost;
      totalTokens += stepTokens;

      // 6c. Agir (Act)
      const step: ReActStep = {
        thought,
        action: "process_input",
        actionInput: input,
        observation: `Traitement effectué via ${agent.type}`,
        cost: stepCost,
        tokens: stepTokens,
        timestamp: new Date().toISOString(),
      };
      steps.push(step);

      // 6d. Sauvegarder checkpoint après chaque étape
      await checkpointManager.save({
        agentId,
        sessionId,
        step: iteration,
        context: { lastInput: input },
        memory: [{ role: "user", content: input, timestamp: new Date().toISOString() }, { role: "assistant", content: thought, timestamp: new Date().toISOString() }],
        actions: steps.map((s) => ({ action: s.action, input: s.actionInput, output: s.observation, timestamp: s.timestamp, cost: s.cost })),
        totalCost,
        totalTokens,
      });

      // 6e. Condition de sortie normale
      if (iteration >= maxIterations) break;

      // Simulation : après 3 itérations, on arrête
      if (iteration >= 3) {
        logger.info("agent_completed", { agentId, sessionId, steps: iteration, totalCost, totalTokens });
        break;
      }
    }

    // 7. Enregistrer l'exécution complète
    await prisma.agentExecution.create({
      data: {
        agentId,
        userId: agent.userId,
        task: input.slice(0, 500),
        steps: JSON.stringify(steps),
        currentStep: iteration,
        totalSteps: iteration,
        status: "completed",
        totalDuration: 0,
        totalTokens,
        estimatedCost: totalCost,
        result: JSON.stringify({ output: steps.map((s) => s.observation).join("\n") }),
        completedAt: new Date(),
      },
    });

    // 8. Débiter les crédits
    const creditsToCharge = Math.max(1, Math.ceil(totalCost * 1000));
    await prisma.user.update({ where: { id: agent.userId }, data: { credits: { decrement: creditsToCharge } } });

    // 9. Nettoyer les checkpoints
    await checkpointManager.cleanup(agentId, sessionId);

    logger.info("agent_execution_success", { agentId, sessionId, steps: iteration, totalTokens, totalCost, creditsCharged: creditsToCharge });

    return NextResponse.json({
      success: true,
      sessionId,
      steps: iteration,
      totalCost,
      totalTokens,
      output: steps.map((s) => s.observation).join("\n"),
      stoppedBy: iteration >= maxIterations ? "iteration_limit" : null,
    });

  } catch (error) {
    logger.error("agent_execution_crashed", { error: error instanceof Error ? error.message : String(error) });
    return handleApiError(error);
  }
}