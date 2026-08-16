// ============================================================
// PARALLEL COORDINATOR — Orchestration parallèle multi-agents
// Exécute les tâches indépendantes en parallèle avec gestion
// des dépendances, circuit breaker et retry
//
// Error handling robuste:
// - Deadlock detection (dependencies circulaires ou bloquées)
// - Timeout par tâche et global
// - Cascade de dépendances échouées (skip automatique)
// - Validation du plan (agents, structure, circularité)
// - Graceful degradation (skip & continue)
// - Error recovery (fallback task)
// ============================================================

import type { MultiAgentPlan } from './planner';
import type { ExecutionStep, ExecutionContext } from './execution-loop';
import { executeAgentLoop } from './execution-loop';
import { ToolRegistry } from '@/lib/tools/registry';
import { circuitBreaker } from './circuit-breaker';
import { networkRetry } from './retry-strategy';
import { db } from '@/lib/db';

// ============================================================
// Types
// ============================================================

export interface TaskNode {
  index: number;
  taskId: string;
  agentId: string;
  role: string;
  task: string;
  dependencies: string[];
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped' | 'retrying' | 'timeout';
  result?: string;
  error?: string;
  errorType?: TaskErrorType;
  steps?: ExecutionStep[];
  attempts: number;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
}

export type TaskErrorType =
  | 'circuit_breaker_open'
  | 'agent_not_found'
  | 'db_error'
  | 'execution_error'
  | 'timeout'
  | 'dependency_failed'
  | 'invalid_plan'
  | 'unknown';

export interface CoordinationResult {
  plan: MultiAgentPlan;
  taskResults: Record<string, TaskNode>;
  totalExecutionTimeMs: number;
  parallelGroups: number;
  successCount: number;
  failureCount: number;
  skippedCount: number;
  timeoutCount: number;
  retriedCount: number;
  circuitBreaks: Array<{ key: string; state: string; taskId: string }>;
  errors: Array<{ taskId: string; error: string; type: TaskErrorType; recoverable: boolean }>;
  summary: string;
  warnings: string[];
  deadlocked: boolean;
  partialSuccess: boolean;
}

export interface CoordinatorOptions {
  maxConcurrent?: number;
  taskTimeoutMs?: number;
  planTimeoutMs?: number;
  maxIterations?: number;
  skipFailedDependencies?: boolean;  // Skip tasks whose deps failed (default: true)
  maxRetriesPerTask?: number;
}

// ============================================================
// Errors
// ============================================================

export class CoordinatorError extends Error {
  constructor(
    message: string,
    public readonly code: TaskErrorType,
    public readonly taskId?: string,
    public readonly recoverable: boolean = false,
  ) {
    super(message);
    this.name = 'CoordinatorError';
  }
}

export class PlanValidationError extends CoordinatorError {
  constructor(message: string) {
    super(message, 'invalid_plan', undefined, false);
    this.name = 'PlanValidationError';
  }
}

export class TaskTimeoutError extends CoordinatorError {
  constructor(taskId: string, timeoutMs: number) {
    super(`Tâche ${taskId} timeout après ${timeoutMs}ms`, 'timeout', taskId, true);
    this.name = 'TaskTimeoutError';
  }
}

// ============================================================
// Parallel Coordinator
// ============================================================

export class ParallelCoordinator {
  private toolRegistry: ToolRegistry;
  private maxConcurrent: number;
  private taskTimeoutMs: number;
  private planTimeoutMs: number;
  private maxIterations: number;
  private skipFailedDependencies: boolean;
  private maxRetriesPerTask: number;

  constructor(toolRegistry: ToolRegistry, options?: CoordinatorOptions) {
    this.toolRegistry = toolRegistry;
    this.maxConcurrent = options?.maxConcurrent ?? 3;
    this.taskTimeoutMs = options?.taskTimeoutMs ?? 120000;
    this.planTimeoutMs = options?.planTimeoutMs ?? 600000; // 10 min global
    this.maxIterations = options?.maxIterations ?? 100;
    this.skipFailedDependencies = options?.skipFailedDependencies ?? true;
    this.maxRetriesPerTask = options?.maxRetriesPerTask ?? 3;
  }

