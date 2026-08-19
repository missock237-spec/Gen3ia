// ============================================================
// Gen3ia Evolution Engine — Tests: sandbox
// ============================================================
// Tests the sandboxed command runner:
//   - filtering of forbidden env vars
//   - timeout behaviour
//   - stdout/stderr size caps
//   - dry-run mode
// ============================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runSandboxed, type SandboxOptions } from '../sandbox';

const originalEnv = { ...process.env };

beforeEach(() => {
  // Clear all forbidden env vars
  delete process.env.OPENAI_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.EVOLUTION_DRY_RUN;
});

afterEach(() => {
  // Restore env
  for (const k of Object.keys(process.env)) {
    if (!(k in originalEnv)) delete process.env[k];
  }
  for (const [k, v] of Object.entries(originalEnv)) {
    if (v !== undefined) process.env[k] = v;
  }
});

describe('sandbox — basic execution', () => {
  it('returns exitCode 0 for a successful command', async () => {
    const r = await runSandboxed('true', [], { timeoutMs: 5000 });
    expect(r.exitCode).toBe(0);
    expect(r.timedOut).toBe(false);
    expect(r.killed).toBe(false);
  });

  it('returns exitCode 1 for a failing command', async () => {
    const r = await runSandboxed('false', [], { timeoutMs: 5000 });
    expect(r.exitCode).toBe(1);
    expect(r.timedOut).toBe(false);
  });

  it('captures stdout', async () => {
    const r = await runSandboxed('echo', ['hello'], { timeoutMs: 5000 });
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain('hello');
  });

  it('captures stderr', async () => {
    const r = await runSandboxed('sh', ['-c', 'echo error >&2'], { timeoutMs: 5000 });
    expect(r.exitCode).toBe(0);
    expect(r.stderr).toContain('error');
  });

  it('respects cwd option', async () => {
    const r = await runSandboxed('pwd', [], { timeoutMs: 5000, cwd: '/tmp' });
    expect(r.exitCode).toBe(0);
    expect(r.stdout.trim()).toBe('/tmp');
  });
});

describe('sandbox — timeout', () => {
  it('kills a hanging process after timeout', async () => {
    const r = await runSandboxed('sleep', ['10'], { timeoutMs: 500 });
    expect(r.timedOut).toBe(true);
    expect(r.killed).toBe(true);
    // exitCode may be null or 137 (SIGKILL) depending on timing
    expect(r.exitCode === null || r.exitCode > 0).toBe(true);
  });
});

describe('sandbox — dry-run', () => {
  it('does not execute when EVOLUTION_DRY_RUN=1', async () => {
    process.env.EVOLUTION_DRY_RUN = '1';
    const r = await runSandboxed('echo', ['should-not-run'], { timeoutMs: 5000 });
    expect(r.exitCode).toBe(0);
    // Dry-run prefix tag
    expect(r.stdout).toContain('[dry-run]');
    // The actual command output is NOT present (process never ran)
    expect(r.stdout).not.toContain('\nshould-not-run\n');
    expect(r.stdout).not.toMatch(/^should-not-run$/m);
  });

  it('does not execute when dryRun=true option is set', async () => {
    const opts: SandboxOptions = { dryRun: true, timeoutMs: 5000 };
    const r = await runSandboxed('echo', ['nope'], opts);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain('[dry-run]');
    // The args appear in the dry-run banner but there's no actual echo output line
    expect(r.stdout).not.toMatch(/^nope$/m);
  });
});

describe('sandbox — env filtering', () => {
  it('does not pass OPENAI_API_KEY to child even if set on parent', async () => {
    process.env.OPENAI_API_KEY = 'sk-secret-value-123';
    const r = await runSandboxed('sh', ['-c', 'echo "$OPENAI_API_KEY"'], { timeoutMs: 5000 });
    expect(r.exitCode).toBe(0);
    // Child env should NOT contain the secret — output should be empty
    expect(r.stdout.trim()).toBe('');
  });

  it('does not pass FIREBASE_PRIVATE_KEY to child', async () => {
    process.env.FIREBASE_PRIVATE_KEY = '-----BEGIN PRIVATE KEY-----\nsensitive\n-----END PRIVATE KEY-----';
    const r = await runSandboxed('sh', ['-c', 'echo "$FIREBASE_PRIVATE_KEY"'], { timeoutMs: 5000 });
    expect(r.stdout.trim()).toBe('');
  });

  it('does not pass STRIPE_SECRET_KEY to child', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_live_xxx';
    const r = await runSandboxed('sh', ['-c', 'echo "$STRIPE_SECRET_KEY"'], { timeoutMs: 5000 });
    expect(r.stdout.trim()).toBe('');
  });

  it('always sets CI=1 and NEXT_TELEMETRY_DISABLED=1 in child', async () => {
    const r = await runSandboxed('sh', ['-c', 'echo "CI=$CI TEL=$NEXT_TELEMETRY_DISABLED"'], { timeoutMs: 5000 });
    expect(r.stdout).toContain('CI=1');
    expect(r.stdout).toContain('TEL=1');
  });

  it('passes through non-secret env vars', async () => {
    process.env.MY_HARMLESS_VAR = 'safe-value';
    const r = await runSandboxed('sh', ['-c', 'echo "$MY_HARMLESS_VAR"'], { timeoutMs: 5000 });
    expect(r.stdout.trim()).toBe('safe-value');
    delete process.env.MY_HARMLESS_VAR;
  });
});

describe('sandbox — size caps', () => {
  it('truncates stdout at maxStdoutBytes', async () => {
    const r = await runSandboxed('sh', ['-c', 'yes hello | head -c 100000'], {
      timeoutMs: 5000,
      maxStdoutBytes: 1024,
    });
    expect(r.stdout.length).toBeLessThanOrEqual(1100); // some slack for buffering
  });

  it('truncates stderr at maxStderrBytes', async () => {
    const r = await runSandboxed('sh', ['-c', 'yes err >&2 | head -c 100000'], {
      timeoutMs: 5000,
      maxStderrBytes: 1024,
    });
    expect(r.stderr.length).toBeLessThanOrEqual(1100);
  });
});

describe('sandbox — missing binary', () => {
  it('returns killed=true and exitCode=null when binary does not exist', async () => {
    const r = await runSandboxed('this-binary-does-not-exist-xyz', [], { timeoutMs: 5000 });
    expect(r.killed).toBe(true);
    expect(r.exitCode === null || r.exitCode > 0).toBe(true);
  });
});
