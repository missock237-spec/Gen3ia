# 🔧 Guide de développement — Gen3ia

Bienvenue ! Ce guide est la **référence unique** pour développer sur Gen3ia.

## Prérequis

- **Node.js** ≥ 20
- **npm** ≥ 10 (le projet utilise `npm`, pas bun ni pnpm)

## Installation

```bash
git clone https://github.com/missock237-spec/Gen3ia.git
cd Gen3ia

# Variables d'environnement
cp .env.example .env.local

# Installer (régénère package-lock.json)
npm install

# Générer le client Prisma
npm run db:generate
```

## Commandes courantes

| Commande | Rôle |
|---|---|
| `npm run dev` | Serveur de dev (`turbo run dev`) |
| `npm run build` | **`next build && turbo run build`** (app racine + packages) |
| `npm run build:packages` | Seulement `turbo run build` (packages) |
| `npm start` | Lancer le build de prod |
| `npm run lint` | ESLint via turbo |
| `npm run typecheck` | TypeScript via turbo |
| `npm test` | Tests Vitest via turbo |
| `npm run db:push` | Appliquer le schéma Prisma |
| `npm run db:seed` | Seed la base de données |

## Package manager — IMPORTANT

Ce projet utilise **npm** (`packageManager: npm@10.8.0`).
- **N'utilisez PAS** `bun` ou `pnpm`.
- Après modification de `package.json`, faites `npm install` pour régénérer `package-lock.json`.
- Le `package-lock.json` doit être commité (source des versions).

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
