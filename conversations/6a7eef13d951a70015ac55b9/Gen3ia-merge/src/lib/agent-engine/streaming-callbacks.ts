// ============================================================
// STREAMING CALLBACKS — Notifications en temps réel
// Publie les événements d'exécution via EventEmitter + webhooks
// ============================================================

import { EventEmitter } from 'events';
import type { ExecutionStep } from './execution-loop';

export type AgentEventType =
  | 'task.started'
  | 'task.thinking'
  | 'task.acting'
  | 'task.observation'
  | 'task.reflecting'
  | 'task.retry'
  | 'task.completed'
  | 'task.failed'
  | 'plan.created'
  | 'plan.progress'
  | 'plan.completed'
  | 'plan.failed'
  | 'circuit.opened'
  | 'circuit.recovered'
  | 'cost.warning';

export interface AgentEvent {
  type: AgentEventType;
  agentId: string;
  taskId?: string;
  step?: ExecutionStep;
  data?: Record<string, unknown>;
  timestamp: string;
}

export interface CostTracker {
  totalTokens: number;
  totalCost: number;
  byAgent: Record<string, { tokens: number; cost: number }>;
  budgetLimit: number;
  warningThreshold: number;
  alerted: boolean;
}

class AgentEventBus extends EventEmitter {
  private costTracker: CostTracker;
  private subscribers: Map<string, (event: AgentEvent) => void> = new Map();
  private eventHistory: AgentEvent[] = [];
  private maxHistory: number;

  constructor(maxHistory = 1000) {
    super();
    this.maxHistory = maxHistory;
    this.costTracker = {
      totalTokens: 0,
      totalCost: 0,
      byAgent: {},
      budgetLimit: 100000, // 100k tokens par défaut
      warningThreshold: 0.8,
      alerted: false,
    };
  }

  /**
   * Publish an agent event
   */
  publish(event: Omit<AgentEvent, 'timestamp'>): void {
    const fullEvent: AgentEvent = { ...event, timestamp: new Date().toISOString() };
    this.eventHistory.push(fullEvent);
    if (this.eventHistory.length > this.maxHistory) {
      this.eventHistory.shift();
    }
    this.emit(event.type, fullEvent);
    this.emit('*', fullEvent); // Wildcard listener

    // Notify specific subscribers
    const subscriber = this.subscribers.get(event.agentId);
    if (subscriber) subscriber(fullEvent);
  }

  /**
   * Subscribe to events for a specific agent
   */
  subscribe(agentId: string, callback: (event: AgentEvent) => void): () => void {
    this.subscribers.set(agentId, callback);
    return () => this.subscribers.delete(agentId);
  }

  /**
   * Track cost/tokens usage
   */
  trackCost(agentId: string, tokens: number, costPerToken = 0.00002): void {
    this.costTracker.totalTokens += tokens;
    this.costTracker.totalCost += tokens * costPerToken;

    if (!this.costTracker.byAgent[agentId]) {
      this.costTracker.byAgent[agentId] = { tokens: 0, cost: 0 };
    }
    this.costTracker.byAgent[agentId].tokens += tokens;
    this.costTracker.byAgent[agentId].cost += tokens * costPerToken;

    // Budget alert
    if (!this.costTracker.alerted && this.costTracker.totalTokens >= this.costTracker.budgetLimit * this.costTracker.warningThreshold) {
      this.costTracker.alerted = true;
      this.publish({
        type: 'cost.warning',
        agentId,
        data: {
          totalTokens: this.costTracker.totalTokens,
          budgetLimit: this.costTracker.budgetLimit,
          percentUsed: (this.costTracker.totalTokens / this.costTracker.budgetLimit) * 100,
        },
      });
    }
  }

  /**
   * Get cost report
   */
  getCostReport(): CostTracker {
    return { ...this.costTracker };
  }

  /**
   * Reset cost tracker
   */
  resetCost(): void {
    this.costTracker = {
      totalTokens: 0,
      totalCost: 0,
      byAgent: {},
      budgetLimit: this.costTracker.budgetLimit,
      warningThreshold: this.costTracker.warningThreshold,
      alerted: false,
    };
  }

  /**
   * Set budget limit
   */
  setBudget(limit: number): void {
    this.costTracker.budgetLimit = limit;
    this.costTracker.alerted = false; // Reset alert
  }

  /**
   * Get recent events
   */
  getRecentEvents(limit = 50, agentId?: string): AgentEvent[] {
    let events = [...this.eventHistory].reverse();
    if (agentId) events = events.filter(e => e.agentId === agentId);
    return events.slice(0, limit);
  }

  /**
   * Get event statistics
   */
  getStats(): {
    totalEvents: number;
    byType: Record<string, number>;
    byAgent: Record<string, number>;
  } {
    const byType: Record<string, number> = {};
    const byAgent: Record<string, number> = {};
    for (const event of this.eventHistory) {
      byType[event.type] = (byType[event.type] || 0) + 1;
      byAgent[event.agentId] = (byAgent[event.agentId] || 0) + 1;
    }
    return { totalEvents: this.eventHistory.length, byType, byAgent };
  }
}

// Global event bus
export const agentEventBus = new AgentEventBus();

/**
 * Create a step callback that publishes events
 */
export function createStepCallback(agentId: string, taskId?: string) {
  return (step: ExecutionStep) => {
    const typeMap: Record<string, AgentEventType> = {
      thought: 'task.thinking',
      action: 'task.acting',
      observation: 'task.observation',
      reflection: 'task.reflecting',
      error: 'task.failed',
      result: 'task.completed',
      retry: 'task.retry',
    };
    const type = typeMap[step.type] || 'task.thinking';
    agentEventBus.publish({ type, agentId, taskId, step });
  };
}
