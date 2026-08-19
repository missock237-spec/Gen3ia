// ============================================================
// Gen3ia Evolution Engine — Tests: safety gates
// ============================================================
// Mocks the audit trail and memory to verify the safety gate
// logic refuses protected paths and requires L3 for sensitive phases.
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the audit trail before importing safety.ts
vi.mock('@/lib/security/audit-trail', () => ({
  recordAudit: vi.fn(async () => undefined),
}));

// Mock the logger
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
  }),
}));

// Mock memory to avoid DB
vi.mock('../memory', () => ({
  getEvolutionRecord: vi.fn(async (id: string) => ({
    id,
    status: 'awaiting_review',
    safetyLevel: 3,
  })),
  updateEvolutionRecord: vi.fn(async () => null),
}));

import { enforceSafetyGate, enforcePreMergeGate, grantHumanApproval } from '../safety';
import type { ImprovementPlan, ImprovementProposal, EvaluationResult, FileChange } from '../types';

function makeProposal(overrides: Partial<ImprovementProposal> = {}): ImprovementProposal {
  return {
    id: 'prop_1',
    title: 'Test proposal',
    summary: 'A test proposal',
    addressesRootCauseId: 'rc_1',
    fileChanges: [],
    risks: [],
    testPlan: [],
    confidence: 0.8,
    estimatedCostUsd: 0.1,
    requiredSafetyLevel: 1,
    ...overrides,
  };
}

function makePlan(proposals: ImprovementProposal[]): ImprovementPlan {
  return {
    id: 'plan_1',
    evolutionId: 'evo_1',
    summary: 'test plan',
    proposals,
    globalRisks: [],
    verificationSteps: [],
    estimatedTotalCostUsd: 0,
    generatedByModel: 'test-model',
    createdAt: new Date().toISOString(),
  };
}

describe('enforceSafetyGate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('auto-approves L1 plan with no file changes', async () => {
    const plan = makePlan([makeProposal({ requiredSafetyLevel: 1 })]);
    const r = await enforceSafetyGate('evo_1', plan);
    expect(r.ok).toBe(true);
    expect(r.level).toBe(1);
    expect(r.awaitingHumanApproval).toBe(false);
  });

  it('auto-approves L2 plan', async () => {
    const plan = makePlan([makeProposal({ requiredSafetyLevel: 2 })]);
    const r = await enforceSafetyGate('evo_1', plan);
    expect(r.ok).toBe(true);
    expect(r.level).toBe(2);
    expect(r.awaitingHumanApproval).toBe(false);
  });

  it('requires human approval for L3 plan', async () => {
    const plan = makePlan([makeProposal({ requiredSafetyLevel: 3 })]);
    const r = await enforceSafetyGate('evo_1', plan);
    expect(r.ok).toBe(false);
    expect(r.level).toBe(3);
    expect(r.awaitingHumanApproval).toBe(true);
  });

  it('refuses to apply plan touching protected path even at L3', async () => {
    const fc: FileChange = {
      path: 'src/lib/firebase/auth.ts',
      action: 'modify',
      diff: 'fake diff',
      rationale: 'try to modify auth',
    };
    const plan = makePlan([
      makeProposal({ requiredSafetyLevel: 3, fileChanges: [fc] }),
    ]);
    const r = await enforceSafetyGate('evo_1', plan);
    expect(r.ok).toBe(false);
    expect(r.awaitingHumanApproval).toBe(false);
    expect(r.triggeringPaths).toContain('src/lib/firebase/auth.ts');
  });

  it('refuses to apply plan touching .env', async () => {
    const fc: FileChange = {
      path: '.env.local',
      action: 'modify',
      content: 'secret=...',
      rationale: 'try to read env',
    };
    const plan = makePlan([makeProposal({ requiredSafetyLevel: 3, fileChanges: [fc] })]);
    const r = await enforceSafetyGate('evo_1', plan);
    expect(r.ok).toBe(false);
    expect(r.awaitingHumanApproval).toBe(false);
  });

  it('refuses to apply plan touching vercel.json', async () => {
    const fc: FileChange = {
      path: 'vercel.json',
      action: 'modify',
      content: '{}',
      rationale: 'try to modify infra',
    };
    const plan = makePlan([makeProposal({ requiredSafetyLevel: 3, fileChanges: [fc] })]);
    const r = await enforceSafetyGate('evo_1', plan);
    expect(r.ok).toBe(false);
  });

  it('refuses to apply plan touching .github/workflows', async () => {
    const fc: FileChange = {
      path: '.github/workflows/ci.yml',
      action: 'modify',
      diff: 'fake',
      rationale: 'try to modify CI',
    };
    const plan = makePlan([makeProposal({ requiredSafetyLevel: 3, fileChanges: [fc] })]);
    const r = await enforceSafetyGate('evo_1', plan);
    expect(r.ok).toBe(false);
  });

  it('takes the MAX of all proposal requiredSafetyLevels', async () => {
    const plan = makePlan([
      makeProposal({ requiredSafetyLevel: 1 }),
      makeProposal({ requiredSafetyLevel: 2 }),
      makeProposal({ requiredSafetyLevel: 3 }),
    ]);
    const r = await enforceSafetyGate('evo_1', plan);
    expect(r.ok).toBe(false);
    expect(r.level).toBe(3);
    expect(r.awaitingHumanApproval).toBe(true);
  });
});

describe('enforcePreMergeGate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('allows merge when evaluation recommends merge', async () => {
    const evaluation: EvaluationResult = {
      before: [],
      after: [],
      deltas: [],
      verdict: 'all good',
      confidence: 0.9,
      recommendation: 'merge',
    };
    const r = await enforcePreMergeGate('evo_1', evaluation);
    expect(r.ok).toBe(true);
  });

  it('blocks merge when evaluation recommends hold', async () => {
    const evaluation: EvaluationResult = {
      before: [],
      after: [],
      deltas: [],
      verdict: 'uncertain',
      confidence: 0.5,
      recommendation: 'hold',
    };
    const r = await enforcePreMergeGate('evo_1', evaluation);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('hold');
  });

  it('blocks merge when evaluation recommends rollback', async () => {
    const evaluation: EvaluationResult = {
      before: [],
      after: [],
      deltas: [],
      verdict: 'regression detected',
      confidence: 0.9,
      recommendation: 'rollback',
    };
    const r = await enforcePreMergeGate('evo_1', evaluation);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('rollback');
  });
});

describe('grantHumanApproval', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('refuses non-admin approver', async () => {
    const r = await grantHumanApproval('evo_1', 'user-123', 'user');
    expect(r).toBe(false);
  });

  it('allows admin approver for an awaiting_review evolution', async () => {
    const r = await grantHumanApproval('evo_1', 'admin-1', 'admin');
    expect(r).toBe(true);
  });
});
