#!/usr/bin/env bash
# ============================================================
# Gen3ia — Script de configuration et test local (Monorepo)
# Usage: bash setup.sh            # installe, build, démarre Docker
#        bash setup.sh --skip-docker
# ============================================================
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

MODE="${1:-}"
STEP=0

log() { echo ""; echo "[$((++STEP))/5] $1"; }

# ------------------------------------------------------------
# Prérequis
# ------------------------------------------------------------
command -v node >/dev/null 2>&1 || { echo "❌ Node.js est requis (v18+)"; exit 1; }
command -v npm  >/dev/null 2>&1 || { echo "❌ npm est requis"; exit 1; }

echo "============================================"
echo " Gen3ia — Setup & Test Local (Monorepo)"
echo " Node:    $(node -v)"
echo " npm:     $(npm -v)"
echo "============================================"

# 1. Installer les dépendances à la racine (workspaces + apps)
log "1/5 Installation des dépendances (racine + workspaces)..."
npm install

# 2. Préparer l'environnement Firebase
log "2/5 Préparation de l'environnement Firebase..."
if [ ! -f .env.local ]; then
  cp .env.example .env.local
  echo "  📝 .env.local créé depuis .env.example — renseigner les variables FIREBASE_*"
else
  echo "  ✅ .env.local déjà présent"
fi

# 3. Builds : chaque package, puis l'application Next.js
log "3/5 Build des packages (workspaces) et de l'application..."
# Les packages internes (core, worker, agent-safety) doivent être buildés
# avant l'app pour que leurs exports compilés soient disponibles.
npm run build --workspaces --if-present
npm run build --if-present

# 4. Vérifications
log "4/5 Vérifications..."

echo "--- Next.js ---"
if [ -f .next/standalone/server.js ]; then
  echo "  ✅ .next/standalone/server.js trouvé"
else
  echo "  ⚠️  .next/standalone/server.js manquant (le standalone peut être désactivé en dev)"
fi

echo "--- Docker ---"
if command -v docker &>/dev/null && docker info &>/dev/null 2>&1; then
  echo "  ✅ Docker disponible"
else
  echo "  ⚠️  Docker indisponible"
fi

# 5. Démarrage des services (Docker Compose)
log "5/5 Démarrage des services (Redis, app, worker)..."

if [ "$MODE" = "--skip-docker" ]; then
  echo "  ⏭️  Démarrage Docker ignoré (--skip-docker)"
elif command -v docker &>/dev/null && docker info &>/dev/null 2>&1; then
  docker compose up --build -d
  echo "  ✅ docker compose up --build -d exécuté"
else
  echo "  ⚠️  Docker non disponible — services non démarrés"
  echo "      Lancez manuellement : docker compose up --build -d"
fi

echo ""
echo "============================================"
echo " Setup terminé !"
echo "  • Web app : http://localhost:3000"
echo "  • API     : http://localhost:3000/api"
echo "  • Émulateurs Firebase : npx firebase emulators:start"
echo "  • Pour arrêter : docker compose down"
echo "============================================"