  /**
   * Validate a plan before execution
   */
  private validatePlan(plan: MultiAgentPlan): void {
    if (!plan) throw new PlanValidationError('Plan manquant');
    if (!plan.agents || plan.agents.length === 0) throw new PlanValidationError('Plan vide — aucun agent');
    if (plan.agents.length > 50) throw new PlanValidationError('Plan trop grand — max 50 agents');

    // Check for duplicate agent IDs
    const agentIds = plan.agents.map(a => a.agentId);
    const duplicates = agentIds.filter((id, i) => agentIds.indexOf(id) !== i);
    if (duplicates.length > 0) {
      throw new PlanValidationError(`Agents dupliqués: ${duplicates.join(', ')}`);
    }

    // Check for circular dependencies
    const taskIds = plan.agents.map((_, i) => `task_${i}`);
    for (let i = 0; i < plan.agents.length; i++) {
      const deps = plan.agents[i].dependencies;
      if (!deps) continue;
      // Check each dependency exists
      for (const dep of deps) {
        if (!taskIds.includes(dep)) {
          throw new PlanValidationError(`Tâche ${i}: dépendance inconnue "${dep}"`);
        }
      }
      // Check for self-dependency
      const selfId = `task_${i}`;
      if (deps.includes(selfId)) {
        throw new PlanValidationError(`Tâche ${i}: auto-dépendance circulaire`);
      }
    }

    // Detect cycles via DFS
    const visited = new Set<string>();
    const inStack = new Set<string>();
    const hasCycle = (taskId: string): boolean => {
      visited.add(taskId);
      inStack.add(taskId);
      const idx = parseInt(taskId.split('_')[1]);
      const deps = plan.agents[idx]?.dependencies || [];
      for (const dep of deps) {
        if (!visited.has(dep)) {
          if (hasCycle(dep)) return true;
        } else if (inStack.has(dep)) {
          return true;
        }
      }
      inStack.delete(taskId);
      return false;
    };

    for (const tid of taskIds) {
      if (!visited.has(tid) && hasCycle(tid)) {
        throw new PlanValidationError(`Dépendance circulaire détectée impliquant ${tid}`);
      }
    }
  }

