# 🎯 Plan de qualité — Gen3ia

Feuille de route pour résorber la dette technique. Ce document est la **référence**.

## État initial (audit)

| Problème | Volume | Statut |
|---|---|---|
| `any` explicites | **383** | 🔴 à résorber |
| `@ts-ignore` / eslint-disable | **9** | 🔴 à remplacer |
| `console.*` bruts | **78** | 🔴 à router vers logger |
| Fichiers-monolithes | 5 (`state-graph.ts` 2167l, `sandbox.ts` 1339l, `mcp-client.ts` 1170l, `service-manager.ts` 1157l, `registry.ts` 959l) | 🟠 à découper |
| Fichiers mock/simulé/stub | **96** | 🟠 derrière feature flags |

## Règles ESLint déjà passées en `error`

Dans `eslint.config.mjs` :
- `@typescript-eslint/no-explicit-any`: `error`
- `@typescript-eslint/ban-ts-comment`: `error` (ts-ignore avec justification ≥10 chars)
- `no-console`: `error` (sauf `warn`/`error`)

> ⚠️ Tant que les `any`/`console` existants ne sont pas résorbés, `npm run lint` échoue.
> C'est voulu : on force la qualité. Voyez les sections ci-dessous pour résorber module par module.

## Endpoint de features

`GET /api/health/features` (public) liste, via `src/lib/features-registry.ts` :
- les features **prod** (opérationnelles)
- les features **beta**
- les features **mock** (derrière feature flags, cachées en prod)
- les features **disabled**

**Règle** : toute fonctionnalité simulée/mock doit être déclarée dans `features-registry.ts` avec `status: 'mock'` + un `flag`.

## Phase 1 — Résorber les `any` (383)

**Fichiers prioritaires** (où sont concentrés les `any`) :
- `src/lib/*` (routes API, services)
- `src/middleware.ts`
- `features-registry.ts`, `with-auth.ts`

**Méthode** :
1. `npx eslint . --ext .ts,.tsx --fix` pour les erreurs automatisables
2. Remplacer `any` par des types corrects (interfaces, `unknown` + narrowing, generics)
3. Préférer `unknown` puis narrowing via `if (typeof x === ...)`
4. Ne JAMAIS utiliser `as any` pour contourner

**Commande par module** :
```bash
npx eslint src/lib/ai-router.ts --ext .ts  # voir erreurs
# corriger, puis:
npm run lint
```

## Phase 2 — Remplacer `console.*` (78) par logger

**Tout `console.log/info/debug` doit passer par `@gen3ia/core` (logger) :**

```typescript
// AVANT
console.log('user created', userId);

// APRÈS
import { createLogger } from '@gen3ia/core';  // ou '@/lib/logger'
const log = createLogger('users');
log.info('user_created', { userId });
```

**Pourquoi** : le logger écrit dans Loki (déjà provisionné) et en JSON structuré.

## Phase 3 — Découper les monolithes

Objectifs de découpage :
- `state-graph.ts` (2167l) → `state-graph/{types,graph,transitions,serializer}.ts`
- `tools/sandbox.ts` (1339l) → `tools/sandbox/{runner,resolver,handlers}.ts`
- `mcp-client.ts` (1170l) → `mcp/{types,transport,client}.ts`
- `service-manager.ts` (1157l) → `services/manager/{registry,lifecycle,health}.ts`
- `tools/registry.ts` (959l) → `tools/registry/{index,loader,config}.ts`

Chaque découpage doit préserver les exports publics (aucune rupture d'import).

## Phase 4 — Traiter les 96 fichiers mock

1. **Identifier** : `grep -rl "mock\|simulat\|stub\|not implemented" src/`
2. **Trier** : fonctionnalité réelle vs simulée
3. **Marquer** : chaque feature simulée devient un `status: 'mock'` dans `features-registry.ts` + un flag
4. **Tester le endpoint** `/api/health/features` pour vérifier qu'aucun mock n'est exposé comme prod

## Commandes utiles

```bash
# Compter les any
npx eslint . --ext .ts,.tsx | grep -c "no-explicit-any"

# Compter les console
npx eslint . --ext .ts,.tsx | grep -c "no-console"

# Lister les fichiers mock
grep -rl "mock\|simulat\|stub\|not implemented" src/

# Vérifier les features
curl http://localhost:3000/api/health/features
```
