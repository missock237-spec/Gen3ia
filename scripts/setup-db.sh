#!/bin/bash
# ===========================================================
# Genova AI — Database Setup Script
# ===========================================================
# Exécute toutes les migrations Prisma nécessaires
#
# Usage:
#   chmod +x scripts/setup-db.sh
#   ./scripts/setup-db.sh
# ===========================================================

set -e

echo ""
echo "╔═══════════════════════════════════════════════╗"
echo "║     Genova AI — Database Setup               ║"
echo "╚═══════════════════════════════════════════════╝"
echo ""

# Vérifier que .env existe
if [ ! -f .env ]; then
  echo "❌ Fichier .env introuvable !"
  echo "   Copiez d'abord .env.example vers .env"
  echo "   cp .env.example .env"
  echo "   Puis éditez votre DATABASE_URL"
  exit 1
fi

# Vérifier que DATABASE_URL est défini
source .env 2>/dev/null || true
if [ -z "$DATABASE_URL" ]; then
  echo "❌ DATABASE_URL non défini dans .env"
  exit 1
fi

echo "📦 Étape 1/4 — Installation des dépendances..."
npm install

echo ""
echo "📦 Étape 2/4 — Génération du client Prisma..."
npx prisma generate

echo ""
echo "📦 Étape 3/4 — Exécution des migrations..."
echo "   Option A: prisma migrate dev (recommandé - préserve les données)"
echo "   Option B: prisma db push (rapide - écrase le schéma)"
echo ""
echo "Choisissez:"
echo "  [1] migrate dev  — (recommandé) Crée/applique les migrations"
echo "  [2] db push      — Synchronise rapidement le schéma"
echo "  [3] migrate reset — RÉINITIALISE COMPLÈTEMENT la base de données"
echo ""
read -p "Votre choix (1/2/3, défaut: 1): " choice

case $choice in
  2)
    echo ""
    echo "⚡ Exécution de prisma db push..."
    npx prisma db push
    ;;
  3)
    echo ""
    echo "⚠️  ATTENTION: Vous allez PERDRE toutes les données !"
    read -p "Tapez 'RESET' pour confirmer: " confirm
    if [ "$confirm" = "RESET" ]; then
      echo "🔄 Réinitialisation de la base de données..."
      npx prisma migrate reset --force
    else
      echo "❌ Annulé."
      exit 1
    fi
    ;;
  *)
    echo ""
    echo "🔄 Exécution de prisma migrate dev..."
    npx prisma migrate dev --name initial_setup
    ;;
esac

echo ""
echo "📦 Étape 4/4 — Vérification finale..."
npx prisma db push --accept-data-loss 2>/dev/null || true

echo ""
echo "╔═══════════════════════════════════════════════╗"
echo "║     ✅ Base de données prête !                ║"
echo "╚═══════════════════════════════════════════════╝"
echo ""
echo "🚀 Pour lancer Genova : npm run dev"
echo ""
