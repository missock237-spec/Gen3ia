# Gen3ia — AI Agent Operating System

Plateforme SaaS d'agents IA autonomes avec mémoire, outils, supervision, marketplace, système de crédits et accès développeur (API & serveurs MCP).

## Fonctionnalités

- **Agents IA autonomes** — exécution, supervision et validation sécurisée
- **Système de crédits** — packs de crédits payants pour l'utilisation des agents
- **Paiements Chariow** — gestion des transactions et abonnements (carte bancaire)
- **Authentification** — email/mot de passe + Google OAuth
- **Espace développeur** — génération de clés API et de serveurs MCP personnalisés
- **Recommandation distribuée** — diffusion du SaaS au sein des agents IA et navigateurs des utilisateurs
- **Sécurité** — module Rust `agent-safety` (injection, jailbreak, ressources, sandbox)

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
│   ├── schema.prisma           # Modeles + index optimises
│   └── migrations/             # Historique des migrations
├── Dockerfile                # Build multi-stage Next.js
├── Dockerfile.worker          # Build worker BullMQ
├── docker-compose.yml         # Orchestration (postgres, redis, app, worker, qdrant)
├── turbo.json                 # Pipeline de build monorepo
├── vercel.json               # Configuration deploiement Vercel
├── .env.example              # Template des variables d'environnement
└── setup.sh                   # Script de setup local (monorepo)
```

## Demarrage rapide

```bash
# 1. Cloner et installer
git clone https://github.com/missock237-spec/Gen3ia.git
cd Gen3ia
npm install

# 2. Generer Prisma
npx prisma generate

# 3. Tester les builds (monorepo)
npm run build --workspaces --if-present   # packages (core, worker, agent-safety)
npm run build                              # app Next.js

# 4. Lancer en dev
npm run dev                                # http://localhost:3000

# 5. Ou via Docker Compose (PostgreSQL, Redis, app, worker)
docker compose up --build -d
```

> **Astuce** : `bash setup.sh` orchestre toutes ces étapes automatiquement (installation, Prisma, builds, démarrage Docker).

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

# Paiements & OAuth
CHARIOW_API_KEY=...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
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
