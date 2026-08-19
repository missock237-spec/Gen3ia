#!/usr/bin/env python3
"""Propagate T27 test-mock refactor from main to all develop/* branches.

For each branch:
  1. Checkout
  2. Merge main (--no-edit) — accept theirs on conflicts for the T27 files
  3. Push
  4. Restore main checkout at the end
"""
import subprocess
import sys
import json
import time

REPO = "/home/z/my-project/Gen3ia"
BRANCHES = ["develop/frontend", "develop/backend", "develop/services", "develop/ops", "develop/skills"]

# Fichiers T27 — en cas de conflit, on impose la version de main
T27_FILES = [
    "next.config.mjs",
    "package.json",
    "package-lock.json",
    "src/lib/admin.ts",
    "src/lib/agent-debug.ts",
    "src/lib/agent-i18n.ts",
    "src/lib/agent-memory-system.ts",
    "src/lib/agent-orchestrator.ts",
    "src/lib/agent-permissions.ts",
    "src/lib/avatars/avatar-session.ts",
    "src/lib/data-analyst.ts",
    "src/lib/devops/monitoring.ts",
    "src/lib/fluro-ai-client.ts",
    "src/lib/llm/gateway.ts",
    "src/lib/watchdog-agent.ts",
    "src/workers/auto-worker.ts",
    "src/app/api/route.ts",
    "src/app/api/playground/route.ts",
    "src/app/api/mcp",
    "src/app/studio/page.tsx",
    "src/app/(dashboard)/studio/code/page.tsx",
    "src/components/studio/",
    "src/lib/__stubs__/",
    "jest.setup.js",
    "packages/playground/",
]

def run(cmd, cwd=REPO, timeout=120, check=False):
    r = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, timeout=timeout)
    if check and r.returncode != 0:
        raise RuntimeError(f"{cmd} failed: {r.stderr[:500]}")
    return r

results = {}

for branch in BRANCHES:
    print(f"\n=== {branch} ===")
    r = run(["git", "checkout", branch])
    if r.returncode != 0:
        print(f"  checkout failed: {r.stderr[:200]}")
        results[branch] = "checkout_failed"
        continue

    # Reset any in-progress merge/cherry-pick
    run(["git", "merge", "--abort"], check=False)
    run(["git", "rebase", "--abort"], check=False)
    run(["git", "cherry-pick", "--abort"], check=False)

    # Merge main
    r = run(["git", "merge", "main", "--no-edit", "--no-ff"], timeout=180)
    if r.returncode != 0:
        print(f"  merge conflicts — resolving by accepting main version for T27 files")
        # For each T27 file, accept main's version
        for path in T27_FILES:
            run(["git", "checkout", "--theirs", path], check=False)
            run(["git", "add", path], check=False)
        # For other conflicts, also accept theirs (main)
        r_status = run(["git", "status", "--porcelain"])
        for line in r_status.stdout.split("\n"):
            if line.startswith("UU ") or line.startswith("AA "):
                path = line[3:].strip()
                run(["git", "checkout", "--theirs", path], check=False)
                run(["git", "add", path], check=False)
        # Try to complete merge
        r = run(["git", "merge", "--continue", "--no-edit"], timeout=60)
        if r.returncode != 0:
            print(f"  merge --continue failed: {r.stderr[:200]}")
            results[branch] = "merge_failed"
            run(["git", "merge", "--abort"], check=False)
            continue

    # Push
    r = run(["git", "push", "origin", branch], timeout=120)
    if r.returncode != 0:
        print(f"  push failed: {r.stderr[:200]}")
        results[branch] = f"push_failed: {r.stderr[:200]}"
        continue

    print(f"  ✅ merged + pushed")
    results[branch] = "success"

# Restore main checkout
run(["git", "checkout", "main"])

# Save results
with open(f"{REPO}/scripts/t27_merge_results.json", "w") as f:
    json.dump({"timestamp": int(time.time()), "results": results}, f, indent=2)

print(f"\n=== SUMMARY ===")
for b, r in results.items():
    print(f"  {b}: {r}")
