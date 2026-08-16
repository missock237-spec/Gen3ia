#!/bin/bash
# ============================================================
# GIT HISTORY CLEANUP — Nettoyage de l'historique Git
# Supprime secrets, fichiers volumineux, et branches mortes
# Issue #168
# ============================================================
# ATTENTION: Ce script réécrit l'historique. À utiliser avec précaution.
# Faire un backup avant: git clone --mirror <repo> backup.git
# ============================================================

set -euo pipefail

# Couleurs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log()  { echo -e "${GREEN}[$(date +%H:%M:%S)]${NC} $1"; }
warn() { echo -e "${YELLOW}[$(date +%H:%M:%S)] WARN:${NC} $1"; }
err()  { echo -e "${RED}[$(date +%H:%M:%S)] ERROR:${NC} $1"; }
info() { echo -e "${BLUE}[$(date +%H:%M:%S)] INFO:${NC} $1"; }

# ---- Vérifications préliminaires ----
log "🔍 Vérifications préliminaires..."

if [ ! -d ".git" ]; then
  err "Pas un dépôt Git. Abandon."
  exit 1
fi

# Vérifier qu'on est sur main
BRANCH=$(git branch --show-current)
if [ "$BRANCH" != "main" ] && [ "$BRANCH" != "master" ]; then
  warn "Sur branche '$BRANCH'. Recommandé: main/master. Continuer? (y/N)"
  read -r confirm
  [ "$confirm" = "y" ] || exit 0
fi

# Vérifier working tree propre
if [ -n "$(git status --porcelain)" ]; then
  err "Working tree non propre. Committez ou stash avant."
  exit 1
fi

log "✅ Working tree propre sur $BRANCH"

# ---- Backup ----
BACKUP_DIR="../gen3ia-backup-$(date +%Y%m%d-%H%M%S).git"
log "📦 Création du backup mirror: $BACKUP_DIR"
git clone --mirror . "$BACKUP_DIR" 2>/dev/null || warn "Backup mirror échoué — assurez-vous d'avoir un backup externe"

# ---- Détection des secrets dans l'historique ----
log "🔍 Détection de secrets dans l'historique..."

SECRETS_FOUND=0
SECRET_PATTERNS=(
  'VAULT_MASTER_KEY=[a-f0-9]{64}'
  'JWT_SECRET=[^\s]{20,}'
  'OPENAI_API_KEY=sk-[a-zA-Z0-9]{20,}'
  'ANTHROPIC_API_KEY=sk-ant-[a-zA-Z0-9]{20,}'
  'GITHUB_TOKEN=[a-zA-Z0-9_]{36,}'
  'STRIPE_SECRET_KEY=sk_live_[a-zA-Z0-9]{20,}'
  'STRIPE_SECRET_KEY=sk_test_[a-zA-Z0-9]{20,}'
  'password.*=.*[^\s]{8,}'
  'secret.*=.*[^\s]{8,}'
  'token.*=.*[a-zA-Z0-9]{20,}'
)

for pattern in "${SECRET_PATTERNS[@]}"; do
  matches=$(git log -p --all 2>/dev/null | grep -iE "$pattern" | head -5 || true)
  if [ -n "$matches" ]; then
    warn "Pattern trouvé: $pattern"
    echo "$matches" | head -3
    SECRETS_FOUND=$((SECRETS_FOUND + 1))
  fi
done

if [ $SECRETS_FOUND -eq 0 ]; then
  log "✅ Aucun secret détecté dans l'historique"
else
  warn "$SECRETS_FOUND pattern(s) de secret(s) détecté(s) dans l'historique"
fi

# ---- Détection des gros fichiers ----
log "🔍 Recherche des fichiers volumineux dans l'historique..."
git rev-list --objects --all 2>/dev/null | \
  git cat-file --batch-check='%(objecttype) %(objectname) %(objectsize) %(rest)' 2>/dev/null | \
  awk '/^blob/ {if ($3 > 1048576) print $3, $4}' | \
  sort -rn | head -10 | while read size file; do
    mb=$(echo "scale=2; $size/1048576" | bc 2>/dev/null || echo "?")
    warn "Gros fichier: $file (${mb}MB)"
  done

# ---- Menu ----
echo ""
echo "═══════════════════════════════════════════════"
echo "  NETTOYAGE HISTORIQUE GIT — Sélectionnez"
echo "═══════════════════════════════════════════════"
echo ""
echo "1) Supprimer .env de l'historique (tous les commits)"
echo "2) Supprimer un fichier/dossier spécifique de l'historique"
echo "3) Supprimer les secrets détectés (git filter-branch)"
echo "4) Squasher les N derniers commits en un seul"
echo "5) Supprimer les branches mergées"
echo "6) Expire et prune le reflog + GC"
echo "7) Tout faire (1,5,6)"
echo "8) Quitter"
echo ""
read -p "Choix [1-8]: " choice

