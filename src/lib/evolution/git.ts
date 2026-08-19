// ============================================================
// Gen3ia Evolution Engine — Git integration
// ============================================================
// Wraps `git` CLI calls in the sandboxed runner to:
//   - create/switch branches
//   - stage and commit changes
//   - push to origin (with refspec)
//   - create PRs via GitHub REST API
//   - revert merges (rollback)
//
// All commands run through `runSandboxed` — no secrets leak,
// hard timeout enforced. GitHub token comes from
// `EVOLUTION_GITHUB_TOKEN` env var (never hardcoded).
// ============================================================

import { createLogger } from '@/lib/logger';
import { getEvolutionEnv, EVOLUTION_BRANCH_PREFIX } from './config';
import { runChecked, type SandboxOptions } from './sandbox';
import type { FileChange } from './types';

const log = createLogger('evolution-git');

interface GitResult {
  ok: boolean;
  stdout: string;
  stderr: string;
}

async function git(args: string[], opts?: SandboxOptions): Promise<GitResult> {
  const r = await runChecked('git', args, {
    cwd: process.cwd(),
    timeoutMs: 60 * 1000, // 60s per git op
    ...opts,
  });
  return {
    ok: r.exitCode === 0 && !r.timedOut,
    stdout: r.stdout,
    stderr: r.stderr,
  };
}

// ----- Branch operations -----

export async function getCurrentBranch(): Promise<string> {
  const r = await git(['rev-parse', '--abbrev-ref', 'HEAD']);
  if (!r.ok) throw new Error(`git getCurrentBranch failed: ${r.stderr}`);
  return r.stdout.trim();
}

export async function isCleanWorkingTree(): Promise<boolean> {
  const r = await git(['status', '--porcelain']);
  if (!r.ok) return false;
  return r.stdout.trim().length === 0;
}

export async function ensureBranchFromTarget(
  branchName: string,
  targetBranch: string
): Promise<void> {
  // Fetch latest target
  const fetched = await git(['fetch', 'origin', targetBranch]);
  if (!fetched.ok) {
    log.warn('fetch target failed (offline?)', { targetBranch, stderr: fetched.stderr });
  }
  // Check if branch already exists
  const exists = await git(['rev-parse', '--verify', `refs/heads/${branchName}`]);
  if (exists.ok) {
    await git(['checkout', branchName]);
    return;
  }
  // Create from origin/targetBranch
  const r = await git(['checkout', '-b', branchName, `origin/${targetBranch}`]);
  if (!r.ok) {
    // Fall back: create from HEAD
    const r2 = await git(['checkout', '-b', branchName]);
    if (!r2.ok) {
      throw new Error(`git branch creation failed: ${r2.stderr}`);
    }
  }
}

export async function stageAll(): Promise<void> {
  const r = await git(['add', '-A']);
  if (!r.ok) throw new Error(`git add failed: ${r.stderr}`);
}

export async function stagePath(p: string): Promise<void> {
  const r = await git(['add', p]);
  if (!r.ok) throw new Error(`git add ${p} failed: ${r.stderr}`);
}

export async function commit(message: string, body?: string): Promise<string> {
  const args = ['-c', 'user.name=Gen3ia Evolution', '-c', 'user.email=evolution@gen3ia.local', 'commit', '-m', message];
  if (body) args.push('-m', body);
  const r = await git(args);
  if (!r.ok) {
    if (r.stderr.includes('nothing to commit')) {
      log.info('nothing to commit', { message });
      return '';
    }
    throw new Error(`git commit failed: ${r.stderr}`);
  }
  const head = await git(['rev-parse', 'HEAD']);
  if (!head.ok) throw new Error(`git rev-parse HEAD failed: ${head.stderr}`);
  return head.stdout.trim();
}

export async function pushBranch(branch: string, force = false): Promise<void> {
  const args = ['push', 'origin', branch];
  if (force) args.push('--force-with-lease');
  const r = await git(args, { timeoutMs: 120 * 1000 });
  if (!r.ok) throw new Error(`git push failed: ${r.stderr}`);
}

export async function getHeadSha(branch?: string): Promise<string> {
  const args = ['rev-parse', 'HEAD'];
  if (branch) args[1] = `refs/heads/${branch}`;
  const r = await git(args);
  if (!r.ok) throw new Error(`git rev-parse failed: ${r.stderr}`);
  return r.stdout.trim();
}

export async function getDiffStat(): Promise<string> {
  const r = await git(['diff', '--stat', 'HEAD']);
  if (!r.ok) return '';
  return r.stdout;
}

// ----- Apply file changes (via heredoc / patch) -----

/**
 * Apply a list of FileChange to the working tree.
 * Returns the list of paths actually modified.
 */
