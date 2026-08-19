# ⬆️ Migration Next.js 15 / React 19 — Plan

Feuille de route pour migrer de **Next 14.2.29 / React 18** vers **Next 15 / React 19**.

## Pourquoi migrer

- **App Router stabilisé** : toutes les fonctionnalités stables en 15
- **Support** : Next 14 hors support progressivement
- **Perf** : améliorations runtime, caching, streaming
- **Geist font** native (déjà utilisée, mais on avait dû revenir à Inter en 14)

## 🌟 Ce qui changera avec la migration

1. **Polices** : on pourra réutiliser `Geist` / `Geist_Mono` natifs de Next 15
   (on utilise actuellement `Inter`/`JetBrains_Mono` — compat Next 14)
2. **`next.config.ts`** : devient la norme (on utilise `next.config.js`)
3. **`params`/`searchParams`** : déjà en `Promise`, compatibles
4. **Turbo Pack** : bundler dev par défaut
5. **Caching** : nouveaux defaults pour `fetch`

## 🪜 Étapes

### Étape 1 — Prérequis de compatibilité

- Node 20.9+ requis (Next 15)
- Vérifier `@types/react` et `@types/react-dom` → v19

### Étape 2 — Bump de versions

```bash
npm i next@15 react@19 react-dom@19
npm i -D @types/react@19 @types/react-dom@19
# libs compatibles :
npm i next-auth@5 # ou beta compatible
npm i @sentry/nextjs@9
```

### Étape 3 — Retirer les overrides

Après bump, retirer des `overrides` du `package.json` :
- `next` → à la version 15
- `react`, `react-dom` → v19 (retirer les overrides si plus nécessaire)
- `eslint-config-next` → version correspondante
- Garder les overrides Radix UI uniquement si le confirct de peerDeps persiste

### Étape 4 — `next.config.js` → `next.config.ts`

Migrer `next.config.js` (CommonJS) vers `next.config.ts` (type-safe).

### Étape 5 — Polices Geist

Réactiver `Geist`/`Geist_Mono` dans `src/app/layout.tsx`
(remplacer `Inter`/`JetBrains_Mono`).

### Étape 6 — Vérifications

- `npm run build`
- `npm run typecheck`
- `npm run lint` (les règles envoyx restent en `error` → s'assurer que la resorption est faite)
- Casse du cache Next

## ⚠️ Risques

- **next-auth v4** : incompatibilité partielle avec Next 15 → migrer vers next-auth v5 (app router)
- **Radix UI** : vérifier compat React 19 (la plupart sont OK en v2+)
- **tailwindcss v4** : déjà en place, compatible
- **Workers** : `output: 'standalone'` reste OK

## Cibles de version

| Paquet | Actuel | Cible |
|---|---|---|
| next | 14.2.29 | 15.x |
| react | 18.3.1 | 19.x |
| react-dom | 18.3.1 | 19.x |
| next-auth | 4.24.13 | 5.x (app router) |
| @sentry/nextjs | 8 | 9 |
| @types/react | 18 | 19 |
| @types/react-dom | 18 | 19 |
