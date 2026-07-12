# 🤖 Genova — AI Agent Operating System

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-16-black)](https://nextjs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-blue)](https://www.postgresql.org/)
[![License](https://img.shields.io/badge/License-MIT-green)](#license)

Genova est une plateforme SaaS open-source pour orchestrer des agents IA, automatiser des workflows multi-canaux (WhatsApp, Email, API), et gérer des pipelines intelligents avec un routeur IA à fallback automatique.

---

## 🗺️ Table des matières

- [Architecture](#architecture)
- [Stack technique](#stack-technique)
- [Prérequis](#prérequis)
- [Installation rapide](#installation-rapide)
- [Configuration des variables d'environnement](#configuration)
- [Lancement en développement](#lancement)
- [Tests](#tests)
- [API — 58 endpoints](#api)
- [Roadmap](#roadmap)
- [Contribuer](#contribuer)
- [Licence](#licence)

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     Frontend (Next.js 16)                │
│    Dashboard · Auth Pages · Real-time Agent Console      │
└────────────────────────┬────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────┐
│                   API Layer (58 routes)                  │
│  /api/agents · /api/ai · /api/whatsapp · /api/auth ...   │
└──────┬──────────┬──────────┬──────────────┬─────────────┘
       │          │          │              │
  ┌────▼───┐ ┌───▼────┐ ┌───▼───┐ ┌───────▼──────┐
  │AI Router│ │BullMQ  │ │Baileys│ │  PostgreSQL   │
  │Groq/OR  │ │Queues  │ │WhatsApp│ │  (Prisma ORM) │
  └─────────┘ └────────┘ └───────┘ └───────────────┘
```

### Composants clés

| Composant | Description | Fichier |
|---|---|---|
| **AI Router** | Multi-provider (Groq + OpenRouter) avec fallback et retry exponentiel | `src/lib/ai-router.ts` |
| **Agent Engine** | ReAct loop, mémoire, outils | `src/lib/agent-engine/` |
| **WhatsApp Pipeline** | Baileys (session QR) + Cloud API | `src/lib/whatsapp-*.ts` |
| **Queue System** | BullMQ + Redis pour jobs asynchrones | `src/lib/queue/` |
| **Auth System** | PBKDF2 per-user salt, RBAC, rate-limit, email OTP | `src/lib/auth.ts` |
| **RAG** | Retrieval-Augmented Generation | `src/lib/rag/` |

---

## Stack technique

- **Frontend / Backend** : Next.js 16, React 19, TypeScript 5
- **Base de données** : PostgreSQL 16 via Prisma 6
- **Queues** : BullMQ + Redis
- **Auth** : PBKDF2 (per-user salt), sessions cookies, RBAC
- **Email** : Resend + Nodemailer SMTP
- **AI** : Groq, OpenRouter, z-ai-web-dev-sdk
- **WhatsApp** : @whiskeysockets/baileys, WhatsApp Cloud API
- **Monitoring** : OpenTelemetry + Prometheus
- **Styles** : Tailwind CSS 4, shadcn/ui
- **Runtime** : Bun 1.x

---

## Prérequis

- [Bun](https://bun.sh/) ≥ 1.1
- [Node.js](https://nodejs.org/) ≥ 20 (optionnel, Bun couvre la plupart des cas)
- [PostgreSQL](https://www.postgresql.org/) ≥ 14
- [Redis](https://redis.io/) ≥ 7 (optionnel en dev, obligatoire en prod)
- [Docker](https://docker.com/) (recommandé pour la base de données)

---

## Installation rapide

### 1. Cloner le projet

```bash
git clone https://github.com/missock237-spec/Genova.git
cd Genova
```

### 2. Installer les dépendances

```bash
bun install
```

### 3. Configurer les variables d'environnement

```bash
cp .env.example .env
# Édite .env avec tes valeurs (voir section Configuration)
```

### 4. Lancer la base de données (Docker recommandé)

```bash
docker-compose up -d postgres redis
# OU manuellement :
bun run db:setup
```

### 5. Appliquer les migrations Prisma

```bash
bun run db:push
```

### 6. Lancer le serveur de développement

```bash
bun run dev
```

L'application est accessible sur [http://localhost:3000](http://localhost:3000)

---

## Configuration

Copie `.env.example` en `.env` et remplis les valeurs suivantes :

### Obligatoires

```env
# Base de données PostgreSQL
GENOVA_DATABASE_URL=postgresql://user:password@localhost:5432/genova

# Sécurité auth (chaîne aléatoire longue, ex: openssl rand -hex 32)
AUTH_SALT=your-very-long-random-secret-salt
NEXTAUTH_SECRET=your-nextauth-secret

# URL de l'application
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### Optionnelles (AI)

```env
# Groq (https://console.groq.com)
GROQ_API_KEY=gsk_...

# OpenRouter (https://openrouter.ai)
OPENROUTER_API_KEY=sk-or-...
```

### Optionnelles (Email)

```env
# Resend (https://resend.com)
RESEND_API_KEY=re_...

# OU SMTP personnalisé
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your@email.com
SMTP_PASS=your-app-password
SMTP_FROM=noreply@yourdomain.com
```

### Optionnelles (WhatsApp Cloud API)

```env
WHATSAPP_PHONE_NUMBER_ID=your-phone-id
WHATSAPP_ACCESS_TOKEN=your-token
WHATSAPP_WEBHOOK_VERIFY_TOKEN=your-verify-token
```

### Optionnelles (Redis)

```env
REDIS_URL=redis://localhost:6379
```

---

## Lancement

```bash
# Développement (avec hot reload)
bun run dev

# Build de production
bun run build

# Lancer en production
bun run start

# Linter
bun run lint

# Tests
bun run test
```

---

## Tests

```bash
# Tous les tests
bun run test

# Tests en mode watch
bun run test --watch

# Couverture
bun run test --coverage
```

Les tests sont dans `src/__tests__/` et `src/lib/**/*.test.ts`.

---

## API

L'API REST expose **58 endpoints** organisés par domaine :

| Domaine | Préfixe | Description |
|---|---|---|
| Auth | `/api/auth` | Register, Login, Logout, Reset password, Verify email |
| Agents | `/api/agents` | CRUD agents, exécution, statut |
| AI | `/api/ai` | Chat, streaming, routing multi-provider |
| WhatsApp | `/api/whatsapp` | Envoi, webhooks, Baileys QR |
| Conversations | `/api/conversations` | Historique, messages |
| Knowledge | `/api/knowledge` | Base de connaissances RAG |
| Memory | `/api/memory` | Mémoire persistante des agents |
| Workflows | `/api/workflows` | Automatisation n8n-like |
| Monitoring | `/api/monitoring` | Métriques Prometheus |
| Billing | `/api/billing` | Plans, usage, Stripe |
| Admin | `/api/admin` | Gestion utilisateurs |

Documentation interactive disponible sur `/api-docs` (à venir).

---

## Roadmap

- [ ] v0.3 — Documentation API Swagger/OpenAPI
- [ ] v0.3 — Tests d'intégration complets
- [ ] v0.4 — Support Telegram et Slack
- [ ] v0.4 — Marketplace d'agents
- [ ] v0.5 — Multi-tenant (workspaces isolés)
- [ ] v1.0 — Release publique stable

---

## Contribuer

Voir [CONTRIBUTING.md](./CONTRIBUTING.md) pour le guide de contribution.

---

## Sécurité

Voir [SECURITY.md](./SECURITY.md) pour signaler une vulnérabilité.

---

## Licence

MIT — voir [LICENSE](./LICENSE)
