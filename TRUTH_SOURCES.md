# 📌 Source de vérité — Gen3ia

Ce document établit **LA** source de vérité pour chaque aspect du projet.
Si un autre fichier contredit ce tableau, il est **obsolète** — remplacez-le.

> ⚠️ **PRINCIPE** : Un contributeur ne doit jamais avoir à deviner quel fichier prévaut.
> S'il y a un doublon, le fichier listé ici **fait foi**.

---

## 1. Package manager

| Source de vérité | Statut |
|---|---|
| `package.json` (`packageManager: bun@1.3.14`) | ✅ **FAIT FOI** |
| `bun.lock` | ✅ **FAIT FOI** — lockfile bun régénéré via `bun install` |
| ~~`package-lock.json`~~ | ❌ Obsolète — supprimé (conflit de gestionnaire) |
| ~~`.npmrc`~~ | ❌ Obsolète — supprimé |
| ~~`pnpm-workspace.yaml`~~ | ❌ Obsolète — on utilise les workspaces de `package.json` |

**Installation :** `bun install` (utilise `bun.lock`). Ne jamais commit `package-lock.json`.

---

## 2. CI / Workflows

| Source de vérité | Statut |
|---|---|
| `.github/workflows/` | ✅ **FAIT FOI** — seul dossier reconnu par GitHub |
| ~~`github/workflows/` (sans point)~~ | ❌ Ignoré par GitHub — supprimé |
| ~~`workflows/` (racine)~~ | ❌ Ignoré par GitHub — supprimé |
| ~~`ci.yml`, `deploy.yml`, `vercel-deploy.yml`, etc. (racine)~~ | ❌ Orphelins/OBSOLÈTES — supprimés |
| ~~`FUNDING.yml` (racine)~~ | ❌ Déplacé vers `.github/FUNDING.yml` |

Workflows actifs dans `.github/workflows/` : `ci.yml`, `security.yml`, `deploy-rules.yml`, `issues.yml`, `sync-secrets.yml`.

> ℹ️ Le token GitHub agent ne peut pas écrire dans `.github/workflows/` (action bloquée).
> Toute évolution de workflow est à faire manuellement/localement.

---

## 3. Configuration Next.js

| Source de vérité | Statut |
|---|---|
| `next.config.mjs` | ✅ **FAIT FOI** — ESM, compatible Next.js 14/15/16, Vercel et Docker |
| ~~`next.config.js`~~ | ❌ Obsolète — supprimé |
| ~~`next.config.ts`~~ | ❌ Non supporté par Next.js 14.2.35 — supprimé (sera recréable après upgrade Next 15+) |
| ~~`apps/web/next.config.js`~~ | ❌ Doublon — supprimé |

> ℹ️ Next.js 14 ne supporte pas `next.config.ts` (ajouté dans Next 15). Tant qu'on reste sur
> Next 14.2.35, on utilise `next.config.mjs` comme source unique. Lors du passage à Next 15+,
> ce fichier peut être renommé en `next.config.ts` si souhaité.

---

## 4. ESLint

| Source de vérité | Statut |
|---|---|
| `eslint.config.mjs` | ✅ **FAIT FOI** — flat config ESLint 9 |
| ~~`.eslintrc.json`~~ | ❌ Obsolète — supprimer |

---

## 5. Tailwind CSS (v4)

| Source de vérité | Statut |
|---|---|
| `src/app/globals.css` (`@import "tailwindcss"` + `@theme`) | ✅ **FAIT FOI** — CSS-first |
| `postcss.config.mjs` | ✅ **FAIT FOI** (`@tailwindcss/postcss`) |
| ~~`tailwind.config.ts`~~ | ❌ Obsolète/REMOVED — supprimer |

---

## 6. Schéma et migrations de base de données

