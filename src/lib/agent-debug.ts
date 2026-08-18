export enum StepType {
  USER_INPUT = 'USER_INPUT',
  LLM_CALL = 'LLM_CALL',
  TOOL_CALL = 'TOOL_CALL',
  TOOL_RESULT = 'TOOL_RESULT',
  AGENT_DECISION = 'AGENT_DECISION',
  ERROR = 'ERROR',
  SYSTEM_EVENT = 'SYSTEM_EVENT',
}

export enum StepStatus {
  SUCCESS = 'SUCCESS',
  FAILURE = 'FAILURE',
  SKIPPED = 'SKIPPED',
  TIMEOUT = 'TIMEOUT',
}

export interface DebugStep {
  id: string;
  runId: string;
  type: StepType;
  status: StepStatus;
  timestamp: number;
  duration: number;
  inputData: Record<string, unknown>;
  outputData: Record<string, unknown>;
  model?: string;
  tokensUsed?: {
    input: number;
    output: number;
  };
  errorMessage?: string;
  metadata?: Record<string, unknown>;
}

export interface AgentRun {
  id: string;
  agentId: string;
  userId: string;
  conversationId: string;
  startedAt: number;
  endedAt?: number;
  totalSteps: number;
  totalCost: number;
  status: 'running' | 'completed' | 'failed';
  steps: DebugStep[];
}

export interface ReplayConfig {
  runId: string;
  modifiedSteps: {
    stepId: string;
    newInput: Record<string, unknown>;
  }[];
  stopAtStepId?: string;
}

const db = {
  collection: (_name: string) => ({
    add: async (_data: any) => ({ id: 'mock-' + Date.now() }),
    get: async () => ({ docs: [] }),
    where: () => ({
      get: async () => ({ docs: [] }),
      orderBy: () => ({
        limit: () => ({
          get: async () => ({ docs: [] })
        })
      })
    }),
    doc: (_id: string) => ({
      get: async () => ({ exists: false }),
      delete: async () => undefined
    })
  })
};

export class AgentDebugger {
  private runs: Map<string, AgentRun> = new Map();

