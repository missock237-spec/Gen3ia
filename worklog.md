# Gen3ia Worklog

## v0.10.0 — 2026-07-29

### ✅ Corrections appliquées

**Workflows GitHub :**
- `genova-ci.yml` → Renommé en Gen3ia CI (toutes les références Genova mises à jour)
- `main.yml` → Indentation corrigée, `actions/checkout@v4` → `v7`, secrets manquants ajoutés
- `security.yml` → Suppression de la référence `codeql-config.yml` inexistante
- `issues.yml` → `actions/stale@v11` → `v9`, messages Genova → Gen3ia

**État du projet :**
- ✅ Renommage Genova → Gen3ia terminé
- ✅ WhatsApp complètement supprimé du code
- ✅ Déploiement : Render (migration Vercel terminée)
- ✅ Schema Prisma complet (> 40 modèles)
- ✅ Authentification Google/GitHub
- ✅ Paiements Mobile Money (SebPay)
- ✅ Tests (46 tests, seuil 80% coverage)
- ✅ Docker multi-stage
- ✅ PWA offline-first
- ✅ Rust crates (Cargo.toml présent)

### 🚧 À faire
- Corriger les workflows redondants à la racine (ci.yml, deploy.yml)
- Mettre en place les GitHub Secrets manquants
- Finaliser le coeur de calcul Rust/WebGPU
- Optimiser le pipeline CI