  /**
   * Execute a multi-agent plan with parallel coordination
   */
  async executePlan(
    plan: MultiAgentPlan,
    userId: string,
    onProgress?: (update: { taskId: string; status: string; step?: ExecutionStep }) => void,
  ): Promise<CoordinationResult> {
    const startTime = Date.now();
    const warnings: string[] = [];
    const errors: Array<{ taskId: string; error: string; type: TaskErrorType; recoverable: boolean }> = [];

    // 1. Validate plan
    try {
      this.validatePlan(plan);
    } catch (err) {
      if (err instanceof PlanValidationError) {
        errors.push({ taskId: 'plan', error: err.message, type: 'invalid_plan', recoverable: false });
        return this.buildResult(plan, {}, startTime, 0, 0, 0, 0, 0, 0, [], errors, warnings, false, false);
      }
      throw err;
    }

    plan.status = 'executing';

    // 2. Build task graph
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

    // 3. Pre-load all agents to fail fast
    const agentCache: Map<string, { id: string; name: string; type: string; config: string } | null> = new Map();
    const uniqueAgentIds = [...new Set(plan.agents.map(a => a.agentId))];
    await Promise.allSettled(
      uniqueAgentIds.map(async (agentId) => {
        try {
          const agent = await db.agent.findUnique({ where: { id: agentId } }) as any;
          agentCache.set(agentId, agent || null);
          if (!agent) {
            warnings.push(`Agent ${agentId} introuvable en base`);
          }
        } catch (dbErr) {
          agentCache.set(agentId, null);
          warnings.push(`Erreur DB pour agent ${agentId}: ${dbErr instanceof Error ? dbErr.message : 'inconnue'}`);
        }
      }),
    );

    let parallelGroups = 0;
    let retriedCount = 0;
    const circuitBreaks: Array<{ key: string; state: string; taskId: string }> = [];
    let iteration = 0;
    let deadlocked = false;

    // 4. Execute in waves
    while (iteration < this.maxIterations) {
      iteration++;

      // Global timeout check
      if (Date.now() - startTime > this.planTimeoutMs) {
        warnings.push(`Timeout global atteint après ${this.planTimeoutMs}ms — tâches restantes marquées timeout`);
        for (const node of nodes.values()) {
          if (node.status === 'pending' || node.status === 'running' || node.status === 'retrying') {
            node.status = 'timeout';
            node.error = 'Timeout global du plan';
            node.errorType = 'timeout';
            errors.push({ taskId: node.taskId, error: 'Timeout global', type: 'timeout', recoverable: true });
          }
        }
        break;
      }

      // Find tasks ready to execute
      const ready: TaskNode[] = [];
      const blockedByFailed: TaskNode[] = [];

      for (const node of nodes.values()) {
        if (node.status !== 'pending') continue;

        let allDepsComplete = true;
        let anyDepFailed = false;

        for (const dep of node.dependencies) {
          const depNode = nodes.get(dep);
          if (!depNode) {
            // Unknown dependency — treat as failed
            anyDepFailed = true;
            continue;
          }
          if (depNode.status !== 'completed') {
            allDepsComplete = false;
            if (depNode.status === 'failed' || depNode.status === 'skipped' || depNode.status === 'timeout') {
              anyDepFailed = true;
            }
          }
        }

        if (allDepsComplete) {
          ready.push(node);
        } else if (anyDepFailed && this.skipFailedDependencies) {
          blockedByFailed.push(node);
        }
      }

      // Skip tasks blocked by failed dependencies
      for (const node of blockedByFailed) {
        const failedDeps = node.dependencies
          .filter(dep => {
            const dn = nodes.get(dep);
            return dn && (dn.status === 'failed' || dn.status === 'skipped' || dn.status === 'timeout');
          })
          .map(dep => nodes.get(dep)?.taskId);

        node.status = 'skipped';
        node.error = `Dépendances échouées: ${failedDeps.join(', ')}`;
        node.errorType = 'dependency_failed';
        errors.push({
          taskId: node.taskId,
          error: node.error,
          type: 'dependency_failed',
          recoverable: false,
        });
        if (onProgress) onProgress({ taskId: node.taskId, status: 'skipped' });
      }

      if (ready.length === 0) {
        // Check if any tasks are still running
        const stillRunning = Array.from(nodes.values()).some(
          n => n.status === 'running' || n.status === 'retrying',
        );

        if (!stillRunning) {
          // Check for deadlock: pending tasks with all deps non-failed but not complete
          const stuckPending = Array.from(nodes.values()).filter(n => n.status === 'pending');
          if (stuckPending.length > 0) {
            deadlocked = true;
            warnings.push(`Deadlock détecté — ${stuckPending.length} tâche(s) en attente impossible`);
            for (const node of stuckPending) {
              node.status = 'failed';
              node.error = 'Deadlock — dépendances jamais satisfaites';
              node.errorType = 'dependency_failed';
              errors.push({
                taskId: node.taskId,
                error: node.error,
                type: 'dependency_failed',
                recoverable: false,
              });
            }
          }
          break;
        }

        // Wait for running tasks
        await this.sleep(100);
        continue;
      }

      parallelGroups++;

      // Execute ready tasks in parallel batches
      const batches = this.chunk(ready, this.maxConcurrent);
      for (const batch of batches) {
        const results = await Promise.allSettled(
          batch.map(node =>
            this.executeTaskNode(
              node,
              nodes,
              userId,
              plan,
              agentCache,
              onProgress,
              () => retriedCount++,
              circuitBreaks,
            ),
          ),
        );

        // Log any unhandled rejections (shouldn't happen, but safety net)
        for (let i = 0; i < results.length; i++) {
          const result = results[i];
          if (result.status === 'rejected') {
            const node = batch[i];
            if (node.status !== 'failed' && node.status !== 'completed') {
              node.status = 'failed';
              node.error = `Erreur non gérée: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`;
              node.errorType = 'unknown';
              node.completedAt = new Date().toISOString();
              errors.push({
                taskId: node.taskId,
                error: node.error,
                type: 'unknown',
                recoverable: false,
              });
            }
          }
        }
      }
    }

    // 5. Max iterations exceeded
    if (iteration >= this.maxIterations) {
      warnings.push(`Max iterations (${this.maxIterations}) atteint — tâches restantes marquées échouées`);
      for (const node of nodes.values()) {
        if (node.status === 'pending' || node.status === 'running' || node.status === 'retrying') {
          node.status = 'failed';
          node.error = 'Max iterations atteint';
          node.errorType = 'unknown';
          errors.push({ taskId: node.taskId, error: node.error, type: 'unknown', recoverable: true });
        }
      }
    }

    // 6. Build results
    return this.assembleResult(plan, nodes, startTime, parallelGroups, retriedCount, circuitBreaks, errors, warnings, deadlocked);
  }