  private seedSampleRuns(agentId: string, userId: string) {
    const run1Id = `run-sample-1`;
    const now = Date.now();
    const run1: AgentRun = {
      id: run1Id,
      agentId,
      userId,
      conversationId: `conv-sample-1`,
      startedAt: now - 3600000,
      endedAt: now - 3595000,
      totalSteps: 4,
      totalCost: 0.0024,
      status: 'completed',
      steps: [
        {
          id: `step-1`,
          runId: run1Id,
          type: StepType.USER_INPUT,
          status: StepStatus.SUCCESS,
          timestamp: now - 3600000,
          duration: 12,
          inputData: { query: 'Analyze Q3 sales data and generate summary report' },
          outputData: { parsedIntent: 'ANALYZE_SALES', period: 'Q3' },
        },
        {
          id: `step-2`,
          runId: run1Id,
          type: StepType.LLM_CALL,
          status: StepStatus.SUCCESS,
          timestamp: now - 3599000,
          duration: 1240,
          model: 'gpt-4o',
          tokensUsed: { input: 350, output: 120 },
          inputData: { prompt: 'Analyze Q3 sales figures from database', systemPrompt: 'You are a data analyst agent.' },
          outputData: { decision: 'execute_tool', tool: 'query_sales_db', params: { quarter: 'Q3' } },
        },
        {
          id: `step-3`,
          runId: run1Id,
          type: StepType.TOOL_CALL,
          status: StepStatus.SUCCESS,
          timestamp: now - 3597000,
          duration: 430,
          inputData: { toolName: 'query_sales_db', arguments: { quarter: 'Q3', limit: 100 } },
          outputData: { recordsFound: 142, totalRevenue: 1250000, topProduct: 'Enterprise Pro Plan' },
        },
        {
          id: `step-4`,
          runId: run1Id,
          type: StepType.AGENT_DECISION,
          status: StepStatus.SUCCESS,
          timestamp: now - 3595000,
          duration: 890,
          model: 'gpt-4o',
          tokensUsed: { input: 600, output: 280 },
          inputData: { prompt: 'Summarize totalRevenue: 1250000, topProduct: Enterprise Pro Plan' },
          outputData: { finalResponse: 'Q3 revenue reached $1,250,000, driven primarily by Enterprise Pro Plan.' },
        }
      ]
    };

    const run2Id = `run-sample-2`;
    const run2: AgentRun = {
      id: run2Id,
      agentId,
      userId,
      conversationId: `conv-sample-2`,
      startedAt: now - 1800000,
      endedAt: now - 1798000,
      totalSteps: 3,
      totalCost: 0.0008,
      status: 'failed',
      steps: [
        {
          id: `step-21`,
          runId: run2Id,
          type: StepType.USER_INPUT,
          status: StepStatus.SUCCESS,
          timestamp: now - 1800000,
          duration: 10,
          inputData: { query: 'Export inventory report to PDF' },
          outputData: { parsedIntent: 'EXPORT_PDF', category: 'inventory' },
        },
        {
          id: `step-22`,
          runId: run2Id,
          type: StepType.TOOL_CALL,
          status: StepStatus.FAILURE,
          timestamp: now - 1799000,
          duration: 1500,
          errorMessage: 'PDF Generator service unavailable (HTTP 503)',
          inputData: { toolName: 'pdf_generator', arguments: { template: 'inventory_v2' } },
          outputData: { error: 'Service Unavailable', code: 503 },
        },
        {
          id: `step-23`,
          runId: run2Id,
          type: StepType.ERROR,
          status: StepStatus.FAILURE,
          timestamp: now - 1798000,
          duration: 20,
          errorMessage: 'Agent execution aborted due to unhandled tool failure',
          inputData: { errorContext: 'pdf_generator failed with 503' },
          outputData: { status: 'failed', retryable: true },
        }
      ]
    };

    this.runs.set(run1.id, run1);
    this.runs.set(run2.id, run2);
  }