case $choice in
  1)
    log "🗑️  Suppression de .env et .env.* de l'historique..."
    if [ -f "git-filter-repo" ] || command -v git-filter-repo &>/dev/null; then
      git filter-repo --invert-paths --path .env --path .env.production --path .env.local --path .env.development --force
    else
      warn "git-filter-repo non installé. Utilisation de git filter-branch (plus lent)."
      FILTER_BRANCH_SQUELCH_WARNING=1 git filter-branch --force --index-filter \
        'git rm --cached --ignore-unmatch .env .env.production .env.local .env.development' \
        --prune-empty --tag-name-filter cat -- --all
    fi
    log "✅ .env supprimé de l'historique"
    ;;

  2)
    read -p "Chemin du fichier/dossier à supprimer: " filepath
    [ -z "$filepath" ] && err "Chemin manquant" && exit 1
    log "🗑️  Suppression de '$filepath' de l'historique..."
    FILTER_BRANCH_SQUELCH_WARNING=1 git filter-branch --force --index-filter \
      "git rm --cached --ignore-unmatch -r '$filepath'" \
      --prune-empty --tag-name-filter cat -- --all
    log "✅ '$filepath' supprimé de l'historique"
    ;;

  3)
    log "🔧 Suppression des secrets avec filter-branch..."
    for pattern in "${SECRET_PATTERNS[@]}"; do
      FILTER_BRANCH_SQUELCH_WARNING=1 git filter-branch --force --tree-filter \
        "sed -i 's/$pattern/[REDACTED]/g' .env .env.* 2>/dev/null || true" \
        --prune-empty --tag-name-filter cat -- --all 2>/dev/null || true
    done
    log "✅ Secrets redactés dans l'historique"
    ;;

  4)
    read -p "Nombre de commits à squasher: " n
    [ -z "$n" ] && err "Nombre manquant" && exit 1
    log "📦 Squash des $n derniers commits..."
    git reset --soft HEAD~$n
    git commit -m "chore: squash $n commits (history cleanup #168)"
    log "✅ $n commits squashed"
    ;;

  5)
    log "🧹 Suppression des branches mergées..."
    git branch --merged | grep -v "^\*\|main\|master" | xargs -r git branch -d 2>/dev/null || true
    # Branches distantes mergées
    git fetch --prune 2>/dev/null || true
    git branch -r --merged | grep -v "main\|master" | sed 's/origin\///' | \
      xargs -I{} git push origin :{} 2>/dev/null || warn "Certaines branches distantes n'ont pas pu être supprimées"
    log "✅ Branches mergées supprimées"
    ;;

  6)
    log "♻️  Expiration reflog + GC agressif..."
    git reflog expire --expire=now --all
    git gc --prune=now --aggressive
    log "✅ Reflog expiré et GC agressif terminé"
    ;;

  7)
    log "🚀 Nettoyage complet..."
    # 1. Remove .env from history
    FILTER_BRANCH_SQUELCH_WARNING=1 git filter-branch --force --index-filter \
      'git rm --cached --ignore-unmatch .env .env.production .env.local .env.development' \
      --prune-empty --tag-name-filter cat -- --all
    log "✅ .env supprimé"
    # 2. Delete merged branches
    git branch --merged | grep -v "^\*\|main\|master" | xargs -r git branch -d 2>/dev/null || true
    log "✅ Branches mergées supprimées"
    # 3. Expire reflog + GC
    git reflog expire --expire=now --all
    git gc --prune=now --aggressive
    log "✅ Reflog + GC terminé"
    ;;

  8)
    log "👋 Abandon"
    exit 0
    ;;

  *)
    err "Choix invalide"
    exit 1
    ;;
esac

# ---- Post-cleanup ----
echo ""
log "═══════════════════════════════════════════════"
log "✅ Nettoyage terminé"
log "═══════════════════════════════════════════════"
echo ""
info "Backup: $BACKUP_DIR"
info "Pour pousser le nettoyage: git push --force-with-lease origin $BRANCH"
info "Pour restaurer en cas de problème: git push --force $BACKUP_DIR"
echo ""
warn "⚠️  AVERTISSEMENTS:"
warn "  1. Force push réécrit l'historique — coordonnez avec l'équipe"
warn "  2. Les collaborateurs doivent re-clone le repo"
warn "  3. Le backup mirror est dans: $BACKUP_DIR"
warn "  4. Tournez les clés si des secrets ont été trouvés"
echo ""
log "Pour la rotation des clés, utilisez: npm run rotate-keys"