  /**
   * Execute a single task node with full error handling
   */
  private async executeTaskNode(
    node: TaskNode,
    allNodes: Map<string, TaskNode>,
    userId: string,
    _plan: MultiAgentPlan,
    agentCache: Map<string, { id: string; name: string; type: string; config: string } | null>,
    onProgress?: (update: { taskId: string; status: string; step?: ExecutionStep }) => void,
    onRetry?: () => void,
    circuitBreaks?: Array<{ key: string; state: string; taskId: string }>,
  ): Promise<void> {
    const taskStartTime = Date.now();
    const circuitKey = `agent:${node.agentId}`;

    // 1. Circuit breaker check
    const cbCheck = circuitBreaker.canExecute(circuitKey);
    if (!cbCheck.allowed) {
      node.status = 'failed';
      node.error = `Circuit breaker ouvert (${cbCheck.state}), retry dans ${cbCheck.retryAfter}s`;
      node.errorType = 'circuit_breaker_open';
      node.completedAt = new Date().toISOString();
      node.durationMs = Date.now() - taskStartTime;
      if (circuitBreaks) circuitBreaks.push({ key: circuitKey, state: cbCheck.state!, taskId: node.taskId });
      if (onProgress) onProgress({ taskId: node.taskId, status: 'failed' });
      return;
    }

    node.status = 'running';
    node.startedAt = new Date().toISOString();
    node.attempts++;
    if (onProgress) onProgress({ taskId: node.taskId, status: 'running' });

    // 2. Get agent from cache
    const agent = agentCache.get(node.agentId);
    if (!agent) {
      node.status = 'failed';
      node.error = `Agent ${node.agentId} introuvable ou erreur DB`;
      node.errorType = 'agent_not_found';
      node.completedAt = new Date().toISOString();
      node.durationMs = Date.now() - taskStartTime;
      circuitBreaker.recordFailure(circuitKey);
      if (onProgress) onProgress({ taskId: node.taskId, status: 'failed' });
      return;
    }

    // 3. Build context from completed dependencies
    try {
      const depContext = node.dependencies
        .map(dep => allNodes.get(dep)?.result)
        .filter((r): r is string => typeof r === 'string' && r.length > 0)
        .join('\n\n');

      const fullTask = depContext
        ? `${node.task}\n\nContexte des tâches précédentes:\n${depContext}`
        : node.task;

      // 4. Parse agent config safely
      let agentConfig: Record<string, unknown> = {};
      try {
        agentConfig = JSON.parse(agent.config);
      } catch {
        agentConfig = {};
      }

      // 5. Build execution context
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
        maxRetries: this.maxRetriesPerTask,
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

      // 6. Execute with timeout + retry
      const retryResult = await networkRetry.execute(async () => {
        // Wrap in a timeout promise
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new TaskTimeoutError(node.taskId, this.taskTimeoutMs)), this.taskTimeoutMs);
        });

        const executionPromise = executeAgentLoop(
          executionContext,
          this.toolRegistry,
          onProgress ? (step) => onProgress({ taskId: node.taskId, status: 'executing', step }) : undefined,
        );

        const steps = await Promise.race([executionPromise, timeoutPromise]);

