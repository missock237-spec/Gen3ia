# 🔧 Guide de développement — Gen3ia

Bienvenue ! Ce guide est la **référence unique** pour développer sur Gen3ia.

## Prérequis

- **Node.js** ≥ 20
- **Bun** ≥ 1.3 (le projet utilise `bun` — voir `bun.lock`)
- Optionnel : Docker (pour le déploiement VPS)

## Installation

```bash
git clone https://github.com/missock237-spec/Gen3ia.git
cd Gen3ia

# Variables d'environnement
cp .env.example .env.local

# Installer (utilise bun.lock — ne pas régénérer de package-lock.json)
bun install

# Générer le client Prisma
bun run db:generate
```

## Commandes courantes

| Commande | Rôle |
|---|---|
| `bun run dev` | Serveur de dev (`turbo run dev`) |
| `bun run build` | **`next build && turbo run build`** (app racine + packages) |
| `bun run build:packages` | Seulement `turbo run build` (packages) |
| `bun start` | Lancer le build de prod |
| `bun run lint` | ESLint via turbo |
| `bun run typecheck` | TypeScript via turbo |
| `bun test` | Tests Vitest via turbo |
| `bun run db:push` | Appliquer le schéma Prisma |
| `bun run db:seed` | Seed la base de données |

## Package manager — IMPORTANT

Ce projet utilise **bun** (`packageManager: bun@1.3.14`).
- **N'utilisez PAS** `npm`, `pnpm` ou `yarn` (conflit de lockfile).
- Après modification de `package.json`, faites `bun install` pour mettre à jour `bun.lock`.
- Le fichier `bun.lock` doit être commité (source des versions).
- `package-lock.json` est ignoré via `.gitignore` — ne jamais le committer.

## Structure et monorepo

```
Gen3ia/
├── src/                  # App Next.js (racine — migration vers apps/web en cours)
│   ├── app/              # Pages + routes API
│   ├── components/       # Composants UI
│   ├── lib/              # Logique métier (à migrer vers packages/core)
├── apps/web/             # Workspace de tests e2e (Playwright)
│   └── src/__tests__/
├── packages/core/        # Logique métier partagée (cible)
│   └── src/
│       ├── db.ts
│       ├── logger.ts
│       ├── env-validator.ts
│       ├── repositories/
│       ├── services/     # agent, credit, user services
│       └── validation.ts
├── prisma/               # Schéma DB + migrations
├── next.config.mjs       # Configuration Next.js unique (ESM, Next 14/15/16 compatible)
└── .github/workflows/    # CI/CD (UNIQUE endroit pour les workflows)
```

> ⚠️ Le monorepo est en migration. Voir **`docs/MONOREPO_MIGRATION.md`** pour le plan.
> L'app Next vit encore à la racine `src/`; `apps/web` sert de workspace de tests e2e.

## Sécurité des routes API

Toute nouvelle route API `/api/*` doit utiliser `withAuth()` de `src/lib/with-auth.ts` :

```typescript
import { withAuth } from '@/lib/with-auth';

export const POST = withAuth(async (req, ctx, auth) => {
  // auth.userId est l'utilisateur authentifié (jamais pris du body client)
  return NextResponse.json({ ok: true });
}, {
  requireAuth: true,
  roles: ['user'],
  rateLimit: { limit: 20, windowMs: 60000 },
  quota: true, // si la route consomme du LLM
});
```

## Source de vérité

Voir **`TRUTH_SOURCES.md`** à la racine — il établit quel fichier fait foi pour chaque outil.

## CI/CD

Les workflows GitHub vivent **uniquement** dans `.github/workflows/`.
Ne créez jamais de workflow à la racine (`ci.yml`, etc.) ni dans `github/`.

Workflows actifs : `ci.yml`, `security.yml`, `deploy-rules.yml`, `issues.yml`, `sync-secrets.yml`.
