# ADR-0013 — Audit qualité v3.2 : types stricts au build, bun unique, middleware central

## Statut
Accepté (v3.2 — correctifs issus de l'audit externe)

## Contexte
Un audit externe du code a confirmé les points forts (sécurité paiement
HMAC + transaction atomique, guards admin systématiques, discipline de
code, 71 tests) et relevé des corrections prioritaires : `ignoreBuildErrors`
annulait le `strict: true` du tsconfig, `reactStrictMode` était désactivé,
CI/Docker installaient via npm SANS lockfile alors que le projet verrouille
avec bun.lock, `next-intl` était une dépendance morte, aucune LICENSE,
`findMany()` non bornés, et aucune route protégée par un middleware central.

## Décisions

### 1. Typage strict effectif au build
`typescript.ignoreBuildErrors: false` + `reactStrictMode: true` dans
next.config.ts. Corollaire : `tsc --noEmit` ajouté comme étape CI dédiée
(échec = build bloqué). Les erreurs résiduelles ont été corrigées
(estimateTokens, zod issues, TaskType, billing page) ; le dossier `skills/`
(library de référence non-suivie par git) est exclu du tsconfig — ce sont
des paquets autonomes, pas du code applicatif.

### 2. Gestionnaire de paquets unique : bun
Le projet possède bun.lock, des scripts bun (`bun test`, `bun scripts/…`)
et Vercel détecte bun.lock automatiquement. CI : `bun install
--frozen-lockfile` + `bunx tsc --noEmit` + `bun test` + `bun run lint` +
`bun run build`. Dockerfile : builder `oven/bun:1` (install verrouillée) +
runner `node:22-bookworm-slim` (standalone). Suppression complète de
`npm install --legacy-peer-deps` — le risque de divergence entre versions
testées et déployées est éliminé.

### 3. Middleware central : filet de sécurité /api/admin/*
`src/middleware.ts` bloque par préfixe toute requête vers /api/admin/* sans
cookie de session au format attendu (401 immédiat, sans accès base).
requireAdmin() sur chaque route reste le garde de vérité (vérifie le rôle
en base). La division est documentée dans le middleware : la duplication
du nom de cookie est volontaire (Prisma + node:crypto ne peuvent pas être
importés dans le runtime edge). Un contributeur qui oublierait requireAdmin
sur une future route admin garde une protection minimale contre les
non-authentifiés.

### 4. Pagination standard des listes
Helper `src/lib/api-pagination.ts` (limit bornée 1-100, défaut 50, curseur)
appliqué aux quatre findMany non bornés : agents, apikeys, knowledge,
skills. Rétro-compatible : la forme de réponse est inchangée (tableau),
`nextCursor` est additif et prêt pour le chargement progressif côté UI.
Les autres listes (tasks, memory, billing, marketplace, admin) étaient déjà
bornées par take.

### 5. Tests du code qui touche à l'argent
`tests/unit/billing-guards.test.ts` (19 tests) : signature HMAC
(fail-closed sans secret), webhook Chariow bout-en-bout (401 sur signature
invalide, idempotence du crédit sur rejeu, échec sans crédit), Credit
Ledger (atomicité, InsufficientCreditsError, débit nul sans écriture),
guards requireUser/requireAdmin (401/403, session expirée purgée).

### 6. Divers
- `next-intl` retiré (zéro usage) — l'i18n réelle (FR/EN) est un chantier
  séparé, à réintroduire avec des fichiers de locale quand elle sera faite.
- LICENSE MIT ajoutée (clarté juridique contributeurs/investisseurs).
- Trois templates sectoriels : réservation restaurant, facturation PME,
  prospection commerciale (clients cibles réels).

## Conséquences
- Le build peut échouer sur des erreurs de type : c'est voulu (le CI
  capture avant le déploiement).
- Les warnings React StrictMode apparaîtront en dev : à corriger au fil
  de l'eau, ils signalent de vrais problèmes d'idempotence des effets.
- CI exécute désormais un build complet (~2 min) — coût acceptable pour
  garantir que « ça déploie ».
