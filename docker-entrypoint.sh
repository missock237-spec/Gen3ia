#!/bin/sh
set -e

echo "[Gen3ia] Demarrage du conteneur..."
echo "[Gen3ia] NODE_ENV: ${NODE_ENV}"
echo "[Gen3ia] PORT: ${PORT:-3000}"

# Le projet utilise Firestore (Firebase) comme base de donnees :
# aucune attente PostgreSQL ni generation/migration Prisma requise.

echo "[Gen3ia] Lancement du serveur sur le port ${PORT:-3000}..."
exec "$@"
