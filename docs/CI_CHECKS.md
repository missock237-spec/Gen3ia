# 🔒 CI Checks obligatoires — Gen3ia

configuration des **branch protection rules** sur GitHub (Settings → Branches → main).

Les checks ci-dessous **doivent être required** pour merger sur `main`.

## Checklist des required checks

| Check | Workflow / commande | Bloquant ? |
|---|---|---|
| **typecheck** | `.github/workflows/ci.yml` (job `typecheck`) — `tsc --noEmit` | ✅ |
| **lint** | `.github/workflows/ci.yml` (job `lint`) — `eslint .` (no-explicit-any, no-console en error) | ✅ |
| **test + coverage** | `.github/workflows/ci.yml` (job `test`) — `vitest run` (seuils 40% dans vitest.config.ts) | ✅ |
| **secret-scan** | `.github/workflows/security.yml` (job `secrets-blocking`) — Gitleaks + check .env | ✅ |
| **prisma migrate diff** | `.github/workflows/ci.yml` (job `prisma-diff`) — detecte divergence schema/migrations | ✅ |
| codeql | `.github/workflows/security.yml` (job `codeql`) | ✅ |
| dependency-review | `.github/workflows/security.yml` (job `dependency-review`, sur PR) | ✅ |

> ⚠️ Le job `prisma-diff` (bloc à coller) est documenté dans `docs/prisma-ci-job.md`.

## Comment configurer sur GitHub

1. **Settings** → **Branches** → **Branch protection rules** → **Edit** sur `main`
2. Cochez **"Require status checks to pass before merging"**
3. Ajoutez les checks par leur **nom de job** (ex: `lint`, `typecheck`, `test`, `secrets-blocking`, `prisma-diff`)
4. Cochez **"Require branches to be up to date"**
5. **Require a pull request before merging**, with at least 1 approving review

## Convention de nommage des cheques

Les noms exacts dépendent du `name:` de chaque job dans les workflows `.github/workflows/*.yml`.
Exemple : `name: prisma-diff` → check `prisma-diff`.

# 🧪 Couverture de tests — Priorités

Les seuils `vitest.config.ts` sont fixes a `statements 40% / branches 30% / functions 35% / lines 40%`,
avec `thresholdAutoUpdate: true` (cliquet a la hausse).

## Zones critiques a couvrir en priorite

Pour 42 fichiers de test pour ~768 fich TS (5.5%), il faut concentrer l'effort sur :

| Domaine | Fichiers cibles | Pourquoi critique |
|---|---|---|
| **Debit de credits** | `src/app/api/credits/*`, `packages/core/src/services/credit.service.ts` | expose des F35, un bug = perte/monnaie |
| **Quotas LLM** | `src/lib/usage-limits.ts` | free users brule budget LLM |
| **Auth / 2FA** | `src/lib/security.ts`, `src/lib/with-auth.ts`, `src/middleware.ts` | acces non autorise |
| **Webhooks** | `src/app/api/payments/webhook/*`, `src/app/api/webhook/*` | signature HMAC + crediter sans paiement |
| **state-graph** | `state-graph.ts` (2167 lignes) | logique criticce autonomie |
| **Sanitization** | `src/lib/input-sanitizer.ts`, `src/lib/sanitize.ts` | injection / prototype pollution |
| **Rate limiting** | `src/lib/rate-limiter.ts` | abuse / DoS |
| **Payments (Stripe + SebPay)** | `src/lib/payment/*`, `src/lib/sebpay.*` | argent reel |

## Creer un nouveau test

Les tests vivent dans `src/__tests__/**/*.test.ts`.

```typescript
import { describe, it, expect } from 'vitest';

describe('credit balance', () => {
  it('debite correctement', () => {
    expect(true).toBe(true);
  });
});
```
