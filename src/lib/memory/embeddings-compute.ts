import { createLogger } from '@/lib/logger';
import { createComputeEngineV2 } from '@/lib/compute/engine-v2';
const log = createLogger('embeddings-compute');
let computeEngine: ReturnType<typeof createComputeEngineV2> | null = null;
async function getCompute() {
  if (!computeEngine) { computeEngine = createComputeEngineV2({ preferredBackend: 'auto' }); await computeEngine.initialize(); }
  return computeEngine;
}
export async function computeActivation(embedding: number[]): Promise<number[]> {
  const engine = await getCompute();
  const result = await engine.compute({ operation: 'sigmoid', input: new Float32Array(embedding), options: { priority: 'high', cacheTTLMs: 60000 } });
  return (result.data as number[]) || embedding;
}
export async function normalizeEmbedding(embedding: number[]): Promise<number[]> {
  const engine = await getCompute();
  const result = await engine.compute({ operation: 'normalize', input: new Float32Array(embedding), options: { priority: 'high', cacheTTLMs: 300000 } });
  return (result.data as number[]) || embedding;
}
export async function computeSimilarityScores(scores: number[]): Promise<number[]> {
  const engine = await getCompute();
  const result = await engine.compute({ operation: 'softmax', input: new Float32Array(scores), options: { priority: 'normal', cacheTTLMs: 60000 } });
  return (result.data as number[]) || scores;
}
export async function batchNormalize(embeddings: number[][]): Promise<number[][]> {
  const engine = await getCompute();
  const results = await engine.computeBatch({ operations: embeddings.map(e => ({ operation: 'normalize', input: new Float32Array(e), options: { priority: 'normal' } })), options: { useCache: true } });
  return results.map((r, i) => (r.data as number[]) || embeddings[i]);
}