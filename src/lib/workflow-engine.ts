// ============================================================
// WORKFLOW ENGINE v2 — Moteur d'exécution avec branching
// Supporte : conditions, branches true/false, switch multi-cas,
// mapping de données, variables contextuelles
// ============================================================

import { prisma } from './prisma';
import { createLogger } from './logger';

export type BlockType =
  | 'trigger' | 'agent' | 'agent_suite'
  | 'condition' | 'switch' | 'loop' | 'delay'
  | 'send_email' | 'send_webhook' | 'http_request'
  | 'transform_data' | 'generate_image'
  | 'ai_classifier' | 'sentiment' | 'language_detect'
  | 'filter' | 'map' | 'aggregate';

export type EdgeCondition = 'true' | 'false' | 'default' | string;

export interface WorkflowBlock {
  id: string;
  type: BlockType;
  label: string;
  config: Record<string, any>;
  position: { x: number; y: number };
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  condition?: EdgeCondition;
}

export interface WorkflowCanvas {
  blocks: WorkflowBlock[];
  edges: WorkflowEdge[];
  viewport?: { x: number; y: number; zoom: number };
}

export interface WorkflowExecutionResult {
  blockId: string;
  blockType: BlockType;
  status: 'success' | 'failed' | 'skipped';
  output?: any;
  error?: string;
  durationMs: number;
  branch?: string;
}

const log = createLogger('workflow-engine');

export type Operator = 'equals' | 'not_equals' | 'contains' | 'not_contains'
  | 'gt' | 'gte' | 'lt' | 'lte'
  | 'exists' | 'is_empty' | 'regex'
  | 'starts_with' | 'ends_with'
  | 'in' | 'not_in';

export type AiClassifierType = 'sentiment' | 'topic' | 'language' | 'intent' | 'custom';

