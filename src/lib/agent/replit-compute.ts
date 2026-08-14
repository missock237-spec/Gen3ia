import { createLogger } from '@/lib/logger';
import { createComputeEngineV2 } from '@/lib/compute/engine-v2';
const log = createLogger('replit-compute');
let engine: ReturnType<typeof createComputeEngineV2> | null = null;
async function getEngine() {
// @ts-ignore
  if (!engine) { engine = createComputeEngineV2({ preferredBackend: 'auto', enablePredictor: true }); await engine.initialize(); }
  return engine;
}
export async function computeComplexity(codeLength: number, numFiles: number): Promise<number> {
  const e = await getEngine();
  const result = await e.compute({ operation: 'sigmoid', input: new Float32Array([codeLength / 10000, numFiles / 10]), options: { priority: 'normal', cacheTTLMs: 300000 } });
  const data = result.data as number[] | null;
  return data ? Math.round((data[0] || 0.5) * 100) / 100 : 0.5;
}
export async function batchAnalyzeFiles(files: Array<{ name: string; content: string; language: string }>): Promise<Array<{ name: string; complexity: number; hasError: boolean }>> {
  const e = await getEngine();
  const results = await e.computeBatch({
    operations: files.map(f => {
      const lines = f.content.split('\n').length;
      const imports = (f.content.match(/import|require|from/g) || []).length;
      return { operation: 'sigmoid', input: new Float32Array([f.content.length / 1000, lines / 50, imports / 10, f.language.length]), options: { priority: 'normal', cacheTTLMs: 300000 } };
    }),
    options: { useCache: true, usePredictor: true },
  });
  return files.map((f, i) => {
    const data = results[i]?.data as number[] | null;
    const complexity = data ? Math.round((data[0] || 0.5) * 100) / 100 : 0.5;
    return { name: f.name, complexity, hasError: complexity > 0.8 };
  });
}
export async function estimateExecutionDuration(tokens: number, toolCalls: number): Promise<number> {
  const e = await getEngine();
  const result = await e.compute({ operation: 'sigmoid', input: new Float32Array([tokens / 1000, toolCalls / 10]), options: { priority: 'normal', cacheTTLMs: 300000 } });
  const data = result.data as number[] | null;
  return Math.round(((data ? data[0] || 0.5 : 0.5) * 10000));
}