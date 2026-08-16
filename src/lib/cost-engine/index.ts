import { logger } from "@/lib/logger";

const MODELS = [
  { id: "gpt-4o-mini", provider: "openai", costPerInputToken: 0.15, costPerOutputToken: 0.6, maxTokens: 16384, latencyMs: 800, capabilities: ["text", "code", "reasoning"], quality: 0.7 },
  { id: "gpt-4o", provider: "openai", costPerInputToken: 2.5, costPerOutputToken: 10, maxTokens: 16384, latencyMs: 1500, capabilities: ["text", "code", "reasoning", "vision"], quality: 0.9 },
  { id: "claude-3-haiku", provider: "anthropic", costPerInputToken: 0.25, costPerOutputToken: 1.25, maxTokens: 8192, latencyMs: 600, capabilities: ["text", "code"], quality: 0.75 },
  { id: "claude-3.5-sonnet", provider: "anthropic", costPerInputToken: 3, costPerOutputToken: 15, maxTokens: 16384, latencyMs: 1200, capabilities: ["text", "code", "reasoning", "analysis"], quality: 0.95 },
  { id: "mistral-small", provider: "mistral", costPerInputToken: 0.1, costPerOutputToken: 0.3, maxTokens: 8192, latencyMs: 500, capabilities: ["text", "code"], quality: 0.6 },
  { id: "deepseek-coder", provider: "deepseek", costPerInputToken: 0.14, costPerOutputToken: 0.28, maxTokens: 32768, latencyMs: 400, capabilities: ["code"], quality: 0.8 },
];

export class CostOptimizationEngine {
  selectModel(task, budgetPerTask) {
    const filtered = MODELS.filter(m => m.latencyMs <= (task.maxLatencyMs || 5000));
    if (filtered.length === 0) return { model: MODELS[0], estimatedCost: 0.01, estimatedDurationMs: 500, reasoning: "Fallback", alternatives: [] };
    const scored = filtered.map(m => ({ model: m, cost: this.estimateCost(m, task), score: m.quality / (this.estimateCost(m, task) + 0.001) }));
    scored.sort((a, b) => b.score - a.score);
    if (budgetPerTask && scored[0].cost > budgetPerTask) {
      const affordable = scored.filter(s => s.cost <= budgetPerTask);
      if (affordable.length > 0) return { model: affordable[0].model, estimatedCost: affordable[0].cost, estimatedDurationMs: affordable[0].model.latencyMs, reasoning: "Budget", alternatives: scored.slice(0, 3).map(s => s.model) };
    }
    return { model: scored[0].model, estimatedCost: scored[0].cost, estimatedDurationMs: scored[0].model.latencyMs, reasoning: "Optimal", alternatives: scored.slice(0, 3).map(s => s.model) };
  }
  private estimateCost(model, task) { return (task.estimatedInputTokens / 1000000) * model.costPerInputToken + (task.estimatedOutputTokens / 1000000) * model.costPerOutputToken; }
  trackActualCost(modelId, inputTokens, outputTokens) {
    const m = MODELS.find(x => x.id === modelId);
    if (!m) return 0;
    const cost = (inputTokens / 1000000) * m.costPerInputToken + (outputTokens / 1000000) * m.costPerOutputToken;
    if (cost > 0.1) logger.warn("Cout eleve", { modelId, cost });
    return cost;
  }
  getModelStats() { return MODELS.map(m => ({ id: m.id, provider: m.provider, quality: m.quality, costPer1kTokens: (m.costPerInputToken + m.costPerOutputToken) / 2000 })); }
}
export const costEngine = new CostOptimizationEngine();
