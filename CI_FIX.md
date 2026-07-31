# CI_FIX.md — Archivé

Les correctifs CI listés dans ce fichier ont été appliqués.

## État actuel des workflows

### `.github/workflows/`

| Fichier | Rôle | Statut |
|---------|------|--------|
| `ci.yml` | Pipeline CI complet (npm, lint, typecheck, test, build, Docker) | ✅ Actif |
| `issues.yml` | Gestion des issues et PR (stale + first interaction) | ✅ Actif |
| `security.yml` | Audit sécurité (CodeQL, Trivy) | ✅ Actif |
| `sync-secrets.yml` | Synchronisation des secrets GitHub → Vercel | ✅ Actif |

### Notes

- Gestionnaire de paquets : **npm** (pas pnpm, pas Bun)
- Le déploiement Vercel est automatique via l'intégration GitHub
- Les workflows obsolètes à la racine ont été supprimés/dépréciés
- Voir `CHANGELOG.md` pour l'historique complet