  async startRun(agentId: string, userId: string, conversationId: string): Promise<string> {
    const runId = `run-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const newRun: AgentRun = {
      id: runId,
      agentId,
      userId,
      conversationId,
      startedAt: Date.now(),
      totalSteps: 0,
      totalCost: 0,
      status: 'running',
      steps: [],
    };

    this.runs.set(runId, newRun);

    await db.collection('agent_runs').add(newRun);

    return runId;
  }

  async recordStep(
    runId: string,
    step: Omit<DebugStep, 'id' | 'runId'>
  ): Promise<DebugStep> {
    let run = this.runs.get(runId);
    if (!run) {
      run = {
        id: runId,
        agentId: 'default-agent',
        userId: 'default-user',
        conversationId: 'default-conv',
        startedAt: Date.now(),
        totalSteps: 0,
        totalCost: 0,
        status: 'running',
        steps: [],
      };
      this.runs.set(runId, run);
    }

    const stepId = `step-${run.steps.length + 1}-${Math.random().toString(36).substring(2, 7)}`;
    const debugStep: DebugStep = {
      ...step,
      id: stepId,
      runId,
    };

    run.steps.push(debugStep);
    run.totalSteps = run.steps.length;
    run.endedAt = Date.now();

    if (step.tokensUsed) {
      const stepCost = (step.tokensUsed.input + step.tokensUsed.output) * 0.000003;
      run.totalCost = Number((run.totalCost + stepCost).toFixed(6));
    }

    if (step.status === StepStatus.FAILURE) {
      run.status = 'failed';
    } else if (run.status === 'running' && (step.type === StepType.AGENT_DECISION || step.type === StepType.TOOL_RESULT)) {
      run.status = 'completed';
    }

    await db.collection('agent_steps').add(debugStep);

    return debugStep;
  }

  async getRun(runId: string): Promise<AgentRun | null> {
    const run = this.runs.get(runId);
    if (run) return run;

    const doc = await db.collection('agent_runs').doc(runId).get();
    if (doc.exists) {
      return null;
    }

    return null;
  }

  async getRunsByAgent(
    agentId: string,
    userId: string,
    limit: number = 50
  ): Promise<AgentRun[]> {
    const existing = Array.from(this.runs.values()).filter(
      (r) => (r.agentId === agentId || !agentId) && (r.userId === userId || !userId)
    );

    // Plus de seedSampleRuns — auparavant cette méthode injectait 2 fausses runs
    // "sample-1" et "sample-2" avec des traces factices (LLM_CALL gpt-4o,
    // TOOL_CALL query_sales_db retournant recordsFound:142, totalRevenue:1250000…)
    // ce qui affichait des données de debug fabriquées aux utilisateurs.

    const runs = Array.from(this.runs.values())
      .filter((r) => (!agentId || r.agentId === agentId) && (!userId || r.userId === userId))
      .sort((a, b) => b.startedAt - a.startedAt)
      .slice(0, limit);

    return runs;
  }

  async diffRuns(
    runId1: string,
    runId2: string
  ): Promise<{
    addedSteps: DebugStep[];
    removedSteps: DebugStep[];
    modifiedSteps: { original: DebugStep; modified: DebugStep }[];
  }> {
    const run1 = await this.getRun(runId1);
    const run2 = await this.getRun(runId2);

    if (!run1 || !run2) {
      throw new Error('One or both runs not found for comparison');
    }

    const addedSteps: DebugStep[] = [];
    const removedSteps: DebugStep[] = [];
    const modifiedSteps: { original: DebugStep; modified: DebugStep }[] = [];

    const maxLen = Math.max(run1.steps.length, run2.steps.length);
    for (let i = 0; i < maxLen; i++) {
      const s1 = run1.steps[i];
      const s2 = run2.steps[i];

      if (s1 && s2) {
        const s1InputStr = JSON.stringify(s1.inputData);
        const s2InputStr = JSON.stringify(s2.inputData);
        const s1OutputStr = JSON.stringify(s1.outputData);
        const s2OutputStr = JSON.stringify(s2.outputData);

        if (
          s1.type !== s2.type ||
          s1.status !== s2.status ||
          s1InputStr !== s2InputStr ||
          s1OutputStr !== s2OutputStr
        ) {
          modifiedSteps.push({ original: s1, modified: s2 });
        }
      } else if (s2 && !s1) {
        addedSteps.push(s2);
      } else if (s1 && !s2) {
        removedSteps.push(s1);
      }
    }

    return { addedSteps, removedSteps, modifiedSteps };
  }

  async exportRun(runId: string, format: 'json' | 'markdown'): Promise<string> {
    const run = await this.getRun(runId);
    if (!run) {
      throw new Error(`Run ${runId} not found`);
    }

    if (format === 'json') {
      return JSON.stringify(run, null, 2);
    }

    let markdown = `# Agent Run Trace: ${run.id}\n\n`;
    markdown += `- **Agent ID:** ${run.agentId}\n`;
    markdown += `- **User ID:** ${run.userId}\n`;
    markdown += `- **Conversation ID:** ${run.conversationId}\n`;
    markdown += `- **Status:** ${run.status.toUpperCase()}\n`;
    markdown += `- **Started At:** ${new Date(run.startedAt).toISOString()}\n`;
    markdown += `- **Ended At:** ${run.endedAt ? new Date(run.endedAt).toISOString() : 'N/A'}\n`;
    markdown += `- **Total Steps:** ${run.totalSteps}\n`;
    markdown += `- **Total Cost:** $${run.totalCost.toFixed(6)}\n\n`;

    markdown += `## Execution Steps\n\n`;

    if (run.steps.length === 0) {
      markdown += `*No steps recorded for this run.*\n`;
    } else {
      run.steps.forEach((step, idx) => {
        markdown += `### Step ${idx + 1}: ${step.type} (${step.status})\n`;
        markdown += `- **ID:** \`${step.id}\`\n`;
        markdown += `- **Timestamp:** ${new Date(step.timestamp).toISOString()}\n`;
        markdown += `- **Duration:** ${step.duration}ms\n`;
        if (step.model) {
          markdown += `- **Model:** ${step.model}\n`;
        }
        if (step.tokensUsed) {
          markdown += `- **Tokens:** Input ${step.tokensUsed.input} / Output ${step.tokensUsed.output}\n`;
        }
        if (step.errorMessage) {
          markdown += `- **Error:** ${step.errorMessage}\n`;
        }
        markdown += `\n**Input Data:**\n\`\`\`json\n${JSON.stringify(step.inputData, null, 2)}\n\`\`\`\n\n`;
        markdown += `**Output Data:**\n\`\`\`json\n${JSON.stringify(step.outputData, null, 2)}\n\`\`\`\n\n`;
        markdown += `---\n\n`;
      });
    }

    return markdown;
  }

