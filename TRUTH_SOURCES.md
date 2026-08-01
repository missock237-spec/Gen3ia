# 📌 Source de vérité — Gen3ia

Ce document établit **LA** source de vérité pour chaque aspect du projet.
Si un autre fichier contredit ce tableau, il est **obsolète** — remplacez-le.

> ⚠️ **PRINCIPE** : Un contributeur ne doit jamais avoir à deviner quel fichier prévaut.
> S'il y a un doublon, le fichier listé ici **fait foi**.

---

## 1. Package manager

| Source de vérité | Statut |
|---|---|
| `package.json` (`packageManager: npm@10.8.0`) | ✅ **FAIT FOI** |
| `package-lock.json` | ⚠️ **À RÉGÉNÉRER** localement via `npm install` (actuellement vide `packages:{}` → `npm ci` échoue). C'est la seule étape restante pour rendre la CI verte. |
| ~~`bun.lock`~~ | ❌ Obsolète — supprimer |
| ~~`pnpm-workspace.yaml`~~ | ❌ Obsolète — on utilise les workspaces npm de `package.json` |

**Installation :** `npm install` (régénère le lockfile). Puis `git add package-lock.json && git commit && git push`.

---

## 2. CI / Workflows

| Source de vérité | Statut |
|---|---|
| `.github/workflows/` | ✅ **FAIT FOI** — seul dossier reconnu par GitHub |
| ~~`github/workflows/`~~ | ❌ Ignoré par GitHub — supprimer |
| ~~`ci.yml`, `deploy.yml`, etc. (racine)`~~ | ❌ Orphelins — supprimer |

Le job **`prisma-diff`** (dans `docs/prisma-ci-job.md`) doit être collé dans `.github/workflows/ci.yml`.

> ℹ️ Le token GitHub agent ne peut pas écrire dans `.github/workflows/` (action bloquée).
> Toute évolution de workflow est à faire manuellement/localement.

---

## 3. Configuration Next.js

| Source de vérité | Statut |
|---|---|
| `next.config.js` | ✅ **FAIT FOI** — CommonJS, compatible Vercel/Docker |
| ~~`next.config.ts`~~ | ❌ Obsolète — supprimer |

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
| `prisma/schema.prisma` | ✅ **FAIT FOI** (définit le schéma) |
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

- `package.json.backup`
- `next-server.pid`
- `test-api.mjs`, `test-autonomous.ts`, `test-connectivity.ts`, `test-whatsapp.ts`
- `test-force-push.txt`, `test-tool.txt`, `test-write.txt`
- dossier vide `Gen3ia/`
- `fix_package.json` (utiliser `fix_package.sh`)
- `tailwind.config.ts`, `next.config.ts`, `.eslintrc.json`
- `migration_lock.json`, `migration_meta.json`, `migration_manager.ts`, `schema_backup.prisma`

## 9. Docs / rapports

| Source de vérité | Statut |
|---|---|
| `README.md` | ✅ FAIT FOI pour l'usage |
| `docs/` | ✅ FAIT FOI pour la doc technique |
| `docs/DEVELOPMENT.md` | ✅ FAIT FOI pour le développement |
| `docs/prisma-ci-job.md` | ✅ Job CI prisma-diff à coller dans ci.yml |
| ~~`CI_FIX.md`, `FIX_REPORT.md`, `WORKFLOWS_FIX.md`, `SECURITY_FIXES.md`~~ | ❌ Rapports ponctuels — archiver dans `docs/` |

---

## ✅ Commande de nettoyage finale (à exécuter localement)

```bash
# Fichiers obsolètes / morts
rm bun.lock pnpm-workspace.yaml next.config.ts .eslintrc.json tailwind.config.ts
rm package.json.backup schema_backup.prisma next-server.pid
rm test-api.mjs test-autonomous.ts test-connectivity.ts test-whatsapp.ts
rm test-force-push.txt test-tool.txt test-write.txt
rm ci.yml ci-workflow.yml deploy.yml deploy-new.yml deploy-workflow.yml release.yml issues.yml refresh-tokens.yml refresh-tokens-workflow.yml vercel-deploy.yml
rm fix_package.json
rmdir Gen3ia 2>/dev/null || true
rm -rf github workflows

# Migrations Prisma (convention abandonnée / maison)
rm prisma/migrations/0000*.sql
rm prisma/migrations/migration_lock.json prisma/migrations/migration_meta.json
rm prisma/migration_manager.ts

# Commit + push
git add -A
git commit -m "chore: cleanup — suppression des fichiers obsolètes (source de vérité consolidée)"
git push

# Régénérer le lockfile (CRITIQUE pour npm ci — seule étape restante pour CI verte)
npm install
git add package-lock.json
git commit -m "chore: régénérer package-lock.json (npm ci fonctionne)"
git push
```

_Fichier de référence pour tout contributeur — mettez à jour si la structure change._
