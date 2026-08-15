import { createLogger } from '@/lib/logger';
import { createComputeEngineV2 } from '@/lib/compute/engine-v2';
import { createComputePredictor } from '@/lib/compute/predictor';
const log = createLogger('agent-compute');
let engine: ReturnType<typeof createComputeEngineV2> | null = null;
async function getEngine() {
// @ts-ignore — type narrowing pending, see refactor ticket
  if (!engine) { engine = createComputeEngineV2({ preferredBackend: 'auto', enablePredictor: true }); await engine.initialize(); }
  return engine;
}
export async function scoreRisk(features: number[]): Promise<number> {
  const e = await getEngine();
  const result = await e.compute({ operation: 'sigmoid', input: new Float32Array(features), options: { priority: 'high', cacheTTLMs: 120000 } });
  const data = result.data as number[] | null;
  return data ? data[0] || 0.5 : 0.5;
}
export async function classifyPrompt(promptEmbedding: number[]): Promise<number[]> {
  const e = await getEngine();
  const result = await e.compute({ operation: 'softmax', input: new Float32Array(promptEmbedding), options: { priority: 'critical', cacheTTLMs: 60000 } });
  return (result.data as number[]) || promptEmbedding;
}
export async function computeToolScore(tools: string[]): Promise<Record<string, number>> {
  const e = await getEngine();
  const embeddings = tools.map(t => new Float32Array([t.length, t.split('_').length, t.charCodeAt(0) || 0, t.charCodeAt(t.length - 1) || 0]));
  const results = await e.computeBatch({
    operations: embeddings.map((emb, i) => ({ operation: 'sigmoid', input: emb, options: { priority: 'normal', cacheTTLMs: 300000 } })),
    options: { useCache: true, usePredictor: true },
  });
  const scores: Record<string, number> = {};
  for (let i = 0; i < tools.length; i++) {
    const data = results[i]?.data as number[] | null;
    scores[tools[i]] = data ? Math.round((data[0] || 0.5) * 100) / 100 : 0.5;
  }
  return scores;
}
export async function estimateExecutionCost(tokens: number, toolCalls: number, durationMs: number): Promise<number> {
  const e = await getEngine();
  const features = new Float32Array([tokens / 1000, toolCalls / 10, durationMs / 10000]);
  const result = await e.compute({ operation: 'sigmoid', input: features, options: { priority: 'normal', cacheTTLMs: 60000 } });
  const data = result.data as number[] | null;
  const raw = data ? data[0] || 0.5 : 0.5;
  return Math.round(raw * tokens * 0.002 * 10000) / 10000;
}
export async function getComputeStats() {
  const e = await getEngine();
  return e.getStats();
}