// ============================================================
// Gen3ia Evolution Engine — Modifier
// ============================================================
// Applies file changes from an ImprovementPlan to the working
// tree on the evolution branch. Delegates to `git.ts` for the
// actual writes (file create / git apply / delete).
// ============================================================

import { createLogger } from '@/lib/logger';
import { applyFileChanges, stageAll, commit, getDiffStat } from './git';
import { isProtectedPath } from './config';
import type { ImprovementPlan, FileChange } from './types';

const log = createLogger('evolution-modifier');

export interface ApplyPlanResult {
  appliedPaths: string[];
  skippedProtected: string[];
  commitSha?: string;
  diffStat: string;
}

export async function applyImprovementPlan(
  evolutionId: string,
  plan: ImprovementPlan
): Promise<ApplyPlanResult> {
  const appliedPaths: string[] = [];
  const skippedProtected: string[] = [];

  // 1. Filter out protected paths (safety: never modify them via evolution)
  const safe: FileChange[] = [];
  for (const proposal of plan.proposals) {
    for (const fc of proposal.fileChanges) {
      if (isProtectedPath(fc.path)) {
        skippedProtected.push(fc.path);
        log.warn('refusing to modify protected path', { path: fc.path, evolutionId });
        continue;
      }
      safe.push(fc);
    }
  }

  if (safe.length === 0) {
    log.info('no file changes to apply', { evolutionId });
    return { appliedPaths, skippedProtected, diffStat: '' };
  }

  // 2. Apply each change (git.ts handles create/modify/delete)
  const applied = await applyFileChanges(safe);
  appliedPaths.push(...applied);

  // 3. Stage any other modifications
  await stageAll();

  // 4. Commit
  const commitMsg = buildCommitMessage(evolutionId, plan);
  const commitSha = await commit(commitMsg, JSON.stringify(plan, null, 2).slice(0, 4000));

  // 5. Diff stat for the PR body
  const diffStat = await getDiffStat();

  log.info('plan applied', {
    evolutionId,
    applied: appliedPaths.length,
    skippedProtected: skippedProtected.length,
    commitSha,
  });

  return { appliedPaths, skippedProtected, commitSha, diffStat };
}

function buildCommitMessage(evolutionId: string, plan: ImprovementPlan): string {
  const lines: string[] = [
    `feat(evolution): ${plan.summary.slice(0, 72) || 'auto improvement'}`,
    '',
    `Evolution-Id: ${evolutionId}`,
    `Plan-Id: ${plan.id}`,
    `Generated-By: ${plan.generatedByModel}`,
    '',
    'Proposals:',
  ];
  for (const p of plan.proposals) {
    lines.push(`  - ${p.title} (safety L${p.requiredSafetyLevel}, conf ${p.confidence.toFixed(2)})`);
  }
  if (plan.globalRisks.length) {
    lines.push('', 'Risks:');
    for (const r of plan.globalRisks) {
      lines.push(`  - ${r}`);
    }
  }
  return lines.join('\n');
}
