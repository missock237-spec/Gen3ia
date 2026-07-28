#!/bin/bash
# ============================================================
# Gen3ia — Script de nettoyage complet
# Supprime les fichiers temporaires, renomme les restes Genova,
# et prepare la structure monorepo
#
# Usage: bash scripts/cleanup.sh
# ============================================================
set -e

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo ""
echo "🧹 Gen3ia — Nettoyage du projet"
echo "================================"
echo ""

# === 1. Fichiers temporaires à la racine ===
echo "[1/6] Suppression des fichiers temporaires..."
FILES_TO_DELETE=(
  "ci.yml"
  "deploy.yml"
  "refresh-tokens.yml"
  "issues.yml"
  "ci-workflow.yml"
  "deploy-workflow.yml"
  "refresh-tokens-workflow.yml"
  "test-force-push.txt"
  ".github-gen3ia-ci.yml"
  ".github-gen3ia-deploy.yml"
  ".github-gen3ia-refresh-tokens.yml"
  ".github-gen3ia-issues.yml"
)
for f in "${FILES_TO_DELETE[@]}"; do
  if [ -f "$f" ]; then
    git rm "$f" 2>/dev/null || rm -f "$f"
    echo "  ✅ Supprime: $f"
  fi
done

# === 2. Anciens favicon Genova ===
echo "[2/6] Nettoyage des fichiers public/..."
if [ -f "public/favicon-genova.png" ]; then
  git rm "public/favicon-genova.png" 2>/dev/null || rm -f "public/favicon-genova.png"
  echo "  ✅ Supprime: public/favicon-genova.png"
fi

# === 3. Anciens workflows .github/ ===
echo "[3/6] Nettoyage des anciens workflows GitHub..."
if [ -f ".github/workflows/ci.yml" ]; then
  rm -f ".github/workflows/ci.yml"
  echo "  ✅ Supprime: .github/workflows/ci.yml"
fi
if [ -f ".github/workflows/deploy.yml" ]; then
  rm -f ".github/workflows/deploy.yml"
  echo "  ✅ Supprime: .github/workflows/deploy.yml"
fi
if [ -f ".github/workflows/issues.yml" ]; then
  rm -f ".github/workflows/issues.yml"
  echo "  ✅ Supprime: .github/workflows/issues.yml"
fi
if [ -f ".github/workflows/refresh-tokens.yml" ]; then
  rm -f ".github/workflows/refresh-tokens.yml"
  echo "  ✅ Supprime: .github/workflows/refresh-tokens.yml"
fi

# === 4. Déplacer les nouveaux workflows ===
echo "[4/6] Installation des nouveaux workflows..."
mkdir -p .github/workflows
WORKFLOW_FILES=(
  "ci.yml"
  "deploy.yml"
  "issues.yml"
  "refresh-tokens.yml"
)
WORKFLOW_NAMES=(
  "ci"
  "deploy"
  "issues"
  "refresh-tokens"
)
for i in "${!WORKFLOW_FILES[@]}"; do
  src=".github-gen3ia-${WORKFLOW_NAMES[$i]}.yml"
  dst=".github/workflows/${WORKFLOW_FILES[$i]}"
  if [ -f "$src" ]; then
    mv "$src" "$dst"
    git add "$dst"
    echo "  ✅ Deplace: $src -> $dst"
  fi
done

# === 5. Renommer favicon si nécessaire ===
echo "[5/6] Verification favicon..."
if [ -f "public/favicon-gen3ia.png" ]; then
  echo "  ✅ favicon-gen3ia.png present"
else
  # Copier l'ancien favicon vers le nouveau nom
  if [ -f "public/favicon-genova.png" ]; then
    cp "public/favicon-genova.png" "public/favicon-gen3ia.png"
    git add "public/favicon-gen3ia.png"
    echo "  ✅ Cree: public/favicon-gen3ia.png"
  fi
fi

# === 6. Nettoyage package.json ===
echo "[6/6] Verification package.json..."
if grep -q "genova-ai" package.json; then
  echo "  ⚠️  package.json contient encore 'genova-ai' — correction manuelle necessaire"
else
  echo "  ✅ package.json OK"
fi

echo ""
echo "✨ Nettoyage termine !"
echo ""
echo "Prochaines etapes:"
echo "  git add -A"
echo "  git commit -m \"chore: cleanup temp files and migrate to monorepo\""
echo "  git push origin main"
echo ""
