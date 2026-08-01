# 🔧 Guide de développement — Gen3ia

Bienvenue ! Ce guide est la **référence unique** pour développer sur Gen3ia.

## Prérequis

- **Node.js** ≥ 20
- **npm** ≥ 10 (le projet utilise `npm`, pas bun ni pnpm)

## Installation

```bash
# 1. Cloner
npm i -g git  # déjà présent en général
git clone https://github.com/missock237-spec/Gen3ia.git
cd Gen3ia

# 2. Variables d'environnement
# Copiez .env.example vers .env.local et remplissez vos valeurs
cp .env.example .env.local

# 3. Installer les dépendances (régénère package-lock.json)
npm install

# 4. Générer le client Prisma
npm run db:generate
```

## Commandes courantes

| Commande | Rôle |
|---|---|
| `npm run dev` | Serveur de dev sur http://localhost:3000 |
| `npm run build` | Build de production |
| `npm run start` | Lancer le build de production |
| `npm run lint` | ESLint (flat config `eslint.config.mjs`) |
| `npm run typecheck` | TypeScript noEmit |
| `npm test` | Tests Vitest |
| `npm run test:coverage` | Tests avec couverture |
| `npm run db:push` | Appliquer le schéma Prisma |
| `npm run db:seed` | Seed la base de données |
| `npm run db:studio` | Prisma Studio (GUI DB) |

## Package manager — IMPORTANT

Ce projet utilise **npm** (`packageManager: npm@10.8.0`).
- **N'utilisez PAS** `bun` ou `pnpm` — ils ne sont pas configurés.
- Après toute modification de `package.json`, faites `npm install` pour régénérer `package-lock.json`.
- Le `package-lock.json` doit être commité (source de vérité des versions).

## Structure

```
Gen3ia/
├── src/                  # Code Next.js (App Router)
│   ├── app/              # Pages + routes API
│   ├── components/       # Composants UI
│   ├── lib/              # Logique métier, helpers
│   ├── middleware.ts     # Sécurité (deny-by-default)
├── apps/web/             # Workspace web (Next.js)
├── packages/             # Workspaces (agent-engine, core, etc.)
├── prisma/               # Schéma DB
├── .github/workflows/    # CI/CD (UNIQUE endroit pour les workflows)
```

## Sécurité des routes API

Toute nouvelle route API `/api/*` doit utiliser le wrapper `withAuth()` de `src/lib/with-auth.ts` :

```typescript
import { withAuth } from '@/lib/with-auth';

export const POST = withAuth(async (req, ctx, auth) => {
  // auth.userId est l'utilisateur authentifié (jamais pris du body client)
  // Ne jamais faire confiance à un userId venu du body !
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
