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
| `package-lock.json` | ✅ Généré par npm, source des dépendances exactes |
| ~~`bun.lock`~~ | ❌ Obsolète — supprimer |
| ~~`pnpm-workspace.yaml`~~ | ❌ Obsolète — on utilise les workspaces npm de `package.json` |

**Commande d'installation :** `npm install`

---

## 2. CI / Workflows

| Source de vérité | Statut |
|---|---|
| `.github/workflows/` | ✅ **FAIT FOI** — seul dossier reconnu par GitHub |
| ~~`github/workflows/`~~ | ❌ Ignoré par GitHub (mauvais nom) — supprimer |
| ~~`ci.yml`, `deploy.yml`, `release.yml`** (racine)`~~ | ❌ Orphelins — supprimer |

**Règle :** Tout workflow GitHub vit dans `.github/workflows/`.

---

## 3. Configuration Next.js

| Source de vérité | Statut |
|---|---|
| `next.config.js` | ✅ **FAIT FOI** — CommonJS, compatible Vercel/Docker |
| ~~`next.config.ts`~~ | ❌ Obsolète (marqué REMOVED) — supprimer |

---

## 4. ESLint

| Source de vérité | Statut |
|---|---|
| `eslint.config.mjs` | ✅ **FAIT FOI** — flat config ESLint 9 |
| ~~`.eslintrc.json`~~ | ❌ Obsolète (ancien format) — supprimer |

---

## 5. Schéma de base de données

| Source de vérité | Statut |
|---|---|
| `prisma/schema.prisma` | ✅ **FAIT FOI** |
| ~~`schema_backup.prisma`~~ | ❌ Obsolète — supprimer |

---

## 6. Fichiers à supprimer (morts)

Ces fichiers sont obsolètes et à supprimer via `git rm` :

- `package.json.backup`
- `next-server.pid`
- `test-api.mjs`, `test-autonomous.ts`, `test-connectivity.ts`, `test-whatsapp.ts`
- `test-force-push.txt`, `test-tool.txt`, `test-write.txt`
- dossier vide `Gen3ia/`
- `fix_package.json` (utiliser `fix_package.sh`)

## 7. Docs / rapports

| Source de vérité | Statut |
|---|---|
| `README.md` | ✅ FAIT FOI pour l'usage |
| `docs/` | ✅ FAIT FOI pour la documentation technique |
| `CHANGELOG.md` | ✅ FAIT FOI pour l'historique |
| ~~`CI_FIX.md`, `FIX_REPORT.md`, `WORKFLOWS_FIX.md`, `SECURITY_FIXES.md`~~ | ❌ Rapports ponctuels — à archiver dans `docs/` ou supprimer |

---

## ✅ Commande de nettoyage finale

```bash
# Depuis la racine du dépôt
rm bun.lock pnpm-workspace.yaml
rm next.config.ts .eslintrc.json
rm package.json.backup schema_backup.prisma next-server.pid
rm test-api.mjs test-autonomous.ts test-connectivity.ts test-whatsapp.ts
rm test-force-push.txt test-tool.txt test-write.txt
rm ci.yml ci-workflow.yml deploy.yml deploy-new.yml deploy-workflow.yml release.yml issues.yml refresh-tokens.yml refresh-tokens-workflow.yml vercel-deploy.yml
rm fix_package.json
rmdir Gen3ia 2>/dev/null || true
rm -rf github/workflows
mv CI_FIX.md FIX_REPORT.md WORKFLOWS_FIX.md SECURITY_FIXES.md docs/ 2>/dev/null || true

git add -A
git commit -m "chore: cleanup — supprimer les fichiers obsolètes et établir une seule source de vérité"
git push
```

---

_Fichier de référence pour tout nouveau contributeur — mettez-le à jour si la structure change._
