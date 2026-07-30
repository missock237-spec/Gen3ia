# Gen3ia — AI Agent Operating System

Plateforme SaaS d'agents IA autonomes avec memoire, outils, supervision, et marketplace.

## Architecture

```
gen3ia/
├── apps/web/                 # Application Next.js
│   ├── Dockerfile              # Build Docker monorepo
│   └── package.json            # Dependances uniques (Radix UI, tests)
├── packages/
│   ├── core/                   # @gen3ia/core — Logique partagee
│   │   ├── src/repositories/     # Pattern Repository (CRUD Prisma)
│   │   ├── src/services/         # Logique metier (agents, credits, users)
│   │   ├── src/validation.ts     # Validation Zod pour les routes API
│   │   ├── src/errors.ts         # Gestion d'erreurs standardisee
│   │   └── src/index.ts          # Barrel export
│   ├── worker/                 # @gen3ia/worker — BullMQ (taches asynchrones)
│   └── agent-safety/           # @gen3ia/agent-safety — Module Rust
│       ├── Cargo.toml             # napi-rs, regex, serde
│       └── src/lib.rs             # Injection, jailbreak, ressources, sandbox
├── prisma/
│   ├── schema.prisma           # 50+ modeles, 55 indexes
│   └── migrations/             # Historique des migrations
├── Dockerfile                # Build multi-stage Next.js
├── Dockerfile.worker          # Build worker BullMQ
├── docker-compose.yml         # Orchestration (postgres, redis, app, worker, qdrant)
├── turbo.json                 # Pipeline de build monorepo
├── vercel.json               # Configuration deploiement Vercel
├── .env.example              # Template des variables d'environnement
├── .env.production           # Configuration production
└── setup.sh                   # Script de test local
```

## Demarrage rapide

```bash
# 1. Cloner et installer
git clone https://github.com/missock237-spec/Gen3ia.git
cd Gen3ia
npm install

# 2. Generer Prisma
npx prisma generate

# 3. Tester les builds
npm run build         # Build Next.js
npm run build:worker  # Build worker (TS -> JS)

# 4. Lancer en dev
npm run dev           # http://localhost:3000

# 5. Ou avec Docker Compose
docker compose up --build -d
```

## Services

| Service | Technologie | Port |
|---------|-------------|------|
| Web app | Next.js 14 + React 18 | 3000 |
| API | Next.js API routes | 3000 |
| Worker | BullMQ + Redis | - |
| Base de donnees | PostgreSQL 16 | 5432 |
| Cache | Redis 7 | 6379 |
| Vecteurs | Qdrant (optionnel) | 6333 |

## Variables d'environnement

Les variables **critiques** a configurer sur Vercel :

```bash
DATABASE_URL=postgresql://...
AUTH_SECRET=$(openssl rand -hex 64)
NEXTAUTH_SECRET=${AUTH_SECRET}
NEXTAUTH_URL=https://gen3ia.vercel.app
NEXT_PUBLIC_APP_URL=https://gen3ia.vercel.app
NODE_ENV=production
```

Voir `.env.example` pour la liste complete (40+ variables).

## Deploiement

1. Pousser sur `main` → CI (lint, test, build)
2. Vercel deploye automatiquement via l'integration GitHub
3. Configurer les secrets dans GitHub Settings → Secrets → Actions
4. Lancer `Sync Secrets to Vercel` pour synchroniser les variables

## Securite

- Module Rust `agent-safety` pour la detection d'injections et jailbreak
- Validation Zod systematique sur toutes les routes API
- Indexes Prisma optimises pour les requetes frequentes
- `NEXT_PUBLIC_` reserve aux variables publiques (aucun secret expose)

## Licence

Projet prive — Gen3ia AI
