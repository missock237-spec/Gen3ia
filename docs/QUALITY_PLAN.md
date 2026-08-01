# 🎯 Plan de qualité — Gen3ia

Feuille de route pour résorber la dette technique.

## État initial (audit)

| Problème | Volume | Statut |
|---|---|---|
| `any` explicites | **383** | 🟡 en cours (routes critiques faites) |
| `@ts-ignore` / eslint-disable | **9** | 🟡 en cours |
| `console.*` bruts | **78** | 🟡 en cours |
| Fichiers-monolithes | 5 (state-graph, sandbox, mcp-client, service-manager, registry) | 🟠 à découper |
| Fichiers mock/simulé | 96 | 🟠 derrière feature flags |

## ✅ Déjà fait (par le chat)

### Verrous ESLint (bloquants)
- `@typescript-eslint/no-explicit-any`: `error`
- `@typescript-eslint/ban-ts-comment`: `error` (justification ≥10 chars)
- `no-console`: `error` (exemption : `src/lib/logger.ts` + `packages/core/src/logger.ts` = transport légitime)

> ⚠️ Tant que les `any`/`console` ne sont pas résorbés, `npm run lint` échoue. Voulu.

### `any` résorbés (fichiers à jour)

**Libs centrales :**
- `src/lib/ai-router.ts` — `(e as any).status` → `HttpError`; `(c: any)` → `AnthropicContentBlock`; + fix typo `require requireCapability`
- `src/lib/with-auth.ts` — `Promise<any>` → `RouteParams`
- `src/app/api/health/route.ts` — `Record<string, any>` → `HealthComponent`

**Routes API (migrées `withAuth`, `Promise<any>` → `RouteParams`) :**
- `ai/chat`, `ai/orchestrate`, `ai-server/analyze`, `audio/generate`, `videos/generate`, `media/generate`, `images/generate`, `rag/query`, `compute`, `multimodal/screen`, `multimodal/vision`, `conversations`

### Fichiers vérifiés propres (aucun `any`)
- `src/lib/db.ts`, `analytics.ts`, `input-sanitizer.ts`, `rate-limiter.ts`, `security.ts`, `middleware.ts`, `agent-memory.ts`, `tools/registry.ts`, `features-registry.ts`

### Features / mocks
- `src/lib/features-registry.ts` créé (source de vérité des features)
- `GET /api/health/features` créé (public)
- Sandbox déclaré : js=prod, python=beta, simulé=mock

## 🔜 Reste à faire (par module)

### Phase 1 — Résorber les `any` restants
Fichiers prioritaires : `src/app/api/**` non migrés + monolithes.
**Méthode** : remplacer `any` → `unknown+narrowing`, interfaces, generics. `npx eslint <fichier>` par module.

### Phase 2 — Remplacer `console.*` (78)
Tout `console.log/info/debug` → `createLogger`. Import depuis `@/lib/logger`.

### Phase 3 — Découper les monolithes
- `state-graph.ts` (2167l) → `state-graph/{types,graph,transitions,serializer}.ts`
- `tools/sandbox.ts` (1339l) → `tools/sandbox/{runner,resolver,handlers}.ts` (⚠️ a `@ts-nocheck`)
- `mcp-client.ts` (1170l) → `mcp/{types,transport,client}.ts`
- `service-manager.ts` (1157l) → `services/manager/{registry,lifecycle,health}.ts`
- `tools/registry.ts` (959l) → `tools/registry/{index,loader,config}.ts`
(Chaque découpage préserve les exports publics.)

### Phase 4 — Traiter les 96 fichiers mock
Marquer chaque feature simulée en `{ status: 'mock', flag }` dans features-registry. Vérifier via `/api/health/features`.

## Commandes utiles

```bash
# Compter les any restants
npx eslint . --ext .ts,.tsx | grep -c "no-explicit-any"

# Lister les mocks
curl http://localhost:3000/api/health/features

# Vérifier un fichier
npx eslint src/app/api/agents/route.ts
```