class WorkflowEngine {
  /**
   * Exécute un workflow avec branching complet
   */
  async execute(canvas: WorkflowCanvas): Promise<WorkflowExecutionResult[]> {
    const results: WorkflowExecutionResult[] = [];
    const executed = new Set<string>();
    const blocksMap = new Map(canvas.blocks.map(b => [b.id, b]));
    const outEdges = new Map<string, WorkflowEdge[]>();

    // Indexer les arêtes sortantes par source
    for (const e of canvas.edges) {
      if (!outEdges.has(e.source)) outEdges.set(e.source, []);
      outEdges.get(e.source)!.push(e);
    }

    // Trouver les blocs racines (sans arêtes entrantes)
    const targets = new Set(canvas.edges.map(e => e.target));
    const roots = canvas.blocks.filter(b => !targets.has(b.id));

    // Parcourir le graphe en suivant les conditions
    async function traverse(blockIds: string[]): Promise<void> {
      for (const blockId of blockIds) {
        if (executed.has(blockId)) continue;
        executed.add(blockId);

        const block = blocksMap.get(blockId);
        if (!block) continue;

        const start = Date.now();
        try {
          const ctx = buildContext();
          const output = await executeSingleBlock(block, ctx);
          results.push({
            blockId: block.id,
            blockType: block.type,
            status: 'success',
            output,
            durationMs: Date.now() - start,
          });

          // Déterminer les prochains blocs à exécuter selon les conditions
          const edges = outEdges.get(blockId) || [];
          const nextIds: string[] = [];

          if (edges.length === 0) {
            // Fin de branche
          } else if (isConditionBlock(block)) {
            // Branching conditionnel
            const resultValue = extractConditionResult(output);
            const matchedEdge = edges.find(e => e.condition === String(resultValue))
              || edges.find(e => e.condition === 'default')
              || edges[0];

            if (matchedEdge) {
              nextIds.push(matchedEdge.target);
              // Marquer les autres branches comme sautées
              for (const e of edges) {
                if (e.target !== matchedEdge.target && !executed.has(e.target)) {
                  results.push({
                    blockId: e.target,
                    blockType: blocksMap.get(e.target)?.type || 'condition',
                    status: 'skipped',
                    error: `Condition non satisfaite: branche '${e.condition || '?'}'`,
                    durationMs: 0,
                    branch: e.condition,
                  });
                }
              }
            }
          } else {
            // Passage normal — suivre toutes les branches
            nextIds.push(...edges.map(e => e.target));
          }

          if (nextIds.length > 0) {
            await traverse(nextIds);
          }
        } catch (error: any) {
          results.push({
            blockId: block.id,
            blockType: block.type,
            status: 'failed',
            error: error.message,
            durationMs: Date.now() - start,
          });

          // En cas d'erreur sur une condition, suivre la branche 'false' par défaut
          const edges = outEdges.get(blockId) || [];
          const fallbackEdge = edges.find(e => e.condition === 'false' || e.condition === 'default')
            || edges[edges.length - 1];
          if (fallbackEdge) await traverse([fallbackEdge.target]);
        }
      }
    }

    const buildContext = () => {
      const ctx: Record<string, any> = { workflow: { status: 'running', startedAt: new Date().toISOString() } };
      for (const r of results) {
        ctx[r.blockId] = r.output;
        ctx[r.blockId + '.status'] = r.status;
        ctx[r.blockId + '.duration'] = r.durationMs;
        if (r.blockType === 'condition') {
          ctx[r.blockId + '.result'] = extractConditionResult(r.output);
        }
      }
      return ctx;
    };

    const executeSingleBlock = async (block: WorkflowBlock, ctx: Record<string, any>): Promise<any> => {
      switch (block.type) {
        case 'trigger': return block.config.data || block.config || {};
        case 'agent': return runAgent(block.config, ctx);
        case 'agent_suite': return runAgentSuite(block.config, ctx);
        case 'condition': return evaluateCondition(block.config, ctx);
        case 'switch': return evaluateSwitch(block.config, ctx);
        case 'ai_classifier': return classifyWithAI(block.config, ctx);
        case 'sentiment': return analyzeSentiment(block.config, ctx);
        case 'language_detect': return detectLanguage(block.config, ctx);
        case 'loop': return runLoop(block.config, ctx);
        case 'delay': return runDelay(block.config);
        case 'http_request': return runHttpRequest(block.config);
        case 'transform_data': return transformData(block.config, ctx);
        case 'filter': return filterData(block.config, ctx);
        case 'map': return mapData(block.config, ctx);
        case 'aggregate': return aggregateData(block.config, ctx);
        case 'send_email': return sendEmail(block.config, ctx);
        case 'send_webhook': return sendWebhook(block.config, ctx);
        case 'generate_image': return generateImage(block.config);
        default: return { result: 'Exécuté: ' + block.label };
      }
    };

    await traverse(roots.map(b => b.id));
    return results;
  }
}

// ============================================================
// CONDITIONS & BRANCHING
// ============================================================

function isConditionBlock(block: WorkflowBlock): boolean {
  return ['condition', 'switch', 'ai_classifier', 'sentiment', 'language_detect'].includes(block.type);
}

/**
 * Extrait le résultat booléen ou textuel d'un bloc de condition
 */
function extractConditionResult(output: any): boolean | string {
  if (typeof output === 'boolean') return output;
  if (typeof output === 'object' && output !== null) {
    if ('result' in output && typeof output.result === 'boolean') return output.result;
    if ('value' in output) return output.value;
    if ('sentiment' in output) return output.sentiment;
    if ('label' in output) return output.label;
    if ('match' in output) return output.match;
  }
  return 'default';
}

