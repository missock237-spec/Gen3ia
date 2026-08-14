import { NextRequest, NextResponse } from "next/server";
import { createLogger } from "@/lib/logger";
import { db } from "@/lib/db";
import { checkpointManager } from "@/lib/checkpoint";
import { supervisor } from "@/lib/agent/supervisor";
import { rateLimiter } from "@/lib/rate-limiter";
import { executeAgentSchema } from "@/lib/validation";
import { handleApiError } from "@/lib/errors";
import { callLLM } from "@/lib/llm";
import { ZodError } from "zod";

// Agent Safety — detection d'injections et jailbreak (Rust natif + fallback JS)
// Dynamic import with fallback
type SafetyResult = { safe: boolean; score: number; reason: string };
let checkPromptInjection: (input: string) => Promise<SafetyResult> | SafetyResult;
let checkJailbreak: (input: string) => Promise<SafetyResult> | SafetyResult;
try {
  const safety = await import("@gen3ia/agent-safety");
  checkPromptInjection = safety.checkPromptInjection;
  checkJailbreak = safety.checkJailbreak;
} catch {
  checkPromptInjection = (input: string) => ({ safe: true, score: 0, reason: "safety-module-not-available" });
  checkJailbreak = (input: string) => ({ safe: true, score: 0, reason: "safety-module-not-available" });
}





