# Gen3ia — AI Agent Operating System

## 🔥 Stack Firebase (v0.11+)

Gen3ia utilise désormais **Firebase** comme backend managed pour remplacer PostgreSQL/Prisma, NextAuth, le filesystem upload, le notification engine custom et l'analytics custom.

| Fonction Gen3ia | Service Firebase |
|---|---|
| Comptes utilisateurs | **Firebase Authentication** (email/password, Google, GitHub, MFA) |
| Profils utilisateurs | **Cloud Firestore** (collection `users`) |
| Historique des conversations | **Cloud Firestore** (collections `conversations` + `messages`) |
| Crédits utilisateurs | **Cloud Firestore** (collection `credits`) |
| Agents IA achetés/créés | **Cloud Firestore** (collection `agents`) |
| Fichiers/images | **Cloud Storage** (bucket `uploads/`) |
| Notifications | **Firebase Cloud Messaging** + Firestore (`notifications`) |
| Logs / analytics | **Firebase Analytics** + Firestore (`audit_logs`, `monitoring_events`) |
| Logique backend | **Next.js API Routes** + **Firebase Admin SDK** |

### Variables d'environnement

Copier `.env.example` vers `.env.local` puis renseigner :

```bash
# Client (exposées au navigateur)
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_APP_ID=

# Serveur (Firebase Admin SDK) — au choix :
# Format 1 : JSON complet
FIREBASE_SERVICE_ACCOUNT={"type":"service_account",...}
# Format 2 : variables séparées
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=
```

### Fichiers de configuration Firebase

- `firebase.json` — configuration CLI Firebase
- `firestore.rules` — règles de sécurité Firestore (deny-by-default, ownership-based)
- `firestore.indexes.json` — index composites (conversations, notifications, agents...)
- `storage.rules` — règles de sécurité Cloud Storage

### Modules Firebase

- `src/lib/firebase/config.ts` — configuration partagée
- `src/lib/firebase/client.ts` — Client SDK (navigateur)
- `src/lib/firebase/admin.ts` — Admin SDK (serveur)
- `src/lib/firebase/auth.ts` — Authentication (session cookies, ID token verify, MFA)
- `src/lib/firebase/firestore.ts` — Data layer (API Prisma-like sur Firestore)
- `src/lib/firebase/storage.ts` — Cloud Storage (upload, signed URLs, chunks)
- `src/lib/firebase/messaging.ts` — Cloud Messaging (push + inbox)
- `src/lib/firebase/analytics.ts` — Firebase Analytics + audit logs
- `src/lib/firebase/auth-client.ts` — Helpers client (signIn, signUp, Google/GitHub popup)

### Compatibilité (shims)

Les imports historiques `@/lib/db`, `@/lib/prisma`, `@/lib/auth`, `@/lib/upload`, `@/lib/notification-engine`, `@/lib/analytics`, `@/lib/audit-trail`, `@/lib/session` sont préservés et délèguent vers les modules Firebase. Les ~50 API routes existantes n'ont pas besoin d'être modifiées.

### Déploiement des règles Firebase

```bash
npm run firestore:rules    # Déploie firestore.rules
npm run storage:rules      # Déploie storage.rules
npm run firestore:indexes  # Déploie les index composites
npm run firebase:deploy    # Déploiement complet
```

### Émulateurs locaux

```bash
npx firebase emulators:start
```

UI disponible sur http://localhost:4000 (Auth :9099, Firestore :8080, Storage :9199).

---

Plateforme SaaS d'agents IA autonomes avec mémoire, outils, supervision, marketplace, système de crédits et accès développeur (API & serveurs MCP).

## Fonctionnalités

- **Agents IA autonomes** — exécution, supervision et validation sécurisée
- **Système de crédits** — packs de crédits payants pour l'utilisation des agents
- **Paiements Chariow** — gestion des transactions et abonnements (Mobile Money Afrique + carte bancaire)
- **Authentification** — email/mot de passe + Google OAuth (Firebase Auth)
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
│   │   ├── src/repositories/     # Pattern Repository (CRUD Firestore)
│   │   ├── src/services/         # Logique metier (agents, credits, users)
│   │   ├── src/validation.ts     # Validation Zod pour les routes API
│   │   ├── src/errors.ts         # Gestion d'erreurs standardisee
│   │   └── src/index.ts          # Barrel export
│   ├── worker/                 # @gen3ia/worker — BullMQ (taches asynchrones)
│   └── agent-safety/           # @gen3ia/agent-safety — Module Rust
│       ├── Cargo.toml             # napi-rs, regex, serde
│       └── src/lib.rs             # Injection, jailbreak, ressources, sandbox
├── firebase.json             # Configuration CLI Firebase (Firestore, Storage, Hosting, Emulators)
├── firestore.rules           # Regles de securite Firestore
├── firestore.indexes.json    # Index composites Firestore
├── storage.rules             # Regles de securite Cloud Storage
├── Dockerfile                # Build multi-stage Next.js
├── Dockerfile.worker          # Build worker BullMQ
├── docker-compose.yml         # Orchestration (redis, app, worker, qdrant)
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

# 2. Configurer l'environnement
cp .env.example .env.local   # puis renseigner les variables FIREBASE_*

# 3. Tester les builds (monorepo)
npm run build --workspaces --if-present   # packages (core, worker, agent-safety)
npm run build                              # app Next.js

# 4. Deployer les regles Firebase
npm run firestore:rules
npm run storage:rules
npm run firestore:indexes

# 5. Lancer en dev
npm run dev                                # http://localhost:3000

# 6. Ou via Docker Compose (Redis, app, worker)
docker compose up --build -d
```

> **Astuce** : `bash setup.sh` orchestre toutes ces étapes automatiquement (installation, règles Firebase, builds, démarrage Docker).

## Services

| Service | Technologie | Port |
|---------|-------------|------|
| Web app | Next.js 14 + React 18 | 3000 |
| API | Next.js API routes | 3000 |
| Worker | BullMQ + Redis | - |
| Base de donnees | Cloud Firestore (Firebase) | géré |
| Authentification | Firebase Auth | géré |
| Stockage | Cloud Storage (Firebase) | géré |
| Cache | Redis 7 | 6379 |
| Vecteurs | Qdrant (optionnel) | 6333 |

## Variables d'environnement

Les variables **critiques** a configurer sur Vercel :

```bash
# Firebase Auth + Admin SDK
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...
NEXT_PUBLIC_FIREBASE_APP_ID=...
FIREBASE_PROJECT_ID=...
FIREBASE_CLIENT_EMAIL=...
FIREBASE_PRIVATE_KEY=...

# Paiements & OAuth
CHARIOW_API_KEY=...
NEXT_PUBLIC_APP_URL=https://gen3ia.vercel.app
```

Voir `.env.example` pour la liste complete (40+ variables).

## Deploiement

1. Pousser sur `main` → CI (lint, test, build)
2. Vercel deploye automatiquement via l'integration GitHub
3. Configurer les secrets dans GitHub Settings → Secrets → Actions
4. Lancer `Sync Secrets to Vercel` pour synchroniser les variables
5. Deployer les regles Firebase : `npm run firebase:deploy`

## Securite

- Module Rust `agent-safety` pour la detection d'injections et jailbreak
- Validation Zod systematique sur toutes les routes API
- Regles de securite Firestore et Cloud Storage (deny-by-default, ownership-based)
- `NEXT_PUBLIC_` reserve aux variables publiques (aucun secret expose)

## Licence

Projet prive — Gen3ia AI
