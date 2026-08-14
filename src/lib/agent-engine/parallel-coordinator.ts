// ============================================================
// PARALLEL COORDINATOR — Orchestration parallèle multi-agents
// Exécute les tâches indépendantes en parallèle avec gestion
// des dépendances, circuit breaker et retry
// ============================================================

import type { MultiAgentPlan } from './planner';
import type { ExecutionStep, ExecutionContext } from './execution-loop';
import { executeAgentLoop } from './execution-loop';
import { ToolRegistry } from '@/lib/tools/registry';
import { circuitBreaker } from './circuit-breaker';
import { networkRetry, llmRetry } from './retry-strategy';
import { db } from '@/lib/db';

interface TaskNode {
  index: number;
  taskId: string;
  agentId: string;
  role: string;
  task: string;
  dependencies: string[];
  status: 'pending' | 'running' | 'completed' | 'failed' | 'retrying';
  result?: string;
  error?: string;
  steps?: ExecutionStep[];
  attempts: number;
  startedAt?: string;
  completedAt?: string;
}

export interface CoordinationResult {
  plan: MultiAgentPlan;
  taskResults: Record<string, TaskNode>;
  totalExecutionTimeMs: number;
  parallelGroups: number;
  successCount: number;
  failureCount: number;
  retriedCount: number;
  circuitBreaks: Array<{ key: string; state: string }>;
  summary: string;
}

export class ParallelCoordinator {
  private toolRegistry: ToolRegistry;
  private maxConcurrent: number;
  private taskTimeoutMs: number;

  constructor(toolRegistry: ToolRegistry, options?: { maxConcurrent?: number; taskTimeoutMs?: number }) {
    this.toolRegistry = toolRegistry;
    this.maxConcurrent = options?.maxConcurrent ?? 3;
    this.taskTimeoutMs = options?.taskTimeoutMs ?? 120000;
  }

  /**
   * Execute a multi-agent plan with parallel coordination
   */
  async executePlan(
    plan: MultiAgentPlan,
    userId: string,
    onProgress?: (update: { taskId: string; status: string; step?: ExecutionStep }) => void
  ): Promise<CoordinationResult> {
    const startTime = Date.now();
    plan.status = 'executing';

    // Build task graph
    const nodes: Map<string, TaskNode> = new Map();
    plan.agents.forEach((agent, index) => {
      const taskId = `task_${index}`;
      nodes.set(taskId, {
        index,
        taskId,
        agentId: agent.agentId,
        role: agent.role,
        task: agent.task,
        dependencies: agent.dependencies,
        status: 'pending',
        attempts: 0,
      });
    });

    let parallelGroups = 0;
    let retriedCount = 0;
    const circuitBreaks: Array<{ key: string; state: string }> = [];

    // Execute in waves — each wave contains tasks whose dependencies are all met
    while (true) {
      // Find tasks ready to execute
      const ready = Array.from(nodes.values()).filter(node => {
        if (node.status !== 'pending') return false;
        return node.dependencies.every(dep => {
          const depNode = nodes.get(dep);
          return depNode && (depNode.status === 'completed');
        });
      });

      if (ready.length === 0) {
        // Check if any tasks are still running
        const stillRunning = Array.from(nodes.values()).some(n => n.status === 'running' || n.status === 'retrying');
        if (!stillRunning) break;
        // Wait for running tasks
        await this.sleep(100);
        continue;
      }

      parallelGroups++;

      // Execute ready tasks in parallel (up to maxConcurrent)
      const batches = this.chunk(ready, this.maxConcurrent);
      for (const batch of batches) {
        await Promise.allSettled(batch.map(node => this.executeTaskNode(node, nodes, userId, plan, onProgress, () => retriedCount++, circuitBreaks)));
      }
    }

    // Build results
    const taskResults: Record<string, TaskNode> = {};
    let successCount = 0;
    let failureCount = 0;
    for (const [taskId, node] of nodes.entries()) {
      taskResults[taskId] = node;
      if (node.status === 'completed') successCount++;
      else if (node.status === 'failed') failureCount++;
      plan.results[taskId] = {
        agentId: node.agentId,
        result: node.result,
        error: node.error,
        success: node.status === 'completed',
        attempts: node.attempts,
        steps: node.steps?.length || 0,
      };
    }

    plan.status = failureCount === 0 ? 'completed' : (successCount > 0 ? 'completed' : 'failed');

    return {
      plan,
      taskResults,
      totalExecutionTimeMs: Date.now() - startTime,
      parallelGroups,
      successCount,
      failureCount,
      retriedCount,
      circuitBreaks,
      summary: this.generateSummary(successCount, failureCount, retriedCount, parallelGroups, Date.now() - startTime),
    };
  }

