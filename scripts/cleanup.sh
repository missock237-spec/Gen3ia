#!/bin/bash
# ============================================================
# Gen3ia — Nettoyage des fichiers résiduels
# Supprime les artefacts de migration, notes de travail,
# doublons de workflows, et fichiers temporaires.
# ============================================================

set -e

echo "🧹 Nettoyage des fichiers résiduels Gen3ia..."
echo ""

# === 1. Doublons de workflows GitHub (les originaux sont dans .github/workflows/) ===

WORKFLOW_FILES=(
  ".github-gen3ia-ci.yml"
  ".github-gen3ia-deploy.yml"
  ".github-gen3ia-issues.yml"
  ".github-gen3ia-refresh-tokens.yml"
  "ci.yml"
  "ci-workflow.yml"
  "deploy.yml"
  "deploy-workflow.yml"
  "deploy-new.yml"
  "issues.yml"
  "refresh-tokens-workflow.yml"
  "refresh-tokens.yml"
  "release.yml"
)

for file in "${WORKFLOW_FILES[@]}"; do
  if [ -f "$file" ]; then
    echo "   Suppression: $file (doublon de .github/workflows/)"
    git rm "$file"
  fi
done

# === 2. Notes de travail *_FIX.md → archive dans docs/archive/ ===

FIX_FILES=(
  "CI_FIX.md"
  "FIX_REPORT.md"
  "SECURITY_FIXES.md"
  "WORKFLOWS_FIX.md"
)

for file in "${FIX_FILES[@]}"; do
  if [ -f "$file" ]; then
    echo "   Archivage: $file → docs/archive/$file"
    git mv "$file" "docs/archive/$file"
  fi
done

# === 3. Fichiers temporaires _* ===

TEMP_FILES=(
  "_add_to_schema.txt"
  "_code_project_schema.txt"
  "_oauth_schema_addition.txt"
  "_refresh_tokens_workflow.yml"
  "_services_300_list.txt"
  "test-force-push.txt"
)

for file in "${TEMP_FILES[@]}"; do
  if [ -f "$file" ]; then
    echo "   Suppression: $file (fichier temporaire)"
    git rm "$file"
  fi
done

# === 4. Scripts vides / artefacts ===

EMPTY_FILES=(
  "generate_audit_pdf.py"
  "keep-nextjs-alive.sh"
  "package-lock.json"
)

for file in "${EMPTY_FILES[@]}"; do
  if [ -f "$file" ]; then
    echo "   Suppression: $file (fichier vide)"
    git rm "$file"
  fi
done

# === 5. Fichiers de configuration obsolètes ===

OBSOLETE_FILES=(
  "bun.lock"
  "next-server.pid"
  "Caddyfile"
  "Cargo.toml"
)

for file in "${OBSOLETE_FILES[@]}"; do
  if [ -f "$file" ]; then
    echo "   Suppression: $file (obsolète)"
    git rm "$file"
  fi
done

# === 6. Dossier crates/ (Rust, non utilisé) ===

if [ -d "crates" ]; then
  echo "   Suppression: crates/ (projet Rust non utilisé)"
  git rm -rf crates/
fi

echo ""
echo "✅ Nettoyage terminé !"
echo ""
echo "📊 Résumé:"
echo "   Fichiers supprimés : $(git diff --cached --name-only | wc -l)"
echo "   Fichiers archivés  : ${#FIX_FILES[@]} dans docs/archive/"
echo ""
echo "📋 Actions manuelles si nécessaire:"
echo "   git commit -m 'chore(cleanup): supprimer fichiers résiduels et archiver notes'"
echo "   git push"
