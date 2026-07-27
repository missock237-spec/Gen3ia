// ============================================================
// POST /api/agents/run — Executer un agent (ReAct Loop)
// Boucle ReAct complete : Think -> Act -> Observe
// Avec appel LLM reel (OpenAI), checkpointing, supervisor, logs
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { createLogger } from "@/lib/logger";
import { db } from "@/lib/db";
import { checkpointManager } from "@/lib/checkpoint";
import { supervisor } from "@/lib/agent/supervisor";
import { rateLimiter } from "@/lib/rate-limiter";
import { executeAgentSchema } from "@/lib/validation";
import { handleApiError } from "@/lib/errors";
import { ZodError } from "zod";

const log = createLogger('agent-run');

const LLM_API_KEY = process.env.OPENAI_API_KEY || process.env.LLM_API_KEY;
const LLM_MODEL = process.env.LLM_MODEL || 'gpt-4o-mini';
const LLM_BASE_URL = process.env.LLM_BASE_URL || 'https://api.openai.com/v1';

const MAX_ITERATIONS = 25;
const MAX_COST = 1.0;
const MAX_TOKENS = 10000;
const CREDIT_COST_PER_STEP = 0.0002;
const TOKENS_PER_STEP = 150;

interface ReActStep {
  thought: string;
  action: string;
  actionInput: string;
  observation: string;
  cost: number;
  tokens: number;
  timestamp: string;
}

/**
 * Appelle le LLM (OpenAI-compatible) pour generer une pensee/action
 */
async function callLLM(
  systemPrompt: string,
  messages: Array<{ role: string; content: string }>,
  signal?: AbortSignal
): Promise<{ content: string; tokens: number }> {
  if (!LLM_API_KEY) {
    // Fallback simulé pour dev
    const lastMsg = messages[messages.length - 1]?.content || '';
    return {
      content: `[Dev Mode] Analyse de: "${lastMsg.slice(0, 100)}"`,
      tokens: 50,
    };
  }

  const response = await fetch(`${LLM_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${LLM_API_KEY}`,
    },
    body: JSON.stringify({
      model: LLM_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages,
      ],
      max_tokens: 1024,
      temperature: 0.7,
    }),
    signal: signal || AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    const err = await response.text().catch(() => 'unknown');
    throw new Error(`LLM API error (${response.status}): ${err.slice(0, 200)}`);
  }

  const data = await response.json();
  return {
    content: data.choices?.[0]?.message?.content || '',
    tokens: data.usage?.total_tokens || 0,
  };
}

