# 🤖 Gen3ia — AI Agent Operating System

**Plateforme SaaS d'agents IA autonomes** — Next.js 16 + Prisma + PostgreSQL + TypeScript

[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=next.js)](https://nextjs.org/)
[![Prisma](https://img.shields.io/badge/Prisma-6-2D3748?logo=prisma)](https://www.prisma.io/)
[![Tests](https://img.shields.io/badge/tests-vitest-brightgreen)](https://vitest.dev)
[![Docker](https://img.shields.io/badge/docker-ready-2496ED?logo=docker)](https://docker.com)
[![Vercel](https://img.shields.io/badge/vercel-deploy-000000?logo=vercel)](https://vercel.com)
[![License](https://img.shields.io/badge/License-MIT-green)](LICENSE)
[![PRs](https://img.shields.io/badge/PRs-101-blueviolet)](https://github.com/missock237-spec/Gen3ia/pulls)

---

## ✨ Fonctionnalités

- 🤖 **Agents IA autonomes** — Boucle ReAct avec mémoire, outils et supervision
- 🔄 **Workflows multi-étapes** — Automatisation avec dépendances et déclencheurs
- 💰 **Paiements Mobile Money** — Intégration SebPay pour l'Afrique (Orange Money, MTN, Airtel, Moov)
- 🖥️ **Terminal intelligent** — Exécution bash réelle avec auto-complétion, historique, sudo protégé
- 🛡️ **Rate Limiting** — Protection intégrée (Upstash Redis + fallback mémoire)
- ✅ **Checkpoints** — Reprise sur panne sans perte de crédits
- 📊 **Logs structurés** — Pino JSON avec redaction des secrets
- 📈 **Métriques Prometheus** — Endpoint /api/metrics pour monitoring
- 🐳 **Docker** — Déploiement simplifié avec Docker Compose, Traefik
- 🔒 **Sécurité** — CSP, HSTS, Headers, Zod validation, strict TypeScript

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────┐
│              Frontend Next.js 16                │
│         App Router + Tailwind CSS               │
├─────────────────────────────────────────────────┤
│              API Routes (Edge)                  │
├──────────┬──────────┬──────────┬────────────────┤
│  Agents  │Workflows │ Payments │   Auth         │
│ (ReAct)  │ (BullMQ) │(SebPay)  │(BetterAuth)    │
├──────────┴──────────┴──────────┴────────────────┤
│            Services Layer                       │
│ Checkpoint │ Supervisor │ Logger │ Cache        │
├─────────────────────────────────────────────────┤
│          Data Layer                             │
│  Prisma (PostgreSQL) + Redis + Qdrant          │
└─────────────────────────────────────────────────┘
```

## 🖥️ Terminal Gen3ia (v2.1)

Terminal interactif avec exécution bash réelle, intégré directement dans l'interface.

### ⌨️ Commandes

| Commande | Description | Type |
|----------|-------------|------|
| `help` | Aide et liste des commandes | Local |
| `clear` | Nettoie le terminal | Local |
| `history` | Affiche l'historique | Local |
| `ls` | Liste les fichiers de la session | Local |
| `cat <f>` | Affiche un fichier | Local |
| `files` | Ouvre l'explorateur de fichiers | Local |
| `create <f>` | Crée un fichier avec template auto | Virtuel |
| `edit <f> <content>` | Édite un fichier sur le disque | Système |
| `read <f>` / `view <f>` | Lit un fichier du disque | Système |
| `delete <f>` / `rm <f>` | Supprime un fichier | Système |
| `pwd` | Affiche le chemin courant | Système |
| `echo <msg>` | Affiche un message | Système |
| `date` | Date serveur | Système |
| `whoami` | Utilisateur courant | Système |
| `version` | Version Gen3ia | Virtuel |

### ⚡ Fonctionnalités

- **Auto-complétion TAB** — Suggestions de commandes et fichiers en temps réel
- **Historique** — Navigation avec les flèches ↑/↓ (50 entrées max)
- **Barre de suggestions** — Suggestions cliquables au-dessus du terminal
- **Mode sudo protégé** — Dialogue de confirmation pour les commandes sensibles (apt, docker...)
- **Liste noire** — Commandes destructrices bloquées (rm -rf /, sudo, mkfs...)
- **Éditeur de fichiers** — Textarea inline avec sauvegarde dans `/tmp/gen3ia-workspace/`
- **Explorateur de fichiers** — Panneau latéral avec aperçu, copie, modification, suppression
- **SSE temps réel** — Événements serveur via `/api/terminal/events`
- **WebSocket** — Hook `useTerminalWS` avec reconnexion automatique

## 🐳 Déploiement Docker

```bash
# 1. Cloner le projet
git clone https://github.com/missock237-spec/Gen3ia.git
cd Gen3ia

# 2. Configurer les variables d'environnement
cp .env.example .env
# Éditer .env avec vos clés

# 3. Lancer avec Docker Compose
docker-compose up -d

# Avec proxy Traefik
docker-compose --profile proxy up -d

# Seed de la base de données
SEED_DATABASE=true docker-compose up -d

# 4. Accéder à l'application
open http://localhost:3000
```

## 🚀 Démarrage rapide (développement)

```bash
git clone https://github.com/missock237-spec/Gen3ia.git
cd Gen3ia

# Installation
npm install --legacy-peer-deps

# Base de données
docker-compose up -d postgres redis
cp .env.example .env.local
npx prisma generate
npx prisma db push
npx tsx prisma/seed.ts

# Lancement
npm run dev
```

## 🔧 Configuration

### Variables d'environnement essentielles

| Variable | Description | Requise |
|----------|-------------|---------|
| `DATABASE_URL` | Connexion PostgreSQL | ✅ |
| `REDIS_URL` | Connexion Redis | ✅ |
| `AUTH_SECRET` | Secret JWT (min 32 car.) | ✅ |
| `OPENAI_API_KEY` | Clé API OpenAI | ✅ |
| `NEXT_PUBLIC_APP_URL` | URL de l'application | ✅ |
| `HUGGINGFACE_API_KEY` | Génération d'images gratuite | ❌ |
| `STRIPE_SECRET_KEY` | Paiements Stripe | ❌ |

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
| `POST` | `/api/terminal/execute` | Exécuter une commande terminal |
| `GET` | `/api/terminal/events` | SSE temps réel terminal |
| `GET` | `/api/payments/plans` | Plans d'abonnement |
| `POST` | `/api/payments/subscribe` | S'abonner via SebPay |

## 📦 Déploiement

### Vercel

```bash
vercel --prod
```

### Docker

```bash
docker-compose up -d
```

## 🧪 Tests

```bash
npm run test              # Tests unitaires (Vitest)
npm run lint              # ESLint
npm run security:audit    # Audit de sécurité
```

## 🌱 Seed (Données de démo)

```bash
npx tsx prisma/seed.ts
```

Crée :
- Admin : `admin@gen3ia.ai` / `Admin123!`
- Démo : `demo@gen3ia.ai` / `Demo123!`
- 3 agents de démonstration
- Abonnement Pro + crédits

## 📄 Licence

MIT — Développé avec ❤️ au Cameroun
