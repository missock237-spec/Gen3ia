// ============================================================
// Gen3ia Evolution Engine — Sandbox
// ============================================================
// Restricted child_process runner used by:
//   - validation.ts (install/typecheck/lint/tests/build)
//   - git.ts (branch/commit/push)
//   - modifier.ts (git apply)
//
// Safety guarantees:
//   - Reads NO secrets from process.env (filter forbidden substrings)
//   - Hard wall-clock timeout (default 5 min)
//   - stdout/stderr size-limited
//   - cwd is always the repo root (or a provided working dir)
//   - SIGTERM → SIGKILL escalation on timeout
//   - Optional dry-run mode that logs but doesn't execute
// ============================================================

import { spawn, type ChildProcess } from 'node:child_process';
import { createLogger } from '@/lib/logger';
import { SANDBOX_DEFAULTS, getEvolutionEnv } from './config';
import type { SandboxResult } from './types';

const log = createLogger('evolution-sandbox');

const FORBIDDEN = SANDBOX_DEFAULTS.forbiddenEnvSubstrings;

function filterEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const clean: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) continue;
    if (FORBIDDEN.some((substr) => k.includes(substr))) continue;
    // Also scan string values for secret-like content
    if (typeof v === 'string' && v.length < 1024 && FORBIDDEN.some((substr) => v.includes(substr))) {
      continue;
    }
    clean[k] = v;
  }
  // Force a non-prod NODE_ENV inside the sandbox.
  clean['NODE_ENV'] = 'production';
  // Always disable telemetry / update-notifier / CI noise.
  clean['CI'] = '1';
  clean['NEXT_TELEMETRY_DISABLED'] = '1';
  clean['NO_UPDATE_NOTIFIER'] = '1';
  return clean as NodeJS.ProcessEnv;
}

export interface SandboxOptions {
  /** Working directory. Defaults to `process.cwd()`. */
  cwd?: string;
  /** Timeout in ms. Defaults to `SANDBOX_DEFAULTS.timeoutMs`. */
  timeoutMs?: number;
  /** If true, log the command but don't execute. */
  dryRun?: boolean;
  /** Extra env to inject (after filtering). */
  env?: NodeJS.ProcessEnv;
  /** Stdout/stderr size caps. */
  maxStdoutBytes?: number;
  maxStderrBytes?: number;
}

/**
 * Run a shell command in a sandboxed environment.
 * Returns `SandboxResult` (never throws — caller checks `exitCode`).
 */
export function runSandboxed(
  command: string,
  args: string[],
  opts: SandboxOptions = {}
): Promise<SandboxResult> {
  const env = getEvolutionEnv();
  const dryRun = opts.dryRun ?? env.EVOLUTION_DRY_RUN;
  const timeoutMs = opts.timeoutMs ?? SANDBOX_DEFAULTS.timeoutMs;
  const cwd = opts.cwd ?? process.cwd();

  if (dryRun) {
    log.info('dry-run skip', { command, args, cwd });
    return Promise.resolve({
      exitCode: 0,
      stdout: `[dry-run] skipped: ${command} ${args.join(' ')}\n`,
      stderr: '',
      durationMs: 0,
      timedOut: false,
      killed: false,
    });
  }

  return new Promise((resolve) => {
    const started = Date.now();
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let timedOut = false;
    let killed = false;
    let killedBy: NodeJS.Signals | null = null;
    let resolved = false;

    const finish = (result: SandboxResult) => {
      if (resolved) return;
      resolved = true;
      resolve(result);
    };

    const child: ChildProcess = spawn(command, args, {
      cwd,
      env: { ...filterEnv(process.env), ...(opts.env ?? {}) },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    const maxOut = opts.maxStdoutBytes ?? SANDBOX_DEFAULTS.maxStdoutBytes;
    const maxErr = opts.maxStderrBytes ?? SANDBOX_DEFAULTS.maxStderrBytes;

    let outSize = 0;
    let errSize = 0;

    if (child.stdout) {
      child.stdout.on('data', (chunk: Buffer) => {
        if (outSize >= maxOut) return;
        const remaining = maxOut - outSize;
        if (chunk.length > remaining) {
          stdoutChunks.push(chunk.subarray(0, remaining));
          outSize = maxOut;
        } else {
          stdoutChunks.push(chunk);
          outSize += chunk.length;
        }
      });
    }
    if (child.stderr) {
      child.stderr.on('data', (chunk: Buffer) => {
        if (errSize >= maxErr) return;
        const remaining = maxErr - errSize;
        if (chunk.length > remaining) {
          stderrChunks.push(chunk.subarray(0, remaining));
          errSize = maxErr;
        } else {
          stderrChunks.push(chunk);
          errSize += chunk.length;
        }
      });
    }

    const timer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill('SIGTERM');
        killedBy = 'SIGTERM';
        setTimeout(() => {
          if (!child.killed) {
            child.kill('SIGKILL');
            killedBy = 'SIGKILL';
          }
        }, 3000);
      } catch {
        // ignore
      }
    }, timeoutMs);

    child.on('error', (err) => {
      clearTimeout(timer);
      log.error('sandbox spawn error', { command, error: String(err) });
      finish({
        exitCode: null,
        stdout: Buffer.concat(stdoutChunks).toString('utf8'),
        stderr: `${Buffer.concat(stderrChunks).toString('utf8')}\n[sandbox] spawn error: ${err.message}`,
        durationMs: Date.now() - started,
        timedOut: false,
        killed: true,
      });
    });

    child.on('close', (code, signal) => {
      clearTimeout(timer);
      killed = signal !== null && signal !== undefined;
      finish({
        exitCode: code,
        stdout: Buffer.concat(stdoutChunks).toString('utf8'),
        stderr: Buffer.concat(stderrChunks).toString('utf8'),
        durationMs: Date.now() - started,
        timedOut,
        killed,
      });
    });

    // If we killed via timeout but `close` doesn't fire quickly, force-resolve.
    setTimeout(() => {
      if (!resolved) {
        killed = true;
        finish({
          exitCode: null,
          stdout: Buffer.concat(stdoutChunks).toString('utf8'),
          stderr: `${Buffer.concat(stderrChunks).toString('utf8')}\n[sandbox] force-killed after timeout`,
          durationMs: Date.now() - started,
          timedOut: true,
          killed: true,
        });
      }
    }, timeoutMs + 5000).unref();

    void killedBy;
  });
}

/**
 * Convenience: run a single shell command (string form, parsed via shell=false).
 * Caller must pass args as an array.
 */
export async function runChecked(
  command: string,
  args: string[],
  opts: SandboxOptions = {}
): Promise<SandboxResult> {
  const r = await runSandboxed(command, args, opts);
  if (r.timedOut) {
    log.warn('sandbox timeout', { command, args, timeoutMs: opts.timeoutMs });
  }
  if (r.killed) {
    log.warn('sandbox killed', { command, args });
  }
  return r;
}
