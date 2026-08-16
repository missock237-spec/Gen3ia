# 🏗️ Migration monorepo — Gen3ia

État actuel et plan cible pour finir la migration monorepo.

## 🧭 État actuel (avant migration)

```
Gen3ia/
├── src/                  # ← App Next.js réelle (pages, routes API, lib)
├── apps/web/src/         # ← Uniquement des tests e2e __tests__/
├── packages/core/src/    # ← Pattern propre (db, logger, env, repositories, services)
├── package.json          # workspaces + scripts turbo run
```

**Incohérences :**
1. L'app Next vit à la **racine** `src/`, pas dans `apps/web/src`
2. `apps/web` est un "faux" workspace (seulement des tests e2e)
3. La logique métier coexiste entre `src/lib/` (racine) et `packages/core/src/`
4. Le build est `next build && turbo run build` (compromis) — l'app n'est pas orchestrée par turbo

## 🎯 État cible

```
Gen3ia/
├── apps/web/             # App Next.js (déplacée depuis src/)
│   └── src/
├── packages/core/        # Logique métier partagée (source de vérité)
│   └── src/
│       ├── db.ts
│       ├── logger.ts
│       ├── env-validator.ts
│       ├── repositories/
│       ├── services/
│       └── validation.ts
├── turbo.json            # Orchestration (cache build)
```

## 🪜 Étapes de migration (à exécuter localement, étape par étape)

### Étape 1 — Déplacer l'app Next vers `apps/web/src`

```bash
# Créer le dossier cible
mkdir -p apps/web/src

# Déplacer toute l'application (app, components, hooks, lib, etc.)
git mv src/app apps/web/src/app
git mv src/components apps/web/src/components
git mv src/hooks apps/web/src/hooks
# … et ainsi de suite pour tout ce qui est UI/Next

git mv src/ middleware.ts apps/web/ 2>/dev/null || true

git mv next.config.js apps/web/next.config.js
git mv tailwind.config.ts apps/web/tailwind.config.ts 2>/dev/null || true
```

> ⚠️ **Attention** : les routes API (`src/app/api/**`) DOIVENT rester dans `apps/web/src/app/api` car elles font partie du runtime Next.

### Étape 2 — Déplacer la logique métier vers `packages/core`

Déplacer les modules **non-UI** (services, repositories, utilitaires métier) de `src/lib/` vers `packages/core/src/`.

```bash
# Exemples
mkdir -p packages/core/src/services
mkdir -p packages/core/src/repositories
git mv src/lib/ai-router.ts packages/core/src/services/ai-router.ts  # adapter
# … refactoriser les imports @/lib/... → @gen3ia/core
```

### Étape 3 — Adapter les tsconfig

- `apps/web/tsconfig.json` : `paths: { "@/*": ["./src/*"] }` et compilerOptions pour Next
- Racine : le `tsconfig` racine devient un référentiel, les workspaces ont leur propre typecheck

### Étape 4 — Basculer le build sur turbo pur

```jsonc
// package.json (racine)
{
  "scripts": {
    "build": "turbo run build",        // une fois l'app dans apps/web
    "dev": "turbo run dev"
  }
}
```

### Étape 5 — Activé le cache

`turbo.json` (déjà présent) gère le cache. Le build des packages utilisera le cache si rien n'a changé.

## ✅ Ce qui est déjà fait (par le chat)

- [x] `tsconfig.json` racine : retiré `services/` de `exclude` → code vérifié
- [x] `build = next build && turbo run build` (compromis sûr, app racine + packages)
- [x] `apps/web` : refondu comme workspace de tests e2e (son rôle actuel réel)
- [x] Scripts racine (dev, build, test, lint, typecheck) branchés sur `turbo run` (sauf build qui garde next build)

## ⚠️ Risque

La migration complète (`src/` → `apps/web/src`) est **lourde et à haut risque** :
- Des centaines de fichiers de routes API et composants
- Les imports `@/...` doivent être remappés
- Nécessite une compilation locale à chaque étape

**Faites-la progressivement (étape par étape), en vérifiant `npm run build` après chaque étape.**