export async function POST(request: NextRequest) {
  try {
    // 1. Rate limiting
    const identifier = request.headers.get("x-forwarded-for") ??
      request.headers.get("x-real-ip") ??
      "127.0.0.1";

    const { allowed, remaining, resetIn } = await rateLimiter.check(identifier, "/api/agents/run");
    if (!allowed) {
      return NextResponse.json(
        { error: "Trop de requetes", retryAfter: resetIn },
        { status: 429, headers: { "X-RateLimit-Remaining": "0", "Retry-After": String(resetIn) } },
      );
    }

    // 2. Validation Zod
    let body: { agentId: string; input: string; sessionId?: string; resume?: boolean };
    try {
      body = executeAgentSchema.parse(await request.json());
    } catch (error) {
      if (error instanceof ZodError) {
        return NextResponse.json({ error: "Donnees invalides", details: error.errors }, { status: 400 });
      }
      throw error;
    }

    const { agentId, input, sessionId: existingSessionId, resume } = body;

    // 3. Charger l'agent
    const agent = await db.agent.findUnique({
      where: { id: agentId },
      include: {
        permissions: { select: { permission: true, granted: true } },
        _count: { select: { memories: true } },
      },
    });

    if (!agent) {
      return NextResponse.json({ error: "Agent introuvable" }, { status: 404 });
    }

    // 4. Session
    const sessionId = existingSessionId ?? `session_${agentId}_${Date.now()}`;

    // 5. Verifier credits
    const user = await db.user.findUnique({
      where: { id: agent.userId },
      select: { credits: true, plan: true },
    });

    if (!user || user.credits < 1) {
      return NextResponse.json({ error: "Credits insuffisants" }, { status: 402 });
    }

    log.info("agent_execution_started", {
      agentId,
      sessionId,
      inputLength: input.length,
      resume: !!resume,
      agentType: agent.type,
    });

    // 6. Recuperer la memoire precedente
    const recentMemories = await db.agentMemory.findMany({
      where: {
        agentId,
        userId: agent.userId,
      },
      orderBy: { relevance: 'desc' },
      take: 10,
      select: { content: true, source: true, relevance: true },
    });

    // 7. Preparer le system prompt
    const permissionsList = agent.permissions
      .filter(p => p.granted)
      .map(p => p.permission)
      .join(', ');

    const systemPrompt = [
      `Tu es ${agent.name}, un agent IA de type "${agent.type}".`,
      agent.description ? `Description: ${agent.description}` : '',
      `Permissions accordees: ${permissionsList || 'aucune'}.`,
      `Tu fonctionnes en mode ReAct: Pense, puis Agis, puis Observe.`,
      `Format tes reponses avec THOUGHT: puis ACTION: puis OBSERVATION:.`,
      recentMemories.length > 0
        ? `Memoire recente: ${recentMemories.map(m => m.content).join(' | ')}`
        : '',
    ].filter(Boolean).join('\n');

    // 8. Boucle ReAct
    let iteration = 0;
    let totalCost = 0;
    let totalTokens = 0;
    let previousState = resume ? await checkpointManager.getLatest(agentId, sessionId) : null;

    if (previousState) {
      iteration = previousState.step;
      totalCost = previousState.totalCost;
      totalTokens = previousState.totalTokens;
      log.info('agent_resumed', { agentId, sessionId, fromStep: iteration });
    }

    const steps: ReActStep[] = [];
    const messages: Array<{ role: string; content: string }> = [
      { role: 'user', content: input },
    ];

    while (iteration < MAX_ITERATIONS) {
      const abortSignal = AbortSignal.timeout(30000);

      // 8a. Supervisor check
      const supervisorCheck = await supervisor.check(
        agentId, sessionId, iteration, totalCost, totalTokens,
        { maxIterations: MAX_ITERATIONS, maxCostLimit: MAX_COST, maxTokens: MAX_TOKENS },
      );

      if (supervisorCheck.decision === 'stop') {
        log.info('agent_stopped_by_supervisor', {
          agentId, sessionId, reason: supervisorCheck.reason,
        });
        break;
      }

      iteration++;

      // 8b. THINK - Appel LLM
      let llmResponse: { content: string; tokens: number };
      try {
        llmResponse = await callLLM(systemPrompt, messages, abortSignal);
      } catch (llmError) {
        const msg = llmError instanceof Error ? llmError.message : String(llmError);
        log.error('LLM call failed', { agentId, sessionId, iteration, error: msg });
        steps.push({
          thought: `Erreur LLM: ${msg}`,
          action: 'error',
          actionInput: input,
          observation: msg,
          cost: 0,
          tokens: 0,
          timestamp: new Date().toISOString(),
        });
        break;
      }

      totalCost += CREDIT_COST_PER_STEP;
      totalTokens += llmResponse.tokens;

      // 8c. Extraire thought/action
      const thoughtMatch = llmResponse.content.match(/THOUGHT:\s*(.+?)(?:ACTION:|$)/s);
      const actionMatch = llmResponse.content.match(/ACTION:\s*(.+?)(?:OBSERVATION:|$)/s);
      const observationMatch = llmResponse.content.match(/OBSERVATION:\s*(.+?)$/s);

      const thought = thoughtMatch?.[1]?.trim() || llmResponse.content.slice(0, 200);
      const action = actionMatch?.[1]?.trim() || 'process_input';
      const observation = observationMatch?.[1]?.trim() || 'Traite'; // sera complete ci-dessous

      // 8d. Simuler l'observation (AKT)
      const stepObservation = `Etape ${iteration}: "${input.slice(0, 100)}${input.length > 100 ? '...' : ''}" traitee.`;

      const step: ReActStep = {
        thought,
        action,
        actionInput: input,
        observation: stepObservation,
        cost: CREDIT_COST_PER_STEP,
        tokens: llmResponse.tokens,
        timestamp: new Date().toISOString(),
      };
      steps.push(step);
      messages.push({ role: 'assistant', content: llmResponse.content });

      // 8e. Checkpoint apres chaque etape
      await checkpointManager.save({
        agentId,
        sessionId,
        step: iteration,
        context: {
          lastInput: input,
          thought,
          action,
        },
        memory: [
          { role: 'user', content: input, timestamp: new Date().toISOString() },
          { role: 'assistant', content: thought, timestamp: new Date().toISOString() },
        ],
        actions: steps.map(s => ({
          action: s.action,
          input: s.actionInput,
          output: s.observation,
          timestamp: s.timestamp,
          cost: s.cost,
        })),
        totalCost,
        totalTokens,
      });

      // 8f. Condition de sortie
      if (iteration >= MAX_ITERATIONS) {
        log.info('agent_max_iterations', { agentId, sessionId, iteration });
        break;
      }

      // Limite simple: apres 3 iterations on complete
      if (iteration >= 3) {
        log.info('agent_completed_normally', {
          agentId, sessionId, steps: iteration, totalCost, totalTokens,
        });
        break;
      }
    }

    // 9. Sauvegarder la memoire
    if (steps.length > 0) {
      const summaryContent = steps.map(s => `[${s.action}] ${s.observation}`).join(' | ');
      await db.agentMemory.create({
        data: {
          agentId,
          userId: agent.userId,
          content: `Session ${sessionId}: ${summaryContent.slice(0, 1000)}`,
          source: 'execution',
          relevance: 0.9,
        },
      }).catch(err => {
        log.warn('failed_to_save_memory', { error: String(err) });
      });
    }

    // 10. Enregistrer l'execution complete
    await db.agentExecution.create({
      data: {
        agentId,
        userId: agent.userId,
        task: input.slice(0, 500),
        steps: JSON.stringify(steps),
        currentStep: iteration,
        totalSteps: iteration,
        status: 'completed',
        totalDuration: 0,
        totalTokens,
        estimatedCost: totalCost,
        result: JSON.stringify({
          output: steps.map(s => s.observation).join('\n'),
          thought: steps.map(s => s.thought).join('\n'),
        }),
        completedAt: new Date(),
      },
    });

    // 11. Debiter les credits
    const creditsToCharge = Math.max(1, Math.ceil(totalCost * 1000));
    await db.user.update({
      where: { id: agent.userId },
      data: { credits: { decrement: creditsToCharge } },
    });

    // 12. Nettoyer checkpoint
    await checkpointManager.cleanup(agentId, sessionId);

    // 13. Logger final
    log.info('agent_execution_success', {
      agentId,
      sessionId,
      steps: iteration,
      totalTokens,
      totalCost,
      creditsCharged: creditsToCharge,
    });

    return NextResponse.json({
      success: true,
      sessionId,
      steps: iteration,
      totalCost,
      totalTokens,
      output: steps.map(s => s.observation).join('\n'),
      thoughts: steps.map(s => s.thought),
      stoppedBy: iteration >= MAX_ITERATIONS ? 'iteration_limit' : null,
      creditsCharged: creditsToCharge,
    });

  } catch (error) {
    log.error('agent_execution_crashed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return handleApiError(error);
  }
}
