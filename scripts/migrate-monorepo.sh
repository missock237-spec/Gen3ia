#!/bin/bash
# ============================================================
# Gen3ia — Monorepo Migration Script
# Deplace les fichiers vers la structure monorepo
# ============================================================
set -e

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo ""
echo " Gen3ia — Migration Monorepo"
echo "================================"
echo ""

# === 1. Creer les dossiers ===
echo "[1/6] Creation des dossiers..."
mkdir -p apps/web/src/{app,components,hooks,lib,services,workers,i18n}
mkdir -p apps/web/prisma
mkdir -p apps/web/public
mkdir -p apps/web/__tests__
mkdir -p packages/core/src/agent
mkdir -p packages/core/__tests__
mkdir -p packages/agent-safety/src

echo ""

# === 2. Copier le code source dans apps/web ===
echo "[2/6] Copie du code source vers apps/web..."

# Copier le dossier src complet
rsync -av --progress src/ apps/web/src/ \
  --exclude='__tests__/e2e' \
  --exclude='__tests__/security' 2>/dev/null || cp -r src/* apps/web/src/ 2>/dev/null

# Copier le dossier public
rsync -av --progress public/ apps/web/public/ 2>/dev/null || cp -r public/* apps/web/public/ 2>/dev/null

# Copier prisma
rsync -av --progress prisma/ apps/web/prisma/ 2>/dev/null || cp -r prisma/* apps/web/prisma/ 2>/dev/null

# Copier les tests
rsync -av --progress src/__tests__/ apps/web/__tests__/ 2>/dev/null || cp -r src/__tests__/* apps/web/__tests__/ 2>/dev/null

echo "  -> apps/web/src/  ($(find apps/web/src -type f | wc -l) fichiers)"
echo "  -> apps/web/public/"
echo "  -> apps/web/prisma/"
echo "  -> apps/web/__tests__/"

# === 3. Copier les librairies partagees dans packages/core ===
echo "[3/6] Copie des librairies partagees vers packages/core..."

cp -r src/lib/*.ts packages/core/src/ 2>/dev/null || true
# Creer le dossier agent dans core
cp -r src/lib/agent packages/core/src/ 2>/dev/null || true

echo "  -> packages/core/src/ ($(find packages/core/src -type f | wc -l) fichiers)"

# === 4. Copier le crate Rust dans packages/agent-safety ===
echo "[4/6] Migration du crate Rust vers packages/agent-safety..."

if [ -d "crates/agent-safety" ]; then
  cp -r crates/agent-safety/* packages/agent-safety/ 2>/dev/null || true
  echo "  -> packages/agent-safety/ ($(find packages/agent-safety -type f | wc -l) fichiers)"
else
  echo "  -> crates/agent-safety/ non trouve, creation du package"
fi

# === 5. Nettoyage des fichiers temporaires ===
echo "[5/6] Nettoyage des fichiers temporaires..."

TEMP_FILES=(
  "ci.yml" "deploy.yml" "refresh-tokens.yml" "issues.yml"
  "ci-workflow.yml" "deploy-workflow.yml" "refresh-tokens-workflow.yml"
  "test-force-push.txt" "release.yml"
  ".github-gen3ia-ci.yml" ".github-gen3ia-deploy.yml"
  ".github-gen3ia-refresh-tokens.yml" ".github-gen3ia-issues.yml"
)
for f in "${TEMP_FILES[@]}"; do
  if [ -f "$f" ]; then
    rm -f "$f" 2>/dev/null || true
    echo "  Supprime: $f"
  fi
done

# === 6. Installation ===
echo "[6/6] Installation des dependances..."
pnpm install 2>&1 | tail -5 || echo "  (pnpm non installe, utiliser npm a la place)"

echo ""
echo "================================"
echo " Migration terminee ! "
echo "================================"
echo ""
echo "Prochaines etapes :"
echo "  1. cd apps/web && cp ../../.env.example .env.local"
echo "  2. cd apps/web && npx prisma generate"
echo "  3. pnpm --filter @gen3ia/core build"
echo "  4. pnpm dev"
echo ""
echo "Workflows a deployer :"
echo "  mv .github-gen3ia-ci.yml .github/workflows/ci.yml"
echo "  mv .github-gen3ia-deploy.yml .github/workflows/deploy.yml"
echo "  mv .github-gen3ia-issues.yml .github/workflows/issues.yml"
echo "  mv .github-gen3ia-refresh-tokens.yml .github/workflows/refresh-tokens.yml"
echo ""
