# ============================================================
# Déploiement Vercel — géré par l'intégration GitHub native Vercel.
# Aucun workflow GitHub Actions nécessaire: Vercel déploie automatiquement
# chaque push (Production pour main, Preview pour les autres branches).
#
# Workflows supprimés (T12):
#   - vercel-deploy.yml: utilisait VERCEL_PROJECT_ID/VERCEL_ORG_ID secrets
#     qui ne correspondent pas au projet Vercel réel → "Project not found".
#     L'intégration native Vercel gère ce déploiement automatiquement.
#   - production-deploy.yml: référençait des scripts inexistants (T7) et
#     entrait en conflit avec le déploiement Vercel natif.
#   - sync-secrets.yml: même problème de VERCEL_PROJECT_ID invalide.
#
# Statut de déploiement vérifié via GitHub Deployments API:
#   - main → Production (https://gen3ia.vercel.app) — success
#   - autres branches → Preview — géré par Vercel
#
# Pour reconfigurer un déploiement GitHub Actions (optionnel):
#   1. Récupérer le VERCEL_PROJECT_ID réel dans .vercel/project.json
#   2. Mettre à jour le secret GitHub VERCEL_PROJECT_ID avec cette valeur
#   3. Recréer vercel-deploy.yml
# ============================================================