        const resultStep = steps.find(s => s.type === 'result');
        const result =
          resultStep?.content ||
          steps.filter(s => s.type === 'observation').map(s => s.content).join('\n') ||
          'Tâche terminée';
        node.steps = steps;
        return result;
      }, (attempt, _error, _delay) => {
        node.status = 'retrying';
        if (onProgress) onProgress({ taskId: node.taskId, status: `retry ${attempt}` });
        if (onRetry) onRetry();
      });

      // 7. Handle result
      if (retryResult.success) {
        node.status = 'completed';
        node.result = retryResult.result;
        circuitBreaker.recordSuccess(circuitKey);
        if (onProgress) onProgress({ taskId: node.taskId, status: 'completed' });
      } else {
        node.status = 'failed';
        node.error = retryResult.error || 'Échec après retries';
        node.errorType = retryResult.error?.toLowerCase().includes('timeout')
          ? 'timeout'
          : 'execution_error';
        circuitBreaker.recordFailure(circuitKey);
        if (onProgress) onProgress({ taskId: node.taskId, status: 'failed' });
      }
    } catch (err) {
      // Catch-all for any uncaught errors during task execution
      node.status = 'failed';
      node.error = err instanceof Error ? err.message : String(err);
      node.errorType = err instanceof CoordinatorError ? err.code : 'unknown';
      circuitBreaker.recordFailure(circuitKey);
      if (onProgress) onProgress({ taskId: node.taskId, status: 'failed' });
    } finally {
      node.completedAt = new Date().toISOString();
      node.durationMs = Date.now() - taskStartTime;
    }
  }

  /**
   * Assemble final coordination result
   */
  private assembleResult(
    plan: MultiAgentPlan,
    nodes: Map<string, TaskNode>,
    startTime: number,
    parallelGroups: number,
    retriedCount: number,
    circuitBreaks: Array<{ key: string; state: string; taskId: string }>,
    errors: Array<{ taskId: string; error: string; type: TaskErrorType; recoverable: boolean }>,
    warnings: string[],
    deadlocked: boolean,
  ): CoordinationResult {
    const taskResults: Record<string, TaskNode> = {};
    let successCount = 0;
    let failureCount = 0;
    let skippedCount = 0;
    let timeoutCount = 0;

    for (const [taskId, node] of nodes.entries()) {
      taskResults[taskId] = node;
      switch (node.status) {
        case 'completed': successCount++; break;
        case 'failed': failureCount++; break;
        case 'skipped': skippedCount++; break;
        case 'timeout': timeoutCount++; failureCount++; break;
      }
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
      skippedCount,
      timeoutCount,
      retriedCount,
      circuitBreaks,
      errors,
      summary: this.generateSummary(successCount, failureCount, skippedCount, timeoutCount, retriedCount, parallelGroups, Date.now() - startTime),
      warnings,
      deadlocked,
      partialSuccess: successCount > 0 && failureCount > 0,
    };
  }

  /**
   * Build a minimal result for early-exit error cases
   */
  private buildResult(
    plan: MultiAgentPlan,
    taskResults: Record<string, TaskNode>,
    startTime: number,
    parallelGroups: number,
    successCount: number,
    failureCount: number,
    skippedCount: number,
    timeoutCount: number,
    retriedCount: number,
    circuitBreaks: Array<{ key: string; state: string; taskId: string }>,
    errors: Array<{ taskId: string; error: string; type: TaskErrorType; recoverable: boolean }>,
    warnings: string[],
    deadlocked: boolean,
    partialSuccess: boolean,
  ): CoordinationResult {
    plan.status = 'failed';
    return {
      plan,
      taskResults,
      totalExecutionTimeMs: Date.now() - startTime,
      parallelGroups,
      successCount,
      failureCount,
      skippedCount,
      timeoutCount,
      retriedCount,
      circuitBreaks,
      errors,
      summary: this.generateSummary(successCount, failureCount, skippedCount, timeoutCount, retriedCount, parallelGroups, Date.now() - startTime),
      warnings,
      deadlocked,
      partialSuccess,
    };
  }

  private generateSummary(
    success: number,
    failure: number,
    skipped: number,
    timeout: number,
    retried: number,
    groups: number,
    timeMs: number,
  ): string {
    const parts: string[] = [];
    parts.push(`${success} réussie(s)`);
    if (failure > 0) parts.push(`${failure} échec(s)`);
    if (skipped > 0) parts.push(`${skipped} ignorée(s)`);
    if (timeout > 0) parts.push(`${timeout} timeout(s)`);
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
