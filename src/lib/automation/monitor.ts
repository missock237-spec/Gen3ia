/**
 * Automation Execution Monitor
 * 
 * Provides real-time tracking, observability, and metrics for automation runs
 * - Live execution status (pending → running → success/failed)
 * - Performance metrics (duration, throughput, error rates)
 * - Execution history and drill-down capability
 * - WebSocket support for real-time updates
 */

import { prisma } from '@/lib/prisma';
import { createLogger } from '@/lib/logger';
import { EventEmitter } from 'events';

const log = createLogger('automation-monitor');

export interface ExecutionMetrics {
  totalRuns: number;
  successCount: number;
  failureCount: number;
  averageDurationMs: number;
  p50DurationMs: number;
  p99DurationMs: number;
  successRate: number;
  lastRunAt?: Date;
  nextRunAt?: Date;
}

export interface ExecutionStep {
  stepId: string;
  blockId: string;
  blockLabel: string;
  blockType: string;
  status: 'pending' | 'running' | 'success' | 'failed' | 'skipped';
  startedAt: Date;
  completedAt?: Date;
  durationMs?: number;
  input?: Record<string, any>;
  output?: Record<string, any>;
  error?: { message: string; stack?: string };
}

export interface ExecutionState {
  executionId: string;
  automationId: string;
  userId: string;
  status: 'queued' | 'running' | 'success' | 'failed' | 'cancelled';
  startedAt: Date;
  completedAt?: Date;
  durationMs?: number;
  steps: ExecutionStep[];
  metrics: {
    blocksExecuted: number;
    blocksSkipped: number;
    blocksFailed: number;
  };
  failureReason?: string;
  result?: Record<string, any>;
}

class AutomationMonitor extends EventEmitter {
  private executionStates = new Map<string, ExecutionState>();
  private executionHistory = new Map<string, ExecutionState[]>();
  private metrics = new Map<string, ExecutionMetrics>();

  constructor() {
    super();
  }

  /**
   * Start tracking an execution
   */
  startExecution(
    executionId: string,
    automationId: string,
    userId: string,
  ): ExecutionState {
    const state: ExecutionState = {
      executionId,
      automationId,
      userId,
      status: 'queued',
      startedAt: new Date(),
      steps: [],
      metrics: {
        blocksExecuted: 0,
        blocksSkipped: 0,
        blocksFailed: 0,
      },
    };

    this.executionStates.set(executionId, state);

    log.info('Execution started', {
      executionId: executionId.slice(0, 8),
      automationId: automationId.slice(0, 8),
      userId: userId.slice(0, 8),
    });

    this.emit('execution:start', state);
    return state;
  }

  /**
   * Update execution status
   */
  updateStatus(executionId: string, status: ExecutionState['status']): void {
    const state = this.executionStates.get(executionId);
    if (!state) return;

    state.status = status;
    if (status === 'running' && !state.startedAt) {
      state.startedAt = new Date();
    }
    if (['success', 'failed', 'cancelled'].includes(status)) {
      state.completedAt = new Date();
      state.durationMs = state.completedAt.getTime() - state.startedAt.getTime();
    }

    this.emit('execution:status-changed', state);
  }

  /**
   * Record a step execution
   */
  recordStep(
    executionId: string,
    step: Omit<ExecutionStep, 'durationMs'>,
  ): void {
    const state = this.executionStates.get(executionId);
    if (!state) return;

    const stepWithDuration = {
      ...step,
      durationMs: step.completedAt 
        ? step.completedAt.getTime() - step.startedAt.getTime()
        : undefined,
    };

    state.steps.push(stepWithDuration);

    // Update metrics
    if (step.status === 'success') {
      state.metrics.blocksExecuted++;
    } else if (step.status === 'skipped') {
      state.metrics.blocksSkipped++;
    } else if (step.status === 'failed') {
      state.metrics.blocksFailed++;
    }

    log.debug('Step recorded', {
      executionId: executionId.slice(0, 8),
      blockId: step.blockId.slice(0, 8),
      status: step.status,
      duration: stepWithDuration.durationMs,
    });

    this.emit('execution:step', stepWithDuration);
  }

