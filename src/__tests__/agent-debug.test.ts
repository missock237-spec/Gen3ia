import { describe, it, expect, beforeEach } from 'vitest';
import { AgentDebugger, ReplayEngine, StepType, StepStatus } from '@/lib/agent-debug';

describe('Agent Debug & Replay Studio', () => {
  let debuggerInstance: AgentDebugger;
  let replayEngineInstance: ReplayEngine;

  beforeEach(() => {
    debuggerInstance = new AgentDebugger();
    replayEngineInstance = new ReplayEngine();
  });

  it('starts a run and records steps', async () => {
    const runId = await debuggerInstance.startRun('agent-1', 'user-1', 'conv-1');
    expect(runId).toBeDefined();

    const step = await debuggerInstance.recordStep(runId, {
      type: StepType.USER_INPUT,
      status: StepStatus.SUCCESS,
      timestamp: Date.now(),
      duration: 15,
      inputData: { prompt: 'Hello world' },
      outputData: { text: 'Parsed input' },
    });

    expect(step.id).toBeDefined();
    expect(step.runId).toBe(runId);

    const run = await debuggerInstance.getRun(runId);
    expect(run).not.toBeNull();
    expect(run?.totalSteps).toBe(1);
    expect(run?.steps[0].type).toBe(StepType.USER_INPUT);
  });

  it('fetches runs by agent and user', async () => {
    const runId1 = await debuggerInstance.startRun('agent-test', 'user-test', 'conv-1');
    const runs = await debuggerInstance.getRunsByAgent('agent-test', 'user-test');
    expect(runs.length).toBeGreaterThanOrEqual(1);
    expect(runs.some((r) => r.id === runId1)).toBe(true);
  });

  it('compares two runs with diffRuns', async () => {
    const runId1 = await debuggerInstance.startRun('agent-diff', 'user-diff', 'conv-1');
    await debuggerInstance.recordStep(runId1, {
      type: StepType.USER_INPUT,
      status: StepStatus.SUCCESS,
      timestamp: Date.now(),
      duration: 10,
      inputData: { query: 'Initial prompt' },
      outputData: { parsed: true },
    });

    const runId2 = await debuggerInstance.startRun('agent-diff', 'user-diff', 'conv-2');
    await debuggerInstance.recordStep(runId2, {
      type: StepType.USER_INPUT,
      status: StepStatus.SUCCESS,
      timestamp: Date.now(),
      duration: 12,
      inputData: { query: 'Modified prompt' },
      outputData: { parsed: true },
    });

    const diff = await debuggerInstance.diffRuns(runId1, runId2);
    expect(diff.modifiedSteps.length).toBe(1);
    expect(diff.addedSteps.length).toBe(0);
    expect(diff.removedSteps.length).toBe(0);
  });

  it('exports run to json and markdown format', async () => {
    const runId = await debuggerInstance.startRun('agent-exp', 'user-exp', 'conv-exp');
    await debuggerInstance.recordStep(runId, {
      type: StepType.LLM_CALL,
      status: StepStatus.SUCCESS,
      timestamp: Date.now(),
      duration: 250,
      inputData: { prompt: 'Test' },
      outputData: { response: 'Test response' },
      tokensUsed: { input: 10, output: 20 },
    });

    const jsonExport = await debuggerInstance.exportRun(runId, 'json');
    expect(jsonExport).toContain('agent-exp');

    const mdExport = await debuggerInstance.exportRun(runId, 'markdown');
    expect(mdExport).toContain('# Agent Run Trace');
    expect(mdExport).toContain('LLM_CALL');
  });

  it('replays a run with modified inputs using ReplayEngine', async () => {
    const runId = await debuggerInstance.startRun('agent-replay', 'user-replay', 'conv-replay');
    const originalStep = await debuggerInstance.recordStep(runId, {
      type: StepType.TOOL_CALL,
      status: StepStatus.SUCCESS,
      timestamp: Date.now(),
      duration: 100,
      inputData: { param: 'old-value' },
      outputData: { result: 'old-result' },
    });

    const replayedRun = await replayEngineInstance.replay({
      runId,
      modifiedSteps: [
        {
          stepId: originalStep.id,
          newInput: { param: 'new-value' },
        },
      ],
    });

    expect(replayedRun).toBeDefined();
    expect(replayedRun.id).not.toBe(runId);
    expect(replayedRun.steps.length).toBe(1);
    expect(replayedRun.steps[0].inputData).toEqual({ param: 'new-value' });
  });

  it('deletes a run', async () => {
    const runId = await debuggerInstance.startRun('agent-del', 'user-del', 'conv-del');
    const deleted = await debuggerInstance.deleteRun(runId);
    expect(deleted).toBe(true);

    const fetched = await debuggerInstance.getRun(runId);
    expect(fetched).toBeNull();
  });
});