function evaluateCondition(config: Record<string, any>, ctx: Record<string, any>): boolean {
  const { field, operator, value } = config;
  const actual = resolveValue(field, ctx);

  switch (operator as Operator) {
    case 'equals': return actual == value;
    case 'not_equals': return actual != value;
    case 'contains': return String(actual).includes(String(value));
    case 'not_contains': return !String(actual).includes(String(value));
    case 'gt': return Number(actual) > Number(value);
    case 'gte': return Number(actual) >= Number(value);
    case 'lt': return Number(actual) < Number(value);
    case 'lte': return Number(actual) <= Number(value);
    case 'exists': return actual !== undefined && actual !== null && actual !== '';
    case 'is_empty': return actual === undefined || actual === null || actual === '';
    case 'regex': return new RegExp(String(value)).test(String(actual));
    case 'starts_with': return String(actual).startsWith(String(value));
    case 'ends_with': return String(actual).endsWith(String(value));
    case 'in': return (Array.isArray(value) ? value : String(value).split(',')).includes(String(actual));
    case 'not_in': return !(Array.isArray(value) ? value : String(value).split(',')).includes(String(actual));
    default: return false;
  }
}

function evaluateSwitch(config: Record<string, any>, ctx: Record<string, any>): { match: string; value: any } {
  const { field, cases } = config;
  const actual = resolveValue(field, ctx);
  const strActual = String(actual);

  for (const c of cases || []) {
    if (c.value === strActual || c.value === actual) {
      return { match: c.label || c.value, value: actual };
    }
  }
  return { match: 'default', value: actual };
}

// ============================================================
// AI CLASSIFIERS
// ============================================================

async function classifyWithAI(config: Record<string, any>, ctx: Record<string, any>): Promise<{ label: string; confidence: number }> {
  const { _prompt, categories, _model, input } = config;
  const text = interpolate(input || '', ctx);
  const cats = (categories || 'Positif,Négatif,Neutre').split(',').map((c: string) => c.trim());

  // Simulation AI — retourne la catégorie la plus probable
  const idx = Math.floor(Math.random() * cats.length);
  return { label: cats[idx], confidence: 0.5 + Math.random() * 0.4 };
}

async function analyzeSentiment(config: Record<string, any>, ctx: Record<string, any>): Promise<{ sentiment: string; score: number }> {
  const { input, field } = config;
  const text = field ? String(resolveValue(field, ctx) || '') : interpolate(input || '', ctx);

  // Simulation sentiment
  const positiveWords = ['bon', 'excellent', 'super', 'merci', 'bravo', '👍', '✅', 'génial'];
  const negativeWords = ['mauvais', 'problème', 'bug', 'erreur', 'pas content', '👎', '❌', 'déçu'];
  const lower = text.toLowerCase();

  let score = 0;
  for (const w of positiveWords) if (lower.includes(w)) score += 0.2;
  for (const w of negativeWords) if (lower.includes(w)) score -= 0.25;

  if (score > 0.2) return { sentiment: 'positif', score };
  if (score < -0.2) return { sentiment: 'négatif', score };
  return { sentiment: 'neutre', score };
}

async function detectLanguage(config: Record<string, any>, ctx: Record<string, any>): Promise<{ language: string; iso: string; confidence: number }> {
  const text = interpolate(config.input || '', ctx);
  // Simulation
  const langMap: Record<string, string> = { fr: 'français', en: 'anglais', es: 'espagnol', de: 'allemand' };
  const iso = 'fr';
  return { language: langMap[iso] || 'inconnu', iso, confidence: 0.85 };
}

// ============================================================
// DATA OPERATIONS
// ============================================================

function filterData(config: Record<string, any>, ctx: Record<string, any>): any[] {
  const { source, field, operator, value } = config;
  const data = resolveValue(source || 'data', ctx);
  if (!Array.isArray(data)) return [];
  return data.filter((item: any) => {
    const actual = field ? resolveValue(field, item) : item;
    return evaluateCondition({ field: '', operator, value }, { '': actual });
  });
}

