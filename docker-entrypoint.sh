#!/bin/sh
set -e

echo "[Gen3ia] Demarrage du conteneur..."
echo "[Gen3ia] NODE_ENV: ${NODE_ENV}"

# Attendre PostgreSQL
if [ -n "$DATABASE_URL" ]; then
  echo "[Gen3ia] Attente de PostgreSQL..."
  until pg_isready -d "$DATABASE_URL" 2>/dev/null || nc -z $(echo $DATABASE_URL | sed -n 's/.*@\([^:]*\):\([^/]*\).*/\1 \2/p') 2>/dev/null; do
    echo "[Gen3ia] PostgreSQL pas encore pret..."
    sleep 2
  done
  echo "[Gen3ia] PostgreSQL pret !"
fi

# Prisma
echo "[Gen3ia] Execution des migrations Prisma..."
npx prisma generate 2>&1 || true
npx prisma db push 2>&1 || true
echo "[Gen3ia] Migrations terminees."

# Seed
if [ "$SEED_DATABASE" = "true" ]; then
  echo "[Gen3ia] Seed de la base de donnees..."
  npx tsx prisma/seed.ts 2>&1 || true
  echo "[Gen3ia] Seed termine."
fi

echo "[Gen3ia] Lancement du serveur..."
exec "$@"