  /**
   * Complete execution with result
   */
  completeExecution(
    executionId: string,
    result?: Record<string, any>,
    error?: Error,
  ): ExecutionState {
    const state = this.executionStates.get(executionId);
    if (!state) throw new Error(`Execution ${executionId} not found`);

    const status = error ? 'failed' : 'success';
    this.updateStatus(executionId, status);

    state.result = result;
    if (error) {
      state.failureReason = error.message;
    }

    // Store in history
    if (!this.executionHistory.has(state.automationId)) {
      this.executionHistory.set(state.automationId, []);
    }
    this.executionHistory.get(state.automationId)!.push(state);

    // Update aggregated metrics
    this.updateMetrics(state.automationId);

    log.info('Execution completed', {
      executionId: executionId.slice(0, 8),
      status,
      duration: state.durationMs,
      blocksExecuted: state.metrics.blocksExecuted,
    });

    this.emit('execution:complete', state);
    return state;
  }

  /**
   * Get current execution state
   */
  getExecution(executionId: string): ExecutionState | undefined {
    return this.executionStates.get(executionId);
  }

  /**
   * Get all running executions for a user
   */
  getRunningExecutions(userId: string): ExecutionState[] {
    return Array.from(this.executionStates.values()).filter(
      state => state.userId === userId && state.status === 'running'
    );
  }

  /**
   * Get execution history for an automation
   */
  getExecutionHistory(
    automationId: string,
    limit: number = 50,
    offset: number = 0,
  ): ExecutionState[] {
    const history = this.executionHistory.get(automationId) || [];
    return history.reverse().slice(offset, offset + limit);
  }

  /**
   * Get metrics for an automation
   */
  getMetrics(automationId: string): ExecutionMetrics {
    return this.metrics.get(automationId) || {
      totalRuns: 0,
      successCount: 0,
      failureCount: 0,
      averageDurationMs: 0,
      p50DurationMs: 0,
      p99DurationMs: 0,
      successRate: 0,
    };
  }

  /**
   * Update aggregated metrics
   */
  private updateMetrics(automationId: string): void {
    const history = this.executionHistory.get(automationId) || [];
    if (history.length === 0) return;

    const successCount = history.filter(s => s.status === 'success').length;
    const failureCount = history.filter(s => s.status === 'failed').length;
    const durations = history
      .filter(s => s.durationMs)
      .map(s => s.durationMs!)
      .sort((a, b) => a - b);

    const metrics: ExecutionMetrics = {
      totalRuns: history.length,
      successCount,
      failureCount,
      averageDurationMs: durations.length > 0
        ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
        : 0,
      p50DurationMs: durations.length > 0 ? durations[Math.floor(durations.length * 0.5)] : 0,
      p99DurationMs: durations.length > 0 ? durations[Math.floor(durations.length * 0.99)] : 0,
      successRate: history.length > 0 ? successCount / history.length : 0,
      lastRunAt: history[history.length - 1]?.completedAt,
    };

    this.metrics.set(automationId, metrics);
    this.emit('metrics:updated', { automationId, metrics });
  }

  /**
   * Clean up old execution states (keep last 1000)
   */
  cleanup(): void {
    if (this.executionStates.size > 1000) {
      const sorted = Array.from(this.executionStates.values())
        .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
      
      const toDelete = sorted.slice(1000);
      toDelete.forEach(state => {
        this.executionStates.delete(state.executionId);
      });
    }
  }
}

export const automationMonitor = new AutomationMonitor();

// Cleanup old states every 5 minutes
setInterval(() => automationMonitor.cleanup(), 5 * 60 * 1000);