function mapData(config: Record<string, any>, ctx: Record<string, any>): any[] {
  const { source, mapping } = config;
  const data = resolveValue(source || 'data', ctx);
  if (!Array.isArray(data)) return [];
  return data.map((item: any) => {
    const result: Record<string, any> = {};
    for (const [key, expr] of Object.entries(mapping || {})) {
      result[key] = interpolate(String(expr), { ...ctx, item });
    }
    return result;
  });
}

function aggregateData(config: Record<string, any>, ctx: Record<string, any>): Record<string, any> {
  const { source, operation, field } = config;
  const data = resolveValue(source || 'data', ctx);
  if (!Array.isArray(data) || data.length === 0) return { count: 0 };
  const values = field ? data.map((d: any) => Number(resolveValue(field, d))) : data.map(Number);
  const nums = values.filter((n: number) => !isNaN(n));

  switch (operation) {
    case 'count': return { count: data.length };
    case 'sum': return { sum: nums.reduce((a: number, b: number) => a + b, 0), count: nums.length };
    case 'avg': return { avg: nums.reduce((a: number, b: number) => a + b, 0) / nums.length, count: nums.length };
    case 'min': return { min: Math.min(...nums), count: nums.length };
    case 'max': return { max: Math.max(...nums), count: nums.length };
    default: return { count: data.length };
  }
}

// ============================================================
// EXECUTION HELPERS
// ============================================================

async function runAgent(config: Record<string, any>, ctx: Record<string, any>) {
  const { prompt, agentId, model } = config;
  return { agentId, input: interpolate(prompt || '', ctx), model, result: `Réponse simulée pour: ${config.prompt?.slice(0, 50) || ''}` };
}

async function runAgentSuite(config: Record<string, any>, ctx: Record<string, any>) {
  return { goal: interpolate(config.goal || '', ctx), strategy: config.strategy || 'sequential', status: 'completed' };
}

async function runLoop(config: Record<string, any>, ctx: Record<string, any>) {
  const count = Math.min(parseInt(interpolate(String(config.iterations || '1'), ctx)), 10);
  const items: any[] = [];
  for (let i = 0; i < count; i++) items.push({ iteration: i, timestamp: new Date().toISOString() });
  return { iterations: count, items };
}

async function runDelay(config: Record<string, any>) {
  const ms = Math.min(parseInt(config.duration || '1000'), 5000);
  await new Promise(r => setTimeout(r, ms));
  return { delayed: ms };
}

async function runHttpRequest(config: Record<string, any>) {
  const { url, method = 'GET', headers, body } = config;
  const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(10000) }).catch(() => null);
  return { url, status: response?.status || 0, ok: response?.ok || false, data: response ? await response.json().catch(() => null) : null };
}

function transformData(config: Record<string, any>, ctx: Record<string, any>) {
  if (config.mapping) {
    const result: Record<string, any> = {};
    for (const [key, val] of Object.entries(config.mapping)) result[key] = interpolate(String(val), ctx);
    return result;
  }
  return { transformed: true, value: interpolate(config.expression || '', ctx) };
}

async function sendEmail(config: Record<string, any>, ctx: Record<string, any>) {
  return { sent: true, to: config.to, subject: interpolate(config.subject || '', ctx), body: interpolate(config.body || '', ctx) };
}

async function sendWebhook(config: Record<string, any>, ctx: Record<string, any>) {
  return { webhook: true, url: config.url, data: config.data || ctx };
}

async function generateImage(config: Record<string, any>) {
  return { generated: true, prompt: config.prompt, url: 'https://placehold.co/1024' };
}

function interpolate(template: string, ctx: Record<string, any>): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, path) => {
    const value = resolveValue(path, ctx);
    return value !== undefined ? String(value) : '';
  });
}

function resolveValue(path: string, ctx: Record<string, any>): any {
  return path.split('.').reduce((obj, key) => obj?.[key], ctx);
}

export const workflowEngine = new WorkflowEngine();
export default workflowEngine;
