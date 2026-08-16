#!/usr/bin/env bash
set -euo pipefail

REPO="missock237-spec/Genova"
BRANCH="main"

echo "══════════════════════════════════════════════"
echo "  🚀 Déploiement Genova AI — Améliorations"
echo "══════════════════════════════════════════════"

command -v git >/dev/null 2>&1 || { echo "❌ git requis"; exit 1; }
command -v npm >/dev/null 2>&1 || { echo "❌ npm requis"; exit 1; }

echo "✅ git et npm disponibles"

if [ ! -d ".git" ]; then
  git init
  git remote add origin "https://github.com/${REPO}.git"
  git fetch origin
  git checkout -b "$BRANCH"
  git branch --set-upstream-to=origin/$BRANCH $BRANCH 2>/dev/null || true
fi

git add -A
git commit -m "feat: améliorations majeures - streaming LLM, tests E2E/OWASP, queue BullMQ, cache Redis, +23 index Prisma" || echo "⚠️ Rien à commit"
git push origin "$BRANCH" 2>&1

echo "══════════════════════════════════════════════"
echo "  ✅ Déploiement terminé !"
echo "══════════════════════════════════════════════"
