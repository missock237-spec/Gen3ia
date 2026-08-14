# 🌿 Configuration des Règles de Branche — Genova

> **⚠️ Cette configuration doit être appliquée manuellement dans les paramètres GitHub.**
>
> Aller sur : https://github.com/missock237-spec/Genova/settings/branches

---

## Branche `main` — Protection requise

| Règle | Valeur | Statut |
|-------|--------|--------|
| ✅ **Exiger des PR** avant de merger | Activé | 🔧 À configurer |
| ✅ **Exiger au moins 1 reviewer** | Activé | 🔧 |
| ✅ **Exiger que les checks CI passent** | Activé | 🔧 |
| ✅ **Ne pas autoriser les pushs directs** | Activé | 🔧 |
| ✅ **Exiger les dernières modifications** | Activé (rebase requis) | 🔧 |
| ✅ **Ne pas autoriser le merge tant que les conversations sont résolues** | Activé | 🔧 |
| ✅ **Restreindre les pushs** | Seuls @missock237-spec | 🔧 |

## Checks CI obligatoires

Avant de merger une PR, ces checks doivent passer :

| Check | Workflow |
|-------|----------|
| 🔒 Security Audit | `.github/workflows/ci.yml` → job `security` |
| 📝 TypeScript Check | `.github/workflows/ci.yml` → job `typecheck` |
| 🧪 Tests | `.github/workflows/ci.yml` → job `test` |
| 🏗️ Build | `.github/workflows/ci.yml` → job `build` |
| 🔬 CodeQL Analysis | `.github/workflows/codeql-analysis.yml` |

## Étapes pour appliquer

1. Aller sur **Settings → Branches**
2. Cliquer **"Add branch protection rule"**
3. Dans "Branch name pattern", entrer : `main`
4. Cocher :
   - ✅ `Require a pull request before merging`
     - ✅ `Require approvals` → 1
     - ✅ `Dismiss stale pull request approvals when new commits are pushed`
     - ✅ `Require review from Code Owners`
   - ✅ `Require status checks to pass before merging`
     - Ajouter : `security-audit`, `typecheck`, `test`, `build`, `CodeQL Analysis`
   - ✅ `Require branches to be up to date before merging`
   - ✅ `Do not allow bypassing the above settings`
   - ✅ `Restrict who can push to matching branches`
     - Ajouter : `missock237-spec`
5. Cliquer **"Create"**

## Labels pour les PR

| Label | Couleur | Description |
|-------|--------|-------------|
| `automerge` | `#0E8A16` | PR approuvée, peut être mergée automatiquement |
| `dependencies` | `#0366D6` | Mise à jour de dépendances |
| `security` | `#B60205` | Correctif de sécurité |
| `bug` | `#D73A4A` | Correction de bug |
| `enhancement` | `#A2EEEF` | Nouvelle fonctionnalité |

> **Note :** Dependabot commencera à créer des PR automatiquement d'ici 24h.
> CodeQL s'exécutera au prochain push sur `main`.