export async function applyFileChanges(changes: FileChange[]): Promise<string[]> {
  const modifiedPaths: string[] = [];
  for (const change of changes) {
    if (change.action === 'delete') {
      const r = await git(['rm', '-f', change.path]);
      if (!r.ok) {
        log.warn('git rm failed', { path: change.path, stderr: r.stderr });
        // Try filesystem delete
        try {
          const fs = await import('node:fs/promises');
          await fs.unlink(change.path);
        } catch {
          // ignore
        }
      }
      modifiedPaths.push(change.path);
      continue;
    }

    if (change.action === 'create' && change.content !== undefined) {
      const fs = await import('node:fs/promises');
      const path = await import('node:path');
      await fs.mkdir(path.dirname(change.path), { recursive: true });
      await fs.writeFile(change.path, change.content, 'utf8');
      await stagePath(change.path);
      modifiedPaths.push(change.path);
      continue;
    }

    if (change.action === 'modify' && change.diff !== undefined) {
      // Use `git apply` for unified diff.
      const { runSandboxed } = await import('./sandbox');
      const r = await runSandboxed('git', ['apply', '--whitespace=nowarn', '-'], {
        cwd: process.cwd(),
        timeoutMs: 30 * 1000,
      });
      // Pipe diff via stdin is not directly supported; write to a temp file.
      const fs = await import('node:fs/promises');
      const os = await import('node:os');
      const tmpFile = `${os.tmpdir()}/evo-patch-${Date.now()}.diff`;
      await fs.writeFile(tmpFile, change.diff, 'utf8');
      const r2 = await runSandboxed('git', ['apply', '--whitespace=nowarn', tmpFile], {
        cwd: process.cwd(),
        timeoutMs: 30 * 1000,
      });
      await fs.unlink(tmpFile).catch(() => undefined);
      // Suppress r by referencing it (it's the unused first attempt)
      void r;
      if (r2.exitCode !== 0) {
        throw new Error(`git apply failed for ${change.path}: ${r2.stderr}`);
      }
      await stagePath(change.path);
      modifiedPaths.push(change.path);
      continue;
    }

    if (change.action === 'modify' && change.content !== undefined) {
      const fs = await import('node:fs/promises');
      await fs.writeFile(change.path, change.content, 'utf8');
      await stagePath(change.path);
      modifiedPaths.push(change.path);
      continue;
    }
  }
  return modifiedPaths;
}

// ----- GitHub PR via REST API -----

export interface CreatePROptions {
  branchName: string;
  targetBranch: string;
  title: string;
  body: string;
}

export interface CreatePRResult {
  number: number;
  url: string;
}

export async function createPullRequest(opts: CreatePROptions): Promise<CreatePRResult> {
  const env = getEvolutionEnv();
  const token = env.EVOLUTION_GITHUB_TOKEN ?? process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  if (!token) {
    throw new Error('EVOLUTION_GITHUB_TOKEN is not set — cannot open PR');
  }
  const owner = env.EVOLUTION_GITHUB_OWNER ?? process.env.GITHUB_REPOSITORY_OWNER;
  const repo = env.EVOLUTION_GITHUB_REPO ?? (process.env.GITHUB_REPOSITORY?.split('/')[1] ?? 'Gen3ia');
  if (!owner) {
    throw new Error('EVOLUTION_GITHUB_OWNER is not set — cannot open PR');
  }

  const url = `https://api.github.com/repos/${owner}/${repo}/pulls`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      'User-Agent': 'gen3ia-evolution-engine',
    },
    body: JSON.stringify({
      title: opts.title,
      head: opts.branchName,
      base: opts.targetBranch,
      body: opts.body,
      draft: false,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub PR API ${res.status}: ${text}`);
  }

  const json = (await res.json()) as { number: number; html_url: string };
  return {
    number: json.number,
    url: json.html_url,
  };
}

// ----- Merge PR -----

export async function mergePullRequest(prNumber: number, method: 'merge' | 'squash' | 'rebase' = 'squash'): Promise<void> {
  const env = getEvolutionEnv();
  const token = env.EVOLUTION_GITHUB_TOKEN ?? process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  if (!token) throw new Error('EVOLUTION_GITHUB_TOKEN missing');
  const owner = env.EVOLUTION_GITHUB_OWNER ?? process.env.GITHUB_REPOSITORY_OWNER;
  const repo = env.EVOLUTION_GITHUB_REPO ?? (process.env.GITHUB_REPOSITORY?.split('/')[1] ?? 'Gen3ia');
  if (!owner) throw new Error('EVOLUTION_GITHUB_OWNER missing');

  const url = `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}/merge`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      'User-Agent': 'gen3ia-evolution-engine',
    },
    body: JSON.stringify({ merge_method: method }),
  });
  if (!res.ok && res.status !== 409) {
    // 409 = already merged
    const text = await res.text();
    throw new Error(`GitHub merge API ${res.status}: ${text}`);
  }
}

// ----- Revert (rollback) -----

export async function revertMergeCommit(mergeSha: string, branchName: string): Promise<string> {
  // Use `git revert -m 1` for a merge commit
  const r = await git(['revert', '-m', '1', '--no-edit', mergeSha], { timeoutMs: 60 * 1000 });
  if (!r.ok) {
    // Abort on conflict
    await git(['revert', '--abort']);
    throw new Error(`git revert failed: ${r.stderr}`);
  }
  const head = await git(['rev-parse', 'HEAD']);
  if (!head.ok) throw new Error(`git rev-parse HEAD failed: ${head.stderr}`);
  await pushBranch(branchName, false);
  return head.stdout.trim();
}

// ----- Branch name helper -----

export function makeEvolutionBranchName(scope: string, motivationSlug: string): string {
  const date = new Date().toISOString().slice(0, 10);
  const safeSlug = motivationSlug
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return `${EVOLUTION_BRANCH_PREFIX}${date}-${scope.replace(/[^a-z0-9]+/g, '-').toLowerCase()}-${safeSlug || 'run'}`;
}
