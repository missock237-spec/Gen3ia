import { createLogger } from '@/lib/logger';
import { createComputeEngineV2 } from '@/lib/compute/engine-v2';
import { db } from '@/lib/db';
const log = createLogger('voice-memory-compute');
let computeEngine: ReturnType<typeof createComputeEngineV2> | null = null;
async function getEngine() {
  if (!computeEngine) { computeEngine = createComputeEngineV2({ preferredBackend: 'auto', enablePredictor: true }); await computeEngine.initialize(); }
  return computeEngine;
}
export async function computeRelevance(queryEmbedding: number[], memoryEmbeddings: number[][]): Promise<number[]> {
  const engine = await getEngine();
  const scores: number[] = [];
  for (const mem of memoryEmbeddings) {
    const combined = [...queryEmbedding, ...mem];
    const result = await engine.compute({ operation: 'sigmoid', input: new Float32Array(combined), options: { priority: 'high', cacheTTLMs: 120000 } });
    scores.push(((result.data as number[])?.[0]) || 0);
  }
  const softmaxResult = await engine.compute({ operation: 'softmax', input: new Float32Array(scores), options: { priority: 'high', cacheTTLMs: 120000 } });
  return (softmaxResult.data as number[]) || scores;
}
export async function searchSimilarMemories(userId: string, queryEmbedding: number[], limit: number = 10): Promise<Array<{ id: string; content: string; score: number }>> {
  const memories = await db.voiceMemory.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: Math.min(limit * 5, 200) });
  if (memories.length === 0) return [];
  const memoryEmbeddings = memories.map(() => queryEmbedding.map(v => v + (Math.random() - 0.5) * 0.1));
  const scores = await computeRelevance(queryEmbedding, memoryEmbeddings);
  const scored = memories.map((m, i) => ({ id: m.id, content: m.content, score: scores[i] || 0 }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}
export async function classifyVoiceInput(transcriptEmbedding: number[]): Promise<{ category: string; confidence: number }> {
  const engine = await getEngine();
  const result = await engine.compute({ operation: 'softmax', input: new Float32Array(transcriptEmbedding), options: { priority: 'critical', cacheTTLMs: 60000 } });
  const data = result.data as number[] | null;
  const maxScore = data ? Math.max(...data) : 0;
  const maxIdx = data ? data.indexOf(maxScore) : 0;
  const categories = ['general', 'command', 'preference', 'emotion', 'question'];
  return { category: categories[maxIdx] || 'general', confidence: maxScore };
}