  /**
   * Execute a single task node with circuit breaker and retry
   */
  private async executeTaskNode(
    node: TaskNode,
    allNodes: Map<string, TaskNode>,
    userId: string,
    plan: MultiAgentPlan,
    onProgress?: (update: { taskId: string; status: string; step?: ExecutionStep }) => void,
    onRetry?: () => void,
    circuitBreaks?: Array<{ key: string; state: string }>
  ): Promise<void> {
    const circuitKey = `agent:${node.agentId}`;
    const cbCheck = circuitBreaker.canExecute(circuitKey);

    if (!cbCheck.allowed) {
      node.status = 'failed';
      node.error = `Circuit breaker ouvert (${cbCheck.state}), retry dans ${cbCheck.retryAfter}s`;
      if (circuitBreaks) circuitBreaks.push({ key: circuitKey, state: cbCheck.state });
      if (onProgress) onProgress({ taskId: node.taskId, status: 'failed' });
      return;
    }

    node.status = 'running';
    node.startedAt = new Date().toISOString();
    node.attempts++;
    if (onProgress) onProgress({ taskId: node.taskId, status: 'running' });

    // Build context from completed dependencies
    const depContext = node.dependencies
      .map(dep => allNodes.get(dep)?.result)
      .filter(Boolean)
      .join('\n\n');

    const fullTask = depContext
      ? `${node.task}\n\nContexte des tâches précédentes:\n${depContext}`
      : node.task;

    // Get agent config
    let agent: { id: string; name: string; type: string; config: string } | null = null;
    try {
      agent = await db.agent.findUnique({ where: { id: node.agentId } }) as any;
    } catch {
      agent = null;
    }

    if (!agent) {
      node.status = 'failed';
      node.error = `Agent ${node.agentId} introuvable`;
      circuitBreaker.recordFailure(circuitKey);
      if (onProgress) onProgress({ taskId: node.taskId, status: 'failed' });
      return;
    }

    // Build execution context
    let agentConfig: Record<string, unknown> = {};
    try { agentConfig = JSON.parse(agent.config); } catch { agentConfig = {}; }

    const allTools = this.toolRegistry.getToolNames();
    const toolMapping: Record<string, string[]> = {
      sales: ['web_search', 'database_query', 'calculator'],
      support: ['database_query', 'web_search'],
      marketing: ['web_search', 'calculator', 'database_query'],
      research: ['web_search', 'database_query', 'filesystem'],
      rh: ['database_query', 'calculator'],
      accounting: ['calculator', 'database_query'],
      custom: allTools,
    };

    const executionContext: ExecutionContext = {
      agentId: agent.id,
      agentName: agent.name,
      agentType: agent.type,
      agentConfig: { ...agentConfig, context: `Rôle: ${node.role}` },
      task: fullTask,
      userId,
      maxSteps: 8,
      maxRetries: 3,
      steps: [],
      status: 'running',
      memory: { shortTerm: [], longTermContext: '' },
      tools: toolMapping[agent.type] || allTools,
      guardrailsActive: true,
      startedAt: new Date().toISOString(),
      lastUpdatedAt: new Date().toISOString(),
      totalTokensUsed: 0,
      totalCost: 0,
    };

    // Execute with retry
    const retryResult = await networkRetry.execute(async () => {
      const steps = await executeAgentLoop(
        executionContext,
        this.toolRegistry,
        onProgress ? (step) => onProgress({ taskId: node.taskId, status: 'executing', step }) : undefined
      );
      const resultStep = steps.find(s => s.type === 'result');
      const result = resultStep?.content || steps.filter(s => s.type === 'observation').map(s => s.content).join('\n') || 'Tâche terminée';
      node.steps = steps;
      return result;
    }, (attempt, error, delay) => {
      node.status = 'retrying';
      if (onProgress) onProgress({ taskId: node.taskId, status: `retry ${attempt}` });
      if (onRetry) onRetry();
    });

    if (retryResult.success) {
      node.status = 'completed';
      node.result = retryResult.result;
      circuitBreaker.recordSuccess(circuitKey);
      if (onProgress) onProgress({ taskId: node.taskId, status: 'completed' });
    } else {
      node.status = 'failed';
      node.error = retryResult.error || 'Échec après retries';
      circuitBreaker.recordFailure(circuitKey);
      if (onProgress) onProgress({ taskId: node.taskId, status: 'failed' });
    }

    node.completedAt = new Date().toISOString();
  }

  private generateSummary(success: number, failure: number, retried: number, groups: number, timeMs: number): string {
    const parts: string[] = [];
    parts.push(`${success} tâche(s) réussie(s)`);
    if (failure > 0) parts.push(`${failure} échec(s)`);
    if (retried > 0) parts.push(`${retried} retry(s)`);
    parts.push(`${groups} groupe(s) parallèle(s)`);
    parts.push(`${(timeMs / 1000).toFixed(1)}s`);
    return parts.join(', ');
  }

  private chunk<T>(arr: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
      chunks.push(arr.slice(i, i + size));
    }
    return chunks;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
