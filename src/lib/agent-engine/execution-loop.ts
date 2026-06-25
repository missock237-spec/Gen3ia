import { createAIRouter } from '@/lib/ai-router';
import { db } from '@/lib/db';
import { createLogger } from '@/lib/logger';
import { SkillsRegistry } from './skills-system';
import { deductCredits } from '@/lib/billing/credits';
import { ToolRegistry } from '@/lib/tools/registry';

const log = createLogger('autonomous-loop');

export interface ExecutionStep {
  id: string;
  type: 'thought' | 'action' | 'observation' | 'reflection' | 'plan' | 'error' | 'result' | 'retry' | 'correction';
  content: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolOutput?: unknown;
  timestamp: string;
  duration?: number;
  confidence?: number;
  reflectionScore?: number;
  needsRetry?: boolean;
  retryCount?: number;
  alternativeApproach?: string;
}

export interface PlanStep {
  id: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';
  result?: string;
  dependsOn?: string[];
  toolHint?: string;
}

export interface PlanAdaptation {
  stepIndex: number;
  reason: string;
  originalPlan: string;
  adaptedPlan: string;
  timestamp: string;
}

export interface ExecutionPlan {
  steps: PlanStep[];
  currentStepIndex: number;
  adaptiveHistory: PlanAdaptation[];
}

export interface ExecutionContext {
  agentId: string;
  agentName: string;
  agentType: string;
  agentConfig: Record<string, unknown>;
  task: string;
  userId: string;
  conversationId?: string;
  maxSteps: number;
  maxRetries: number;
  steps: ExecutionStep[];
  status: string;
  memory: any;
  tools: string[];
  guardrailsActive: boolean;
  startedAt: string;
  lastUpdatedAt: string;
  totalTokensUsed: number;
  totalCost: number;
  plan?: ExecutionPlan;
  executionId?: string;
}

export async function executeAgentLoop(
  context: ExecutionContext,
  toolRegistry: ToolRegistry,
  onStep?: (step: ExecutionStep) => void
): Promise<ExecutionStep[]> {
  const router = createAIRouter(context.userId);
  const registry = SkillsRegistry.getInstance();
  let iterations = 0;
  let isResolved = false;
  let currentContext = `Tâche: ${context.task}`;

  log.info('Starting human-like autonomous execution', { agentId: context.agentId, userId: context.userId });

  while (!isResolved && iterations < context.maxSteps) {
    iterations++;

    await deductCredits({
      userId: context.userId,
      amount: 15,
      resourceType: 'autonomous_action',
      description: `Cycle d'autonomie #${iterations}`
    });

    const response = await router.chat([
      { role: 'user', content: `Contexte: ${currentContext}. Résous-la. JSON: {"action": "use_skill" | "final_answer", "skillId": "...", "params": {}, "output": "..."}` }
    ]);

    try {
      const decision = JSON.parse(response.content);
      const step: ExecutionStep = {
        id: `step_${Date.now()}`,
        type: decision.action === 'use_skill' ? 'action' : 'result',
        content: decision.output || `Utilisation de ${decision.skillId}`,
        timestamp: new Date().toISOString(),
        toolName: decision.skillId
      };

      context.steps.push(step);
      if (onStep) onStep(step);

      if (decision.action === 'use_skill') {
        const skill = registry.getSkill(decision.skillId);
        if (skill) {
          const result = await skill.execute(decision.params);
          currentContext += `\n[Skill ${skill.id}]: ${JSON.stringify(result)}`;
        }
      } else {
        isResolved = true;
      }
    } catch {
      isResolved = true;
    }
  }

  return context.steps;
}
