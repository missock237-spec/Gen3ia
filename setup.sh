#!/bin/bash
# ============================================================
# Gen3ia — Script de configuration et test local
# Usage: bash setup.sh
# ============================================================
set -e

echo "============================================"
echo " Gen3ia — Setup & Test Local"
echo "============================================"

# 1. Installer les dependances
echo ""
echo "[1/5] Installation des dependances..."
npm install

# 2. Generer Prisma Client
echo ""
echo "[2/5] Generation Prisma Client..."
npx prisma generate

# 3. Build Next.js
echo ""
echo "[3/5] Build Next.js..."
npm run build

# 4. Build Worker (TypeScript -> JavaScript)
echo ""
echo "[4/5] Build Worker..."
npm run build:worker

# 5. Verifications
echo ""
echo "[5/5] Verifications..."

echo ""
echo "--- Next.js ---"
if [ -f .next/standalone/server.js ]; then
  echo "  ✅ .next/standalone/server.js trouve"
else
  echo "  ❌ .next/standalone/server.js manquant"
fi

echo ""
echo "--- Worker ---"
if [ -f dist/worker/workers/auto-worker.js ]; then
  echo "  ✅ dist/worker/workers/auto-worker.js trouve"
  # Verifier que les alias @/* sont resolus
  if grep -q "require('../lib/" dist/worker/workers/auto-worker.js 2>/dev/null; then
    echo "  ✅ Alias @/* correctement resolus par tsc-alias"
  else
    echo "  ⚠️  Verifier que tsc-alias a bien resolu les alias"
    grep "require.*@/" dist/worker/workers/auto-worker.js 2>/dev/null && echo "  ❌ Alias @/* NON resolus" || echo "  ✅ Alias propres"
  fi
else
  echo "  ❌ dist/worker/workers/auto-worker.js manquant"
fi

echo ""
echo "--- Docker Compose ---"
if command -v docker &> /dev/null; then
  echo "  ✅ Docker disponible"
  echo "  ▶️  Lancez: docker compose up --build -d"
else
  echo "  ⚠️  Docker non installe"
fi

echo ""
echo "============================================"
echo " Setup termine !"
echo "============================================"
