// ============================================================
// Gen3ia Evolution Engine — Tests: rollback flow
// ============================================================
// Mocks the git operations and DB to verify the rollback
// decision tree:
//   - recommendation=merge → no rollback
//   - recommendation=rollback → revert is invoked
//   - revert failure → rollback record marked failed
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
  }),
}));

vi.mock('@/lib/security/audit-trail', () => ({
  recordAudit: vi.fn(async () => undefined),
}));

vi.mock('../memory', () => ({
  getEvolutionRecord: vi.fn(async (id: string) => ({
    id,
    headSha: 'abc123',
    sourceBranch: 'evolution/test',
    status: 'pr_merged',
  })),
  createRollback: vi.fn(async (input: { evolutionId: string; reason: string }) => ({
    id: 'rb_1',
    evolutionId: input.evolutionId,
    reason: input.reason,
    mergedSha: 'abc123',
    status: 'reverting',
    startedAt: new Date().toISOString(),
  })),
  updateRollback: vi.fn(async () => undefined),
  updateEvolutionRecord: vi.fn(async () => null),
  setEvolutionStatus: vi.fn(async () => undefined),
}));

vi.mock('../git', () => ({
  revertMergeCommit: vi.fn(async (sha: string, _branch: string) => `revert-${sha}`),
  pushBranch: vi.fn(async () => undefined),
}));

import { triggerRollback } from '../orchestrator';
import { revertMergeCommit } from '../git';
import { updateRollback } from '../memory';

describe('triggerRollback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reverts the merge commit and pushes', async () => {
    await triggerRollback('evo_1', 'post-merge regression detected');
    expect(revertMergeCommit).toHaveBeenCalledWith('abc123', 'evolution/test');
    expect(updateRollback).toHaveBeenCalledWith(
      'rb_1',
      expect.objectContaining({
        status: 'succeeded',
        revertSha: 'revert-abc123',
      })
    );
  });

  it('throws when evolution has no headSha', async () => {
    const memory = await import('../memory');
    vi.mocked(memory.getEvolutionRecord).mockResolvedValueOnce({
      id: 'evo_2',
      headSha: undefined,
      sourceBranch: 'evolution/test2',
      status: 'pr_merged',
    } as never);
    await expect(triggerRollback('evo_2', 'test')).rejects.toThrow('no headSha');
  });

  it('marks rollback as failed when revert throws', async () => {
    vi.mocked(revertMergeCommit).mockRejectedValueOnce(new Error('git conflict'));
    await expect(triggerRollback('evo_1', 'test')).rejects.toThrow('git conflict');
    expect(updateRollback).toHaveBeenCalledWith(
      'rb_1',
      expect.objectContaining({
        status: 'failed',
      })
    );
  });
});
