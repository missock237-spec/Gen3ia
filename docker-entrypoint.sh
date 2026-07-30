#!/bin/sh
set -e

echo "[Gen3ia] Demarrage du conteneur..."
echo "[Gen3ia] NODE_ENV: ${NODE_ENV}"
echo "[Gen3ia] PORT: ${PORT:-3000}"

# Attendre PostgreSQL
if [ -n "$DATABASE_URL" ]; then
  echo "[Gen3ia] Attente de PostgreSQL..."
  # Extraire host et port de DATABASE_URL
  DB_HOST=$(echo "$DATABASE_URL" | sed -n 's/.*@\([^:]*\):\([^/]*\).*/\1/p')
  DB_PORT=$(echo "$DATABASE_URL" | sed -n 's/.*@\([^:]*\):\([^/]*\).*/\2/p')
  DB_PORT=${DB_PORT:-5432}
  
  i=0
  while [ $i -lt 30 ]; do
    nc -z "$DB_HOST" "$DB_PORT" 2>/dev/null && break
    echo "[Gen3ia] PostgreSQL pas encore pret... (${i}s)"
    sleep 2
    i=$((i + 2))
  done
  echo "[Gen3ia] PostgreSQL pret apres ${i}s !"
fi

# Prisma
echo "[Gen3ia] Execution des migrations Prisma..."
npx prisma generate 2>&1 || true
echo "[Gen3ia] Prisma client genere."

# Seed optionnel
if [ "$SEED_DATABASE" = "true" ]; then
  echo "[Gen3ia] Seed de la base de donnees..."
  npx prisma db push 2>&1 || true
  npx tsx prisma/seed.ts 2>&1 || true
  echo "[Gen3ia] Seed termine."
fi

echo "[Gen3ia] Lancement du serveur sur le port ${PORT:-3000}..."
exec "$@"