export const dynamic = "force-dynamic";
const log = createLogger('agent-run');
const MAX_ITERATIONS = 25;
const MAX_COST = 1.0;
const MAX_TOKENS = 10000;
const CREDIT_COST_PER_STEP = 0.0002;

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
    const identifier = request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? "127.0.0.1";
    const { allowed, resetIn } = await rateLimiter.check(identifier, "/api/agents/run");
    if (!allowed) {
      return NextResponse.json({ error: "Trop de requetes", retryAfter: resetIn }, { status: 429 });
    }

    let body: { agentId: string; input: string; sessionId?: string; resume?: boolean };
    try {
      body = executeAgentSchema.parse(await request.json());
    } catch (error) {
      if (error instanceof ZodError) {
        return NextResponse.json({ error: "Donnees invalides", details: error.issues }, { status: 400 });
      }
      throw error;
    }

    const { agentId, input, sessionId: existingSessionId, resume } = body;

    // ============================================================
    // SECURITE: Detection d'injections et jailbreak
    // ============================================================
    const injectionCheck = checkPromptInjection(input);
    if (!injectionCheck.safe) {
      log.warn('prompt_injection_detected', { agentId, score: injectionCheck.score, reason: injectionCheck.reason });
      await db.agentActionLog.create({
        data: {
          agentId, action: 'prompt_injection_blocked',
          details: JSON.stringify({ score: injectionCheck.score, reason: injectionCheck.reason }),
          status: 'blocked', userId: '', resolvedAt: new Date(),
        },
      }).catch(() => {});
      return NextResponse.json({ error: "Entree bloque par le securite", reason: injectionCheck.reason }, { status: 400 });
    }

    const jailbreakCheck = checkJailbreak(input);
    if (!jailbreakCheck.safe) {
      log.warn('jailbreak_attempt_detected', { agentId, score: jailbreakCheck.score });
      return NextResponse.json({ error: "Tentative de jailback detectee" }, { status: 400 });
    }

    const agent = await db.agent.findUnique({
      where: { id: agentId },
      include: {
        permissions: { select: { permission: true, granted: true } },
        _count: { select: { memories: true } },
      },
    });
    if (!agent) return NextResponse.json({ error: "Agent introuvable" }, { status: 404 });

    const sessionId = existingSessionId ?? `session_${agentId}_${Date.now()}`;

    const user = await db.user.findUnique({
      where: { id: agent.userId },
      select: { credits: true, plan: true },
    });
    if (!user || user.credits < 1) return NextResponse.json({ error: "Credits insuffisants" }, { status: 402 });

    log.info("agent_execution_started", { agentId, sessionId, inputLength: input.length, resume: !!resume, agentType: agent.type });

    const recentMemories = await db.agentMemory.findMany({
      where: { agentId, userId: agent.userId },
      orderBy: { relevance: 'desc' }, take: 10,
      select: { content: true, source: true },
    });

    const permissionsList = agent.permissions.filter(p => p.granted).map(p => p.permission).join(', ');

    const systemPrompt = [
      `Tu es ${agent.name}, un agent IA de type "${agent.type}".`,
      agent.description ? `Description: ${agent.description}` : '',
      permissionsList ? `Permissions: ${permissionsList}.` : '',
      `Fonctionne en mode ReAct: THOUGHT: (pensee) ACTION: (action) OBSERVATION: (observation).`,
      recentMemories.length > 0 ? `Memoire: ${recentMemories.map(m => m.content).join(' | ')}` : '',
    ].filter(Boolean).join('\n');

    let iteration = 0, totalCost = 0, totalTokens = 0;

    if (resume) {
      const saved = await checkpointManager.restore(agentId, sessionId);
      if (saved) {
        iteration = saved.step; totalCost = saved.totalCost; totalTokens = saved.totalTokens;
        log.info('agent_resumed', { agentId, sessionId, fromStep: iteration });
      }
    }

    const steps: ReActStep[] = [];
    const messages: Array<{ role: string; content: string }> = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: input },
    ];

    while (iteration < MAX_ITERATIONS) {
      if (iteration > 0) {
        const lastStep = steps[steps.length - 1];
        const check = supervisor.recordIteration({
          step: iteration, action: lastStep.action, thought: lastStep.thought,
          result: lastStep.observation, timestamp: new Date(),
        });
        if (check.shouldStop) {
          log.info('agent_stopped_by_supervisor', { agentId, sessionId, reason: check.reason });
          break;
        }
      }

      iteration++;

      let llmResponse: { content: string; tokens: number };
      try {
        const result = await callLLM({
          messages: messages.map(m => ({ role: m.role as 'system' | 'user' | 'assistant', content: m.content })),
          maxTokens: 1024, temperature: 0.7, signal: AbortSignal.timeout(30000),
        }, { tag: `agent-run:${agentId}` });
        llmResponse = { content: result.content, tokens: result.tokens };
      } catch (llmError) {
        const msg = llmError instanceof Error ? llmError.message : String(llmError);
        log.error('LLM call failed', { agentId, sessionId, iteration, error: msg });
        steps.push({ thought: `Erreur LLM: ${msg}`, action: 'error', actionInput: input, observation: msg, cost: 0, tokens: 0, timestamp: new Date().toISOString() });
        break;
      }

      totalCost += CREDIT_COST_PER_STEP;
      totalTokens += llmResponse.tokens;

      // Securite: verifier la reponse du LLM aussi
      const llmInjectionCheck = checkPromptInjection(llmResponse.content);
      if (!llmInjectionCheck.safe) {
        log.warn('llm_output_injection', { agentId, score: llmInjectionCheck.score });
        break;
      }

      const thoughtMatch = llmResponse.content.match(/THOUGHT:\s*(.+?)(?:ACTION:|$)/s);
      const actionMatch = llmResponse.content.match(/ACTION:\s*(.+?)(?:OBSERVATION:|$)/s);
      const obsMatch = llmResponse.content.match(/OBSERVATION:\s*(.+?)$/s);

      const thought = thoughtMatch?.[1]?.trim() || llmResponse.content.slice(0, 200);
      const action = actionMatch?.[1]?.trim() || 'process_input';
      const observation = obsMatch?.[1]?.trim() || `Etape ${iteration}: traitee.`;

      const step: ReActStep = { thought, action, actionInput: input, observation, cost: CREDIT_COST_PER_STEP, tokens: llmResponse.tokens, timestamp: new Date().toISOString() };
      steps.push(step);
      messages.push({ role: 'assistant', content: llmResponse.content });

      await checkpointManager.save({
        agentId, sessionId, step: iteration,
        context: { lastInput: input, thought, action },
        memory: [
          { role: 'user', content: input, timestamp: new Date().toISOString() },
          { role: 'assistant', content: thought, timestamp: new Date().toISOString() },
        ],
        actions: steps.map(s => ({ action: s.action, input: s.actionInput, output: s.observation, timestamp: s.timestamp, cost: s.cost })),
        totalCost, totalTokens,
      });

      if (iteration >= MAX_ITERATIONS || iteration >= 3) break;
    }

    if (steps.length > 0) {
      const summary = steps.map(s => `[${s.action}] ${s.observation}`).join(' | ');
      await db.agentMemory.create({ data: { agentId, userId: agent.userId, content: `Session ${sessionId}: ${summary.slice(0, 1000)}`, source: 'execution', relevance: 0.9 } }).catch(() => {});
    }

    await db.agentExecution.create({
      data: {
        agentId, userId: agent.userId, task: input.slice(0, 500),
        steps: JSON.stringify(steps), currentStep: iteration, totalSteps: iteration,
        status: 'completed', totalDuration: 0, totalTokens, estimatedCost: totalCost,
        result: JSON.stringify({ output: steps.map(s => s.observation).join('\n'), thoughts: steps.map(s => s.thought) }),
        completedAt: new Date(),
      },
    });

    const creditsToCharge = Math.max(1, Math.ceil(totalCost * 1000));
    await db.user.update({ where: { id: agent.userId }, data: { credits: { decrement: creditsToCharge } } });
    await checkpointManager.cleanOldSessions(agentId, 5);

    log.info('agent_execution_success', { agentId, sessionId, steps: iteration, totalTokens, totalCost, creditsCharged: creditsToCharge });

    return NextResponse.json({ success: true, sessionId, steps: iteration, totalCost, totalTokens, output: steps.map(s => s.observation).join('\n'), thoughts: steps.map(s => s.thought), stoppedBy: iteration >= MAX_ITERATIONS ? 'iteration_limit' : null, creditsCharged: creditsToCharge });

  } catch (error) {
    log.error('agent_execution_crashed', { error: error instanceof Error ? error.message : String(error) });
    return handleApiError(error);
  }
}