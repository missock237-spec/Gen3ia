# 🤖 Genova — AI Agent Operating System

**Plateforme SaaS d'agents IA autonomes** — Next.js 16 + Prisma + PostgreSQL + TypeScript

[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=next.js)](https://nextjs.org/)
[![Prisma](https://img.shields.io/badge/Prisma-6-2D3748?logo=prisma)](https://www.prisma.io/)
[![License](https://img.shields.io/badge/License-MIT-green)](LICENSE)

---

## ✨ Fonctionnalités

- 🤖 **Agents IA autonomes** — Boucle ReAct avec mémoire, outils et supervision
- 🔄 **Workflows multi-étapes** — Automatisation avec dépendances et déclencheurs
- 💰 **Paiements Mobile Money** — Intégration SebPay pour l'Afrique (Orange Money, MTN, etc.)
- 🛡️ **Rate Limiting** — Protection intégrée (10 req/min auth, 60 req/min API)
- ✅ **Checkpoints** — Reprise sur panne sans perte de crédits
- 📊 **Logs structurés** — Monitoring en temps réel des exécutions
- 🐳 **Docker** — Déploiement simplifié avec Docker Compose
- 🔒 **Sécurité** — CSP, HSTS, Headers de sécurité, validation stricte TypeScript

## 🏗️ Architecture

```
- Frontend: Next.js 16 (App Router) + Tailwind CSS
- API Routes: Edge/Serverless
  - Agents (ReAct Loop)
  - Workflows (BullMQ)
  - Payments (SebPay)
  - Auth (Better Auth)
- Services Layer: Checkpoint, Supervisor, Logger, Cache
- Data Layer: Prisma (PostgreSQL) + Redis + Qdrant
```

## 🚀 Démarrage rapide

```bash
git clone https://github.com/missock237-spec/Genova.git
cd Genova
bun install
cp .env.example .env
bash scripts/start-pg.sh
bunx prisma migrate dev
bun run dev
```

## 🔧 Configuration

| Variable | Description | Requise |
|----------|-------------|---------|
| `DATABASE_URL` | Connexion PostgreSQL | ✅ |
| `REDIS_URL` | Connexion Redis | ✅ |
| `SEBPAY_API_KEY` | Clé API SebPay | ✅ |
| `NEXT_PUBLIC_APP_URL` | URL de l'application | ✅ |

### Plans d'abonnement

| Plan | Prix | Crédits | Features |
|------|------|---------|----------|
| Free | 0 FCFA | 10 | Agents de base, 1 workflow |
| Starter | 5 000 FCFA/mois | 1 000 | Agents illimités, 10 workflows |
| Pro | 15 000 FCFA/mois | 5 000 | Workflows illimités, prioritaire |
| Enterprise | 50 000 FCFA/mois | 25 000 | Support dédié, SLA, custom |

## 📚 API

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| `GET` | `/api/health` | État du service |
| `POST` | `/api/auth/register` | Inscription |
| `POST` | `/api/auth/login` | Connexion |
| `GET` | `/api/agents` | Liste des agents |
| `POST` | `/api/agents` | Créer un agent |
| `POST` | `/api/agents/:id/execute` | Exécuter un agent |
| `GET` | `/api/workflows` | Liste des workflows |
| `POST` | `/api/payments/subscribe` | S'abonner via SebPay |
| `POST` | `/api/payments/webhook` | Webhook SebPay |
| `GET` | `/api/payments/plans` | Plans d'abonnement |

## 📦 Déploiement

Déploiement Vercel recommandé :
```bash
vercel --prod
```

Ou avec Docker :
```bash
docker-compose up -d
```

## 🧪 Tests

```bash
bun run test          # Tests unitaires
bun run security:audit # Audit de sécurité
```

## 📄 Licence

MIT — Développé avec ❤️ au Cameroun