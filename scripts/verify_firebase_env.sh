#!/usr/bin/env bash
# ============================================================
# Gen3ia — Vérification des variables d'environnement Firebase
# ============================================================
#  Ce script vérifie que toutes les variables Firebase requises
#  sont présentes dans l'environnement courant (local, CI, Vercel build).
#
#  Usage :
#    bash scripts/verify_firebase_env.sh
#    bash scripts/verify_firebase_env.sh --strict   # exit 1 si manquante
#
#  À exécuter :
#    - en local avant `npm run dev`
#    - en CI avant `npm run build`
#    - sur Vercel : ajouter ce script dans `prebuild` ou `buildCommand`
# ============================================================

set -euo pipefail

STRICT=0
if [[ "${1:-}" == "--strict" ]]; then
  STRICT=1
fi

# Variables Firebase PUBLIQUES (exposées au navigateur)
PUBLIC_VARS=(
  NEXT_PUBLIC_FIREBASE_API_KEY
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
  NEXT_PUBLIC_FIREBASE_PROJECT_ID
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
  NEXT_PUBLIC_FIREBASE_APP_ID
)

# Variables Firebase SERVEUR (Firebase Admin SDK)
# Soit FIREBASE_SERVICE_ACCOUNT (JSON complet), soit les 3 séparées
SERVER_VARS_OPTIONAL_GROUPS=(
  "FIREBASE_SERVICE_ACCOUNT"
  "FIREBASE_PROJECT_ID|FIREBASE_CLIENT_EMAIL|FIREBASE_PRIVATE_KEY"
)

MISSING=()
WARNINGS=()

echo "============================================================"
echo " Gen3ia — Vérification Firebase env vars"
echo "============================================================"
echo ""

# 1. Variables publiques — toutes obligatoires
echo "→ Variables PUBLIQUES (client-side) :"
for var in "${PUBLIC_VARS[@]}"; do
  if [[ -n "${!var:-}" ]]; then
    value="${!var}"
    # masque les valeurs sensibles (affiche juste la longueur)
    len=${#value}
    echo "   ✓ $var (longueur: $len)"
  else
    echo "   ✗ $var — MANQUANTE"
    MISSING+=("$var")
  fi
done
echo ""

# 2. Variables serveur — au moins un des deux groupes
echo "→ Variables SERVEUR (Firebase Admin SDK) :"
has_admin_group=0
for group in "${SERVER_VARS_OPTIONAL_GROUPS[@]}"; do
  IFS='|' read -ra vars <<< "$group"
  all_set=1
  for var in "${vars[@]}"; do
    if [[ -z "${!var:-}" ]]; then
      all_set=0
      break
    fi
  done
  if [[ $all_set -eq 1 ]]; then
    echo "   ✓ Groupe OK : $group"
    has_admin_group=1
    break
  else
    echo "   ⚠ Groupe incomplet : $group"
  fi
done
if [[ $has_admin_group -eq 0 ]]; then
  echo "   ✗ Aucun groupe Admin complet — Firebase Admin SDK non initialisable"
  MISSING+=("FIREBASE_SERVICE_ACCOUNT (ou les 3 séparées)")
fi
echo ""

# 3. Variables optionnelles mais recommandées
echo "→ Variables OPTIONNELLES :"
OPTIONAL_VARS=(
  NEXT_PUBLIC_FIREBASE_DATABASE_URL
  NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
  NEXT_PUBLIC_APP_URL
)
for var in "${OPTIONAL_VARS[@]}"; do
  if [[ -n "${!var:-}" ]]; then
    echo "   ✓ $var = ${!var}"
  else
    echo "   ⚠ $var non définie (fonctionnalité dégradée)"
  fi
done
echo ""

# 4. Résumé
echo "============================================================"
echo " Résumé"
echo "============================================================"
if [[ ${#MISSING[@]} -gt 0 ]]; then
  echo "Variables OBLIGATOIRES manquantes :"
  for v in "${MISSING[@]}"; do
    echo "  - $v"
  done
  echo ""
  echo "→ Action recommandée :"
  echo "  • En local : complétez .env.local"
  echo "  • Sur Vercel : Project Settings > Environment Variables"
  echo "    https://vercel.com/[org]/[project]/settings/environment-variables"
  echo "  • Via Vercel CLI :"
  echo "      vercel env add NEXT_PUBLIC_FIREBASE_API_KEY"
  echo "      vercel env add FIREBASE_SERVICE_ACCOUNT"
  if [[ $STRICT -eq 1 ]]; then
    exit 1
  fi
else
  echo "✓ Toutes les variables obligatoires sont présentes."
  exit 0
fi
