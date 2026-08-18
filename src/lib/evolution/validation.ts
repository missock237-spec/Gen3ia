// ============================================================
// Gen3ia Evolution Engine — Validation pipeline
// ============================================================
// Runs the standard pre-merge checks:
//   install → typecheck → lint → unit tests → build → security
// All commands run inside the sandbox. Failures are surfaced
// as `ValidationResult` records and persisted to `evolution_logs`.
// ============================================================

import { createLogger } from '@/lib/logger';
import { runSandboxed } from './sandbox';
import { saveValidationResult } from './memory';
import type { ValidationResult } from './types';

const log = createLogger('evolution-validation');

interface ValidationStepSpec {
  phase: ValidationResult['phase'];
  command: string;
  args: string[];
  /** Soft-fail (don't block next phase) — for `test` which may need DB. */
  softFail?: boolean;
  /** Override timeout. */
  timeoutMs?: number;
}

const NPM = process.env.EVOLUTION_NPM_BIN ?? 'npm';
const NPX = process.env.EVOLUTION_NPX_BIN ?? 'npx';

const STEPS: readonly ValidationStepSpec[] = [
  {
    phase: 'install',
    command: NPM,
    args: ['install', '--legacy-peer-deps', '--no-audit', '--no-fund'],
    timeoutMs: 5 * 60 * 1000,
  },
  {
    phase: 'typecheck',
    command: NPM,
    args: ['run', 'typecheck'],
    timeoutMs: 3 * 60 * 1000,
  },
  {
    phase: 'lint',
    command: NPM,
    args: ['run', 'lint'],
    timeoutMs: 3 * 60 * 1000,
  },
  {
    phase: 'unit',
    command: NPM,
    args: ['run', 'test:unit'],
    softFail: true,
    timeoutMs: 5 * 60 * 1000,
  },
  {
    phase: 'build',
    command: NPM,
    args: ['run', 'build'],
    timeoutMs: 8 * 60 * 1000,
  },
  {
    phase: 'security',
    command: NPX,
    args: ['--yes', 'audit-ci', '--moderate', '--skip-dev'],
    softFail: true,
    timeoutMs: 60 * 1000,
  },
];

function tail(s: string, max = 4096): string {
  if (s.length <= max) return s;
  return `...${s.slice(-max)}`;
}

export interface RunValidationOpts {
  /** Skip phases (e.g. `['install']` if already installed). */
  skipPhases?: ValidationResult['phase'][];
  /** Stop at first failure instead of continuing to soft-fail phases. */
  failFast?: boolean;
}

export async function runValidationPipeline(
  evolutionId: string,
  opts: RunValidationOpts = {}
): Promise<{ results: ValidationResult[]; allPassed: boolean }> {
  const skip = new Set(opts.skipPhases ?? []);
  const results: ValidationResult[] = [];
  let allPassed = true;

  for (const step of STEPS) {
    if (skip.has(step.phase)) {
      log.info('skipping phase', { phase: step.phase, evolutionId });
      continue;
    }
    const startedAt = new Date().toISOString();
    const start = Date.now();
    const r = await runSandboxed(step.command, step.args, {
      timeoutMs: step.timeoutMs,
      cwd: process.cwd(),
      env: {
        // Minimal env to make npm happy without exposing secrets.
        PATH: process.env.PATH ?? '',
        HOME: process.env.HOME ?? '/tmp',
        CI: '1',
        NEXT_TELEMETRY_DISABLED: '1',
      } as unknown as NodeJS.ProcessEnv,
    });
    const endedAt = new Date().toISOString();
    const durationMs = Date.now() - start;

    const status: ValidationResult['status'] =
      r.exitCode === 0 && !r.timedOut ? 'success' : step.softFail ? 'failed' : 'failed';

    const vr: ValidationResult = {
      phase: step.phase,
      status,
      durationMs,
      outputTail: tail(`${r.stdout}\n${r.stderr}`),
      exitCode: r.exitCode,
      startedAt,
      endedAt,
    };

    results.push(vr);
    await saveValidationResult(evolutionId, vr);

    if (status !== 'success') {
      allPassed = false;
      if (!step.softFail && opts.failFast !== false) {
        log.warn('validation failed (hard stop)', { phase: step.phase, exitCode: r.exitCode, evolutionId });
        break;
      } else {
        log.warn('validation failed (soft)', { phase: step.phase, exitCode: r.exitCode, evolutionId });
      }
    } else {
      log.info('validation ok', { phase: step.phase, durationMs, evolutionId });
    }
  }

  return { results, allPassed };
}

// ----- Subset runner: only run a few phases -----

export async function runValidationSubset(
  evolutionId: string,
  phases: ValidationResult['phase'][]
): Promise<ValidationResult[]> {
  const out: ValidationResult[] = [];
  for (const phase of phases) {
    const spec = STEPS.find((s) => s.phase === phase);
    if (!spec) continue;
    const startedAt = new Date().toISOString();
    const start = Date.now();
    const r = await runSandboxed(spec.command, spec.args, {
      timeoutMs: spec.timeoutMs,
      cwd: process.cwd(),
      env: {
        PATH: process.env.PATH ?? '',
        HOME: process.env.HOME ?? '/tmp',
        CI: '1',
        NEXT_TELEMETRY_DISABLED: '1',
      } as unknown as NodeJS.ProcessEnv,
    });
    const endedAt = new Date().toISOString();
    const durationMs = Date.now() - start;
    const vr: ValidationResult = {
      phase,
      status: r.exitCode === 0 && !r.timedOut ? 'success' : 'failed',
      durationMs,
      outputTail: tail(`${r.stdout}\n${r.stderr}`),
      exitCode: r.exitCode,
      startedAt,
      endedAt,
    };
    out.push(vr);
    await saveValidationResult(evolutionId, vr);
  }
  return out;
}