| Source de vérité | Statut |
|---|---|
| `prisma/schema.prisma` | ✅ **FAIT FOI** (définit le schéma) — en cours de migration vers Firestore |
| `prisma/migrations/*/migration.sql` (dossiers) | ✅ **FAIT FOI** — migrations appliquées via `prisma migrate` |
| `prisma/migrations/migration_lock.toml` | ✅ **REQUIS** (Prisma exige `.toml`) |
| ~~`*.sql` à plat (`00001_*.sql`…)~~ | ❌ Ignorés par Prisma — supprimer |
| ~~`migration_lock.json`~~ | ❌ Mauvaise extension — supprimer |
| ~~`migration_manager.ts`, `migration_meta.json`~~ | ❌ Gestionnaire maison — utiliser `prisma migrate` |
| ~~`schema_backup.prisma`~~ | ❌ Obsolète — supprimer |

---

## 7. Sécurité / wrapper d'auth des routes API

| Source de vérité | Statut |
|---|---|
| `src/lib/with-auth.ts` | ✅ **FAIT FOI** — wrapper de sécurité unique (`withAuth`, `requireAuth`, `optionalAuth`) |
| `RouteParams` (dans `with-auth.ts`) | ✅ Générique `Promise<T>` + normalisation Next 14/15 des `params` (objets & promesses) — fiabilise la compilation des routes migrées |
| `src/lib/security.ts` (`applySecurity`) | ✅ Auth JWT / API Key / RBAC |
| ~~wrappers manuels par route~~ | ❌ Remplacés par `withAuth` |

Pas de `any` dans `with-auth.ts`: `no-explicit-any`/`no-console` sont en `error`.

---

## 8. Fichiers à supprimer (morts)

- ~~`package.json.backup`~~ ✓ Supprimé (Jalon 2)
- ~~`fix_package.sh`, `fix_package.json`~~ ✓ Supprimés (Jalon 2)
- ~~`CI_FIX.md`, `FIX_REPORT.md`, `WORKFLOWS_FIX.md`, `SECURITY_FIXES.md`~~ ✓ Supprimés (Jalon 2)
- ~~`worklog.md`~~ ✓ Supprimé (Jalon 2) — désormais ignoré via `.gitignore`
- `next-server.pid`
- `test-api.mjs`, `test-autonomous.ts`, `test-connectivity.ts`
- `test-force-push.txt`, `test-tool.txt`, `test-write.txt`
- dossier vide `Gen3ia/`
- `tailwind.config.ts`, `.eslintrc.json`
- `migration_lock.json`, `migration_meta.json`, `migration_manager.ts`, `schema_backup.prisma`

## 9. Docs / rapports

| Source de vérité | Statut |
|---|---|
| `README.md` | ✅ FAIT FOI pour l'usage |
| `docs/` | ✅ FAIT FOI pour la doc technique |
| `docs/DEVELOPMENT.md` | ✅ FAIT FOI pour le développement |
| `docs/prisma-ci-job.md` | ✅ Job CI prisma-diff à coller dans ci.yml |

---

## ✅ Commande de nettoyage (Jalon 2 — appliquée)

```bash
# Fichiers parasites versionnés
git rm CI_FIX.md FIX_REPORT.md WORKFLOWS_FIX.md SECURITY_FIXES.md worklog.md
git rm package.json.backup fix_package.sh fix_package.json

# Conflit de gestionnaire de paquets : bun devient la source unique
git rm package-lock.json .npmrc
# package.json : packageManager -> "bun@1.3.14"
bun install  # régénère bun.lock

# Configuration Next.js : une seule source (next.config.mjs)
git rm next.config.js apps/web/next.config.js next.config.ts
# next.config.ts converti en next.config.mjs (Next 14 ne supporte pas .ts)

# Workflows CI/CD consolidés dans .github/workflows/
git rm ci.yml ci-workflow.yml deploy.yml deploy-new.yml deploy-workflow.yml \
       release.yml issues.yml refresh-tokens.yml refresh-tokens-workflow.yml \
       vercel-deploy.yml
git rm -r github workflows
git mv FUNDING.yml .github/FUNDING.yml

# Dockerfiles migrés de npm vers bun
# .gitignore durci (package-lock.json, *.backup, *_FIX.md, fix_package.*, worklog.md)

git add -A
git commit -m "chore(jalon-2): cleanup structure — bun unique, next.config.mjs unique, workflows consolidés"
git push
```

_Fichier de référence pour tout contributeur — mettez à jour si la structure change._
