#!/usr/bin/env python3
"""Force-push the locally-merged develop/* branches (T27). Safe car le merge
vient de main qui contient déjà tous les commits develop/ nécessaires."""
import subprocess
import sys

REPO = "/home/z/my-project/Gen3ia"
BRANCHES = ["develop/frontend", "develop/backend", "develop/services", "develop/ops", "develop/skills"]

def run(cmd, timeout=180):
    return subprocess.run(cmd, cwd=REPO, capture_output=True, text=True, timeout=timeout)

results = {}
for branch in BRANCHES:
    print(f"\n=== {branch} ===")
    r = run(["git", "checkout", branch])
    if r.returncode != 0:
        print(f"  checkout failed: {r.stderr[:200]}")
        results[branch] = f"checkout_failed"
        continue

    # Fetch latest from origin
    r = run(["git", "fetch", "origin", branch])
    # Check if local is ahead or behind
    r = run(["git", "rev-list", "--left-right", "--count", f"origin/{branch}...HEAD"])
    if r.returncode == 0:
        parts = r.stdout.split()
        if len(parts) == 2:
            behind, ahead = int(parts[0]), int(parts[1])
            print(f"  behind origin: {behind}, ahead of origin: {ahead}")
            if ahead > 0:
                # Local has commits not on remote — push with force-with-lease
                r = run(["git", "push", "--force-with-lease", "origin", branch])
                if r.returncode == 0:
                    print(f"  ✅ force-pushed")
                    results[branch] = "force_pushed"
                else:
                    print(f"  force-push failed: {r.stderr[:200]}")
                    results[branch] = f"force_push_failed"
                continue
            elif behind > 0:
                # Need to pull/rebase first
                r = run(["git", "pull", "--rebase", "origin", branch])
                if r.returncode != 0:
                    # Rebase failed — abort
                    run(["git", "rebase", "--abort"])
                    print(f"  rebase failed: {r.stderr[:200]}")
                    results[branch] = "rebase_failed"
                    continue
                # Then merge main again
                r = run(["git", "merge", "main", "--no-edit"])
                if r.returncode != 0:
                    run(["git", "merge", "--abort"])
                    print(f"  merge after rebase failed")
                    results[branch] = "merge_after_rebase_failed"
                    continue
                r = run(["git", "push", "origin", branch])
                if r.returncode == 0:
                    print(f"  ✅ pulled + merged + pushed")
                    results[branch] = "success"
                else:
                    print(f"  push failed: {r.stderr[:200]}")
                    results[branch] = "push_failed"
                continue
    # Default: try regular push
    r = run(["git", "push", "origin", branch])
    if r.returncode == 0:
        print(f"  ✅ pushed")
        results[branch] = "success"
    else:
        print(f"  push failed: {r.stderr[:200]}")
        results[branch] = f"push_failed"

run(["git", "checkout", "main"])
print(f"\n=== SUMMARY ===")
for b, r in results.items():
    print(f"  {b}: {r}")