  async deleteRun(runId: string): Promise<boolean> {
    const exists = this.runs.has(runId);
    if (exists) {
      this.runs.delete(runId);
      await db.collection('agent_runs').doc(runId).delete();
      return true;
    }
    return false;
  }
}

export class ReplayEngine {
  async replay(config: ReplayConfig): Promise<AgentRun> {
    const originalRun = await agentDebugger.getRun(config.runId);
    if (!originalRun) {
      throw new Error(`Original run ${config.runId} not found`);
    }

    const modifiedMap = new Map<string, Record<string, unknown>>();
    for (const mod of config.modifiedSteps) {
      modifiedMap.set(mod.stepId, mod.newInput);
    }

    const newRunId = await agentDebugger.startRun(
      originalRun.agentId,
      originalRun.userId,
      originalRun.conversationId
    );

    for (const step of originalRun.steps) {
      const modifiedInput = modifiedMap.get(step.id);
      const inputToUse = modifiedInput || step.inputData;
      const simulatedStep = this.simulateStep(step, inputToUse);

      await agentDebugger.recordStep(newRunId, {
        type: simulatedStep.type,
        status: simulatedStep.status,
        timestamp: Date.now(),
        duration: simulatedStep.duration,
        inputData: simulatedStep.inputData,
        outputData: simulatedStep.outputData,
        model: simulatedStep.model,
        tokensUsed: simulatedStep.tokensUsed,
        errorMessage: simulatedStep.errorMessage,
        metadata: {
          ...simulatedStep.metadata,
          replayedFromStepId: step.id,
          replayedFromRunId: config.runId,
          isModified: !!modifiedInput,
        },
      });

      if (
        config.stopAtStepId &&
        (step.id === config.stopAtStepId || simulatedStep.id === config.stopAtStepId)
      ) {
        break;
      }
    }

    const replayedRun = await agentDebugger.getRun(newRunId);
    if (!replayedRun) {
      throw new Error(`Failed to create replayed run ${newRunId}`);
    }

    return replayedRun;
  }

  simulateStep(step: DebugStep, modifiedInput: Record<string, unknown>): DebugStep {
    const isModified = JSON.stringify(step.inputData) !== JSON.stringify(modifiedInput);

    return {
      ...step,
      id: `sim-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      timestamp: Date.now(),
      inputData: modifiedInput,
      outputData: isModified
        ? {
            ...step.outputData,
            _simulated: true,
            _note: 'Output re-simulated based on modified input',
          }
        : step.outputData,
      metadata: {
        ...step.metadata,
        simulated: true,
        modified: isModified,
      },
    };
  }
}

export const agentDebugger = new AgentDebugger();
export const replayEngine = new ReplayEngine();
