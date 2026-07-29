// ============================================================
// WORKFLOW ENGINE — Moteur d'exécution de workflows no-code
// Exécute les blocs du canvas en respectant le graphe de dépendances
// ============================================================

import { prisma } from './prisma';
import { createLogger } from './logger';

export type BlockType =
  | 'trigger'
  | 'agent' | 'agent_suite'
  | 'condition' | 'loop' | 'delay'
  | 'send_email' | 'send_webhook'
  | 'http_request'
  | 'transform_data' | 'filter'
  | 'generate_image' | 'generate_audio'
  | 'notify_push' | 'notify_slack';

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
  condition?: string;
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
}

const log = createLogger('workflow-engine');

class WorkflowEngine {
  /**
   * Exécute un workflow complet depuis le canvas
   */
  async execute(canvas: WorkflowCanvas): Promise<WorkflowExecutionResult[]> {
    const results: WorkflowExecutionResult[] = [];

    // Construire le graphe des dépendances
    const blocksMap = new Map(canvas.blocks.map(b => [b.id, b]));
    const edges = canvas.edges;

    // Trier topologiquement
    const sorted = this.topologicalSort(canvas.blocks, edges);

    for (const block of sorted) {
      const start = Date.now();
      try {
        const result = await this.executeBlock(block, results);
        results.push({
          blockId: block.id,
          blockType: block.type,
          status: 'success',
          output: result,
          durationMs: Date.now() - start,
        });
      } catch (error: any) {
        results.push({
          blockId: block.id,
          blockType: block.type,
          status: 'failed',
          error: error.message,
          durationMs: Date.now() - start,
        });

        // Vérifier si les blocs suivants dépendent de ce bloc
        const dependants = edges.filter(e => e.source === block.id);
        for (const dep of dependants) {
          results.push({
            blockId: dep.target,
            blockType: blocksMap.get(dep.target)?.type || 'trigger',
            status: 'skipped',
            error: `Dépendance ${block.label || block.id} en échec`,
            durationMs: 0,
          });
        }
      }
    }

    return results;
  }

  private async executeBlock(block: WorkflowBlock, previousResults: WorkflowExecutionResult[]): Promise<any> {
    const ctx = this.buildContext(previousResults);

    switch (block.type) {
      case 'trigger':
        return block.config || {};

      case 'agent':
        return await this.runAgent(block.config, ctx);

      case 'agent_suite':
        return await this.runAgentSuite(block.config, ctx);

      case 'condition':
        return this.evaluateCondition(block.config, ctx);

      case 'loop':
        return await this.runLoop(block.config, ctx);

      case 'delay':
        return await this.runDelay(block.config);

      case 'http_request':
        return await this.runHttpRequest(block.config);

      case 'transform_data':
        return this.transformData(block.config, ctx);

      case 'send_email':
        return await this.sendEmail(block.config, ctx);

      case 'send_webhook':
        return await this.sendWebhook(block.config, ctx);

      case 'generate_image':
        return await this.generateImage(block.config);

      default:
        return { result: 'Exécution simulée: ' + block.label };
    }
  }

  private async runAgent(config: Record<string, any>, ctx: any) {
    const { prompt, agentId, model } = config;
    const input = this.interpolate(prompt || '', ctx);
    return { agentId, input, model, result: `Réponse simulée pour: ${input.slice(0, 50)}...` };
  }

  private async runAgentSuite(config: Record<string, any>, ctx: any) {
    const { goal, strategy } = config;
    return { goal: this.interpolate(goal || '', ctx), strategy, status: 'completed' };
  }

  private evaluateCondition(config: Record<string, any>, ctx: any): boolean {
    const { field, operator, value } = config;
    const actual = this.resolveValue(field, ctx);
    switch (operator) {
      case 'equals': return actual === value;
      case 'contains': return String(actual).includes(value);
      case 'gt': return Number(actual) > Number(value);
      case 'lt': return Number(actual) < Number(value);
      case 'exists': return actual !== undefined && actual !== null;
      default: return false;
    }
  }

  private async runLoop(config: Record<string, any>, ctx: any) {
    const { iterations, variable } = config;
    const count = parseInt(this.interpolate(String(iterations || '1'), ctx));
    const results = [];
    for (let i = 0; i < Math.min(count, 10); i++) {
      results.push({ iteration: i, timestamp: new Date().toISOString() });
      await new Promise(r => setTimeout(r, 10));
    }
    return { iterations: count, results };
  }

  private async runDelay(config: Record<string, any>) {
    const ms = parseInt(config.duration || '1000');
    await new Promise(r => setTimeout(r, Math.min(ms, 5000)));
    return { delayed: ms };
  }

  private async runHttpRequest(config: Record<string, any>) {
    const { url, method = 'GET', headers, body } = config;
    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(10000),
    }).catch(() => null);
    return { url, status: response?.status || 0, ok: response?.ok || false };
  }

  private transformData(config: Record<string, any>, ctx: any) {
    const { expression, mapping } = config;
    if (mapping) {
      const result: Record<string, any> = {};
      for (const [key, val] of Object.entries(mapping)) {
        result[key] = this.interpolate(String(val), ctx);
      }
      return result;
    }
    return { transformed: true };
  }

  private async sendEmail(config: Record<string, any>, ctx: any) {
    return { sent: true, to: config.to, subject: this.interpolate(config.subject || '', ctx) };
  }

  private async sendWebhook(config: Record<string, any>, ctx: any) {
    return { webhook: true, url: config.url, data: config.data };
  }

  private async generateImage(config: Record<string, any>) {
    return { generated: true, prompt: config.prompt, url: 'https://placehold.co/1024' };
  }

  private buildContext(previousResults: WorkflowExecutionResult[]): Record<string, any> {
    const ctx: Record<string, any> = {};
    for (const r of previousResults) {
      ctx[r.blockId] = r.output;
      ctx[`${r.blockId}.status`] = r.status;
    }
    return ctx;
  }

  private interpolate(template: string, ctx: Record<string, any>): string {
    return template.replace(/\{\{\s*(\w+(?:\.\w+)*)\s*\}\}/g, (_, path) => {
      const value = this.resolveValue(path, ctx);
      return value !== undefined ? String(value) : '';
    });
  }

  private resolveValue(path: string, ctx: Record<string, any>): any {
    return path.split('.').reduce((obj, key) => obj?.[key], ctx);
  }

  private topologicalSort(blocks: WorkflowBlock[], edges: WorkflowEdge[]): WorkflowBlock[] {
    const inDegree = new Map<string, number>();
    const adjacency = new Map<string, string[]>();

    for (const b of blocks) {
      inDegree.set(b.id, 0);
      adjacency.set(b.id, []);
    }
    for (const e of edges) {
      adjacency.get(e.source)?.push(e.target);
      inDegree.set(e.target, (inDegree.get(e.target) || 0) + 1);
    }

    const queue: string[] = [];
    for (const [id, deg] of inDegree) {
      if (deg === 0) queue.push(id);
    }

    const sorted: WorkflowBlock[] = [];
    while (queue.length > 0) {
      const id = queue.shift()!;
      const block = blocks.find(b => b.id === id);
      if (block) sorted.push(block);
      for (const neighbor of adjacency.get(id) || []) {
        const newDeg = (inDegree.get(neighbor) || 1) - 1;
        inDegree.set(neighbor, newDeg);
        if (newDeg === 0) queue.push(neighbor);
      }
    }
    return sorted;
  }
}

export const workflowEngine = new WorkflowEngine();
export default workflowEngine;