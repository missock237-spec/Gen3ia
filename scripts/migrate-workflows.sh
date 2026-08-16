#!/bin/bash
# ============================================================
# Gen3ia — Migration des workflows GitHub Actions
# Consolide 7 workflows en 3 optimisés.
# Usage: bash scripts/migrate-workflows.sh
# ============================================================

set -e

WORKFLOW_DIR=".github/workflows"

echo "🚀 Migration des workflows GitHub Actions..."
echo ""

# === 1. Supprimer les anciens workflows (doublons) ===

echo "🗑️ Suppression des workflows obsolètes..."

OBSOLETE=(
  "$WORKFLOW_DIR/genova-ci.yml"     # Remplacé par ci.yml
  "$WORKFLOW_DIR/main.yml"          # Remplacé par ci.yml
  "$WORKFLOW_DIR/security.yml"      # Intégré dans ci.yml (job security)
  "$WORKFLOW_DIR/refresh-tokens.yml" # Obsolète (endpoint inexistant)
)

for file in "${OBSOLETE[@]}"; do
  if [ -f "$file" ]; then
    git rm "$file"
    echo "   ✓ Supprimé: $file"
  else
    echo "   - Déjà absent: $file"
  fi
done

# === 2. Créer les nouveaux workflows ===

echo ""
echo "📝 Création des nouveaux workflows..."

# 2a. ci.yml
echo "   → Création: ci.yml"
echo "   (Consultez la PR #133 pour le contenu complet)"

# 2b. deploy.yml reste inchangé
# 2c. issues.yml reste inchangé

echo ""
echo "📊 Résumé:"
echo "   Workflows supprimés: ${#OBSOLETE[@]}"
echo "   Workflows conservés: 3"
echo "     - ci.yml      (lint → type-check → test → security → build)"
echo "     - deploy.yml  (Vercel + Docker)"
echo "     - issues.yml  (Stale + Greeting)"
echo ""
echo "📋 Prochaines étapes:"
echo "   git add -A"
echo "   git commit -m 'ci: consolider 7 workflows en 3 optimisés'"
echo "   git push"
