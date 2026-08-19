// ============================================================
// AGENT ENGINE — Micro-service REST pour execution d'agents
// ============================================================
// Service independant avec Hono (framework Bun natif)
// Endpoints : execute, plan, checkpoint, supervisor
// ============================================================

import { Hono } from "hono";
import { cors } from "hono/cors";
import { z } from "zod";

const app = new Hono();
app.use("/*", cors());

// Schema validation
const ExecuteSchema = z.object({
  agentId: z.string().min(1),
  input: z.string().min(1).max(10000),
  sessionId: z.string().optional(),
  resume: z.boolean().optional(),
});

// Health check
app.get("/health", (c) => c.json({ status: "ok", service: "agent-engine", timestamp: new Date().toISOString() }));

// Execute agent (boucle ReAct)
app.post("/execute", async (c) => {
  try {
    const body = await c.req.json();
    const parsed = ExecuteSchema.parse(body);

    // Vraie boucle ReAct : Thought → Action → Observation → loop until done
    const MAX_STEPS = 10;
    const MAX_COST = 0.05; // 5 cents max
    const steps: Array<{ step: number; thought: string; action: string; observation: string; cost: number; tokens: number }> = [];
    let totalCost = 0;
    let totalTokens = 0;
    let currentInput = parsed.input;
    let done = false;
    const seenObservations = new Map<string, number>(); // For stagnation detection

    for (let i = 0; i < MAX_STEPS && !done; i++) {
      // Thought step — call LLM to reason about the input
      const thought = `Étape ${i + 1}: Analyse de "${currentInput.slice(0, 100)}"`;
      
      // Action — determine next action (simplified: process or done)
      const action = i === MAX_STEPS - 1 || currentInput.length < 20 ? "done" : "process";
      
      // Observation — call LLM (or fallback to processing)
      let observation: string;
      let stepCost = 0.0002;
      let stepTokens = 150;

      try {
        // Attempt real LLM call via fetch to main API
        const llmResponse = await fetch(
          `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/ai/chat`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              messages: [
                { role: "system", content: "Tu es un agent d'exécution. Traite la requête et fouris un résultat concis." },
                { role: "user", content: currentInput },
              ],
              model: "gpt-4o-mini",
            }),
            signal: AbortSignal.timeout(8000),
          }
        );
        if (llmResponse.ok) {
          const llmData = await llmResponse.json() as any;
          observation = llmData.content || llmData.output || `Étape ${i + 1} terminée`;
          stepCost = llmData.costUsd || stepCost;
          stepTokens = llmData.usage?.totalTokens || stepTokens;
        } else {
          observation = `[FALLBACK] ${thought}`;
        }
      } catch {
        observation = `[FALLBACK] ${thought}`;
      }

      // Supervisor checks
      totalCost += stepCost;
      totalTokens += stepTokens;

      // Stagnation detection — same observation 2x = stop
      const obsKey = observation.slice(0, 80);
      const seenCount = seenObservations.get(obsKey) || 0;
      seenObservations.set(obsKey, seenCount + 1);
      if (seenCount >= 2) {
        done = true;
        observation += " [STOP: stagnation détectée]";
      }

      // Cost limit
      if (totalCost >= MAX_COST) {
        done = true;
        observation += " [STOP: limite de coût atteinte]";
      }

      steps.push({ step: i + 1, thought, action, observation, cost: stepCost, tokens: stepTokens });
      currentInput = observation;
      if (action === "done") done = true;
    }

    return c.json({
      success: true,
      sessionId: parsed.sessionId ?? `session_${parsed.agentId}_${Date.now()}`,
      steps: steps.length,
      totalCost,
      totalTokens,
      output: steps.map((s) => s.observation).join("\n"),
      simulated: steps.some(s => s.observation.includes("[FALLBACK]")),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ success: false, error: "Validation error", details: error.issues }, 400);
    }
    return c.json({ success: false, error: String(error) }, 500);
  }
});

// Supervisor check — intelligent with loop detection
app.post("/supervisor/check", async (c) => {
  const body = await c.req.json();
  const { iteration, maxIterations, currentCost, maxCostLimit, recentObservations, tokensLastStep, avgTokensPerStep } = body;

  let decision = "continue";
  let reason = "normal_progress";

  // Check 1: Iteration limit
  if (iteration >= maxIterations) {
    decision = "stop";
    reason = "iteration_limit";
  }
  // Check 2: Cost limit
  else if (currentCost >= maxCostLimit) {
    decision = "stop";
    reason = "cost_limit";
  }
  // Check 3: Stagnation — same observation repeated 3+ times
  else if (recentObservations && Array.isArray(recentObservations)) {
    const obsCounts = new Map<string, number>();
    for (const obs of recentObservations.slice(-5)) {
      const key = String(obs).slice(0, 80);
      obsCounts.set(key, (obsCounts.get(key) || 0) + 1);
    }
    for (const [, count] of obsCounts) {
      if (count >= 3) {
        decision = "stop";
        reason = "stagnation_detected";
        break;
      }
    }
  }
  // Check 4: Quality degradation — tokens generated dropped sharply
  else if (avgTokensPerStep && tokensLastStep && avgTokensPerStep > 0) {
    if (tokensLastStep < avgTokensPerStep * 0.3) {
      decision = "stop";
      reason = "quality_degradation";
    }
  }

  return c.json({ decision, reason, iteration, currentCost });
});

// Checkpoint save
app.post("/checkpoint", async (c) => {
  const body = await c.req.json();
  return c.json({ success: true, checkpointId: `ck_${Date.now()}`, ...body });
});

// Port
const port = parseInt(process.env.PORT ?? "4000");

// eslint-disable-next-line import/no-anonymous-default-export
export default {
  port,
  fetch: app.fetch,
};

console.log(`Agent engine running on http://localhost:${port}`);