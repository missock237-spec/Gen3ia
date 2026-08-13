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

    // Simulation execution — a remplacer par vraie boucle ReAct
    const steps: Array<{ step: number; thought: string; action: string; observation: string; cost: number; tokens: number }> = [];
    for (let i = 0; i < 3; i++) {
      steps.push({
        step: i + 1,
        thought: `Analyse de l'input: ${parsed.input.slice(0, 50)}...`,
        action: "process",
        observation: `Etape ${i + 1} terminee`,
        cost: 0.0002,
        tokens: 150,
      });
    }

    return c.json({
      success: true,
      sessionId: parsed.sessionId ?? `session_${parsed.agentId}_${Date.now()}`,
      steps: steps.length,
      totalCost: steps.reduce((s, st) => s + st.cost, 0),
      totalTokens: steps.reduce((s, st) => s + st.tokens, 0),
      output: steps.map((s) => s.observation).join("\n"),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ success: false, error: "Validation error", details: error.issues }, 400);
    }
    return c.json({ success: false, error: String(error) }, 500);
  }
});

// Supervisor check
app.post("/supervisor/check", async (c) => {
  const body = await c.req.json();
  const { iteration, maxIterations, currentCost, maxCostLimit } = body;

  let decision = "continue";
  let reason = "normal_progress";

  if (iteration >= maxIterations) {
    decision = "stop";
    reason = "iteration_limit";
  } else if (currentCost >= maxCostLimit) {
    decision = "stop";
    reason = "cost_limit";
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

export default {
  port,
  fetch: app.fetch,
};

console.log(`Agent engine running on http://localhost:${port}`);