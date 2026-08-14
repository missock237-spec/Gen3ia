#!/usr/bin/env bash
# scan-prisma-usage.sh — Detect every file still depending on Prisma.
#
# Usage:
#   bash scan-prisma-usage.sh src            # scan ./src
#   bash scan-prisma-usage.sh packages/core  # scan a specific package
#   bash scan-prisma-usage.sh                # scan whole repo (excludes node_modules/dist/.next)
#
# Exit code 0 always — script is informational. Use it to drive the migration
# documented in PRISMA_FIRESTORE_MIGRATION.md.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="${1:-.}"
SCAN_DIR="$ROOT/$TARGET"

if [ ! -d "$SCAN_DIR" ]; then
  echo "✗ Target directory not found: $SCAN_DIR" >&2
  exit 1
fi

echo "═══════════════════════════════════════════════════════════════"
echo "  Prisma usage scan — $TARGET"
echo "═══════════════════════════════════════════════════════════════"
echo

# Heuristics — any of these means the file still uses Prisma:
#   1. import from '@prisma/client' or relative paths to prisma client
#   2. PrismaClient / prismaClient symbol usage
#   3. `prisma.` member access (the singleton client)
#   4. References to schema.prisma model names via Prisma.<Model> namespace
#   5. References to .prisma/client path
PATTERNS=(
  'from .@prisma/client'
  'from .*lib/prisma'
  'from .*lib/db'
  'PrismaClient'
  'prismaClient'
  '\bprisma\.'
  'Prisma\.[A-Z]'
  '\.prisma/client'
)

# Build a single ripgrep OR pattern
OR_PATTERN="$(IFS='|'; echo "${PATTERNS[*]}")"

echo "[1] Files still referencing Prisma (any pattern):"
echo "─────────────────────────────────────────────────"
mapfile -t HITS < <(rg -l --no-ignore-vcs --hidden \
  -g '!node_modules' -g '!dist' -g '!.next' -g '!*.lock' -g '!package-lock.json' \
  -g '*.ts' -g '*.tsx' -g '*.js' -g '*.mjs' \
  -e "$OR_PATTERN" "$SCAN_DIR" 2>/dev/null || true)

if [ ${#HITS[@]} -eq 0 ]; then
  echo "  ✓ No Prisma references found in $TARGET"
else
  printf '  %s\n' "${HITS[@]}" | sed "s|$ROOT/||"
fi
echo
echo "  Total: ${#HITS[@]} file(s)"
echo

echo "[2] Per-file pattern breakdown:"
echo "─────────────────────────────────────────────────"
for f in "${HITS[@]}"; do
  rel="${f#$ROOT/}"
  echo
  echo "  ● $rel"
  for p in "${PATTERNS[@]}"; do
    cnt=$(rg -c --no-ignore-vcs --hidden -g '!node_modules' -g '!dist' -g '!.next' \
      -e "$p" "$f" 2>/dev/null || echo 0)
    if [ "$cnt" -gt 0 ]; then
      printf '      %-40s %s match(es)\n' "$p" "$cnt"
    fi
  done
done

echo
echo "[3] Imports of @prisma/client (verbatim lines):"
echo "─────────────────────────────────────────────────"
rg --no-ignore-vcs --hidden -n \
  -g '!node_modules' -g '!dist' -g '!.next' -g '!package-lock.json' \
  -g '*.ts' -g '*.tsx' \
  -e "from ['\"]@prisma/client['\"]" \
  "$SCAN_DIR" 2>/dev/null | sed "s|$ROOT/||" || echo "  (none)"

echo
echo "[4] Imports of lib/prisma or lib/db (verbatim lines):"
echo "─────────────────────────────────────────────────"
rg --no-ignore-vcs --hidden -n \
  -g '!node_modules' -g '!dist' -g '!.next' \
  -g '*.ts' -g '*.tsx' \
  -e "from ['\"][^'\"]*lib/(prisma|db)['\"]" \
  "$SCAN_DIR" 2>/dev/null | sed "s|$ROOT/||" || echo "  (none)"

echo
echo "═══════════════════════════════════════════════════════════════"
echo "  Next step: migrate each file per PRISMA_FIRESTORE_MIGRATION.md"
echo "═══════════════════════════════════════════════════════════════"
