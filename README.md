# 🤖 Gen3ia — AI Agent Operating System

**Plateforme SaaS d'agents IA autonomes** — Next.js 16 + Prisma + PostgreSQL + TypeScript

[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=next.js)](https://nextjs.org/)
[![Prisma](https://img.shields.io/badge/Prisma-6-2D3748?logo=prisma)](https://www.prisma.io/)
[![License](https://img.shields.io/badge/License-MIT-green)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-vitest-brightgreen)]()
[![CI/CD](https://img.shields.io/badge/CI%2FCD-GitHub%20Actions-blue)]()
[![Payments](https://img.shields.io/badge/payments-SebPay%20Africa-orange)]()

---

## ✨ Fonctionnalités

- 🤖 **Agents IA autonomes** — Boucle ReAct avec mémoire, outils et supervision
- 🔄 **Workflows multi-étapes** — Automatisation avec dépendances et déclencheurs
- 💰 **Paiements Mobile Money** — Intégration SebPay pour l'Afrique (Orange Money, MTN, Airtel, Moov)
- 🛡️ **Rate Limiting** — Protection intégrée (Upstash Redis + fallback mémoire)
- ✅ **Checkpoints** — Reprise sur panne sans perte de crédits
- 📊 **Logs structurés** — Pino JSON avec redaction des secrets
- 📈 **Métriques Prometheus** — Endpoint /api/metrics pour monitoring
- 🐳 **Docker** — Déploiement simplifié avec Docker Compose
- 🔒 **Sécurité** — CSP, HSTS, Headers, Zod validation, strict TypeScript

## 🏗️ Architecture

```
┌─────────────────────────────────────────────┐
│              Frontend Next.js 16            │
│         App Router + Tailwind CSS           │
├─────────────────────────────────────────────┤
│              API Routes (Edge)              │
├──────────┬──────────┬──────────┬────────────┤
│  Agents  │Workflows │ Payments │   Auth     │
│ (ReAct)  │ (BullMQ) │(SebPay)  │(BetterAuth)│
├──────────┴──────────┴──────────┴────────────┤
│            Services Layer                   │
│ Checkpoint │ Supervisor │ Logger │ Cache    │
├─────────────────────────────────────────────┤
│          Data Layer                         │
│  Prisma (PostgreSQL) + Redis + Qdrant      │
└─────────────────────────────────────────────┘
```

## 🚀 Démarrage rapide

```bash
# 1. Cloner le projet
git clone https://github.com/missock237-spec/Gen3ia.git
cd Gen3ia

# 2. Installer les dépendances
bun install

# 3. Copier et configurer l'environnement
cp .env.example .env

# 4. Lancer PostgreSQL et Redis (Docker)
docker-compose -f docker-compose.dev.yml up -d

# 5. Lancer les migrations + seed
bunx prisma migrate dev
bunx prisma db seed

# 6. Démarrer le serveur de développement
bun run dev
```

## 🔧 Configuration

### Variables d'environnement essentielles

| Variable | Description | Requise |
|----------|-------------|---------|
| `DATABASE_URL` | Connexion PostgreSQL | ✅ |
| `REDIS_URL` | Connexion Redis | ✅ |
| `SEBPAY_API_KEY` | Clé API SebPay | ✅ |
| `NEXT_PUBLIC_APP_URL` | URL de l'application | ✅ |
| `UPSTASH_REDIS_REST_URL` | Rate limiting distribué | ❌ |

### Plans d'abonnement

| Plan | Prix | Crédits | Agents |
|------|------|---------|--------|
| Free | **0 FCFA** | 10 | 1 |
| Starter | **5 000 FCFA/mois** | 1 000 | 10 |
| Pro ⭐ | **15 000 FCFA/mois** | 5 000 | 50 |
| Enterprise | **50 000 FCFA/mois** | 25 000 | Illimité |

## 📚 API

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| `GET` | `/api/health` | État du service |
| `GET` | `/api/metrics` | Métriques Prometheus |
| `POST` | `/api/agents/run` | Exécuter un agent (ReAct) |
| `GET` | `/api/payments/plans` | Plans d'abonnement |
| `POST` | `/api/payments/subscribe` | S'abonner via SebPay |
| `POST` | `/api/payments/webhook` | Webhook SebPay |

## 📦 Déploiement

### Vercel (recommandé)

```bash
vercel --prod
```

### Docker

```bash
docker-compose up -d
```

## 📊 Métriques

L'endpoint `/api/metrics` expose :
- `gen3ia_users_total` — Utilisateurs actifs
- `gen3ia_active_agents_total` — Agents actifs
- `gen3ia_executions_total` — Exécutions totales
- `gen3ia_active_subscriptions_total` — Abonnements actifs
- `gen3ia_uptime_seconds` — Uptime

## 🧪 Tests

```bash
bun run test              # Tests unitaires (Vitest)
bun run typecheck         # Vérification TypeScript
bun run security:audit    # Audit de sécurité
bun run lint              # ESLint
```

## 🌱 Seed (Données de démo)

```bash
bunx prisma db seed
```

Crée :
- Admin : `admin@gen3ia.ai` / `Admin123!`
- Démo : `demo@gen3ia.ai` / `Demo123!`
- 3 agents de démonstration
- Abonnement Pro + crédits

## 📄 Licence

MIT — Développé avec ❤️ au Cameroun