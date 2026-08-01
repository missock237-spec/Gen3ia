# 🔧 Réparer `npm install` sur Gen3ia

> **Cause racine** : `package-lock.json` est **vide** (`packages: {}`, 85 octets).
> `npm ci` (utilisé en CI) échoue tant que le lock n'est pas régénéré.
> Et si vous venez d'essayer `npm i next@15 react@19...`, votre `node_modules` local est **corrompu** (mix Next 14/15).

## 1. Réinitialisation totale (recommandé)

Depuis la racine du dépôt :

```bash
# 1. Purge complète de l'état local (recommandé après une tentative Next 15)
rm -rf node_modules                # node_modules corrompu (mix Next14/15)
rm -f package-lock.json            # lock vide / incohérent — sera régénéré
npm cache clean --force            # cache npm éventuellement corrompu

# 2. Install propre — régénère package-lock.json complet
npm install --no-audit --no-fund   # --no-audit accélère et évite les blocages Snyk

# 3. Génération du client Prisma (si le postinstall ne l'a pas fait)
npx prisma generate

# 4. Commit du lock régénéré (rend `npm ci` et la CI verts)
git add package-lock.json
git commit -m "chore: régénérer package-lock.json (npm ci fonctionne à nouveau)"
git push
```

## 2. Si `npm install` échoue encore

Après la purge, si l'installation échoue encore, vérifiez dans l'ordre :

| Symptôme | Cause probable | Correctif |
|---|---|---|
| `ERESOLVE` / conflit peer deps | `eslint@9` vs `eslint-config-next@14` | `.npmrc` contient déjà `legacy-peer-deps=true` (présent). Sinon ajoutez-le. |
| `EUSAGE` / `Invalid package name` | `package-lock.json` vide retiré | fait partie de la purge ci-dessus |
| Erreur `sharp` / binaire natif | deps natives multi-plateforme | `npm install --include=optional` ou installez le prébuild |
| `postinstall` Prisma échoue | CLI prisma lente | déjà protégé par try/catch (non bloquant) |

## 3. CI

`package-lock.json` doit être commité (régénéré) pour que `npm ci` passe dans `.github/workflows/ci.yml`.
Le token GitHub agent ne peut pas écrire dans `.github/workflows/` : la modification du workflow se fait **manuellement en local**.
Voir `docs/prisma-ci-job.md` pour le job à ajouter.
