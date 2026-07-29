# Changelog

## [1.0.0] — 2026-07-29 — Version stable 🚀

### 🎯 Résumé

Passage à la version stable 1.0.0 avec **22 PRs** couvrant : infrastructure complète, tests exhaustifs, sécurité renforcée, monitoring, internationalisation africaine, interface dashboard, et génération de contenu multimédia.

### 🚀 Nouvelles fonctionnalités majeures

- **🧠 Qdrant Vector DB** (#124) : Base vectorielle scalable pour mémoire sémantique, 7 modèles, tests + dashboard Grafana
- **⚡ LLM Gateway** (#129) : Cache intelligent (mémoire + Redis), fallback 5 providers (OpenAI, Anthropic, Groq, OpenRouter, HuggingFace), retry automatique
- **🔐 JWT Sécurité** (#125) : Access tokens 15min, refresh rotation, jti unique, blacklist Redis, invalidation totale
- **🌍 i18n africain** (#135) : 6 langues (Français, English, Português, العربية, Hausa, Kiswahili) — 730M locuteurs couverts
- **💬 WhatsApp Cloud API** (#136) : Client complet d'envoi (texte, templates, boutons interactifs)
- **🎨 Génération média** (#134) : 7 modèles HF gratuits (SDXL-Turbo, FLUX.1, Stable Diffusion 3.5, ZeroScope vidéo, MusicGen)
- **⚡ Moteur de calcul** (#141) : Multiplication matricielle, convolution 2D, normalisation par batch, benchmark FLOPS
- **📖 Swagger/OpenAPI** (#127) : Documentation générée automatiquement depuis les schémas Zod (30+ routes)

### 🖥️ Dashboard administrateur (6 PRs)

- **Layout** (#137) : Sidebar 9 entrées, responsive mobile/desktop, thème dark
- **Accueil** (#137) : Stats temps réel (utilisateurs, agents, exécutions, abonnements)
- **Agents** (#138) : Liste des agents, création, statuts
- **Facturation** (#137) : 4 plans (Free/Starter/Pro/Enterprise) avec prix FCFA
- **Monitoring** (#138) : 6 services (API, DB, Redis, Qdrant, LLM, Cache)
- **Marketplace** (#139) : Recherche, 8 catégories, installation d'agents
- **Clés API** (#139) : Création, copie sécurisée, révocation
- **Paramètres** (#140) : 6 langues, notifications, sécurité
- **Appels vocaux** (#140) : Configuration agent vocal
- **Support** (#140) : FAQ et formulaire de contact

### 📊 Tests et qualité

- **58 tests crédits/webhooks** (#120) : Scénarios avancés de consommation, recharge, expiration
- **6 scripts k6** (#120) : Tests de charge agents, webhooks, crédits, BullMQ
- **20+ tests JWT** (#125) : Sign, verify, rotation, blacklist, cycle complet login→refresh→logout
- **15 tests E2E Playwright** (#132) : Auth, API, Crédits (3 navigateurs)
- **Tests OWASP Top 10** (#123) : 20+ tests de sécurité réels
- **Tests vector store** (#124) : Factory SQLite/Qdrant, upsert, search, hybrid retriever
- **Tests BullMQ** : Queue, déduction crédits, agent inactif

### 🔒 Sécurité

- **Snyk + Trivy** (#123) : Scan vulnérabilités automatisé dans CI/CD
- **CodeQL SAST** (#123) : Analyse statique JavaScript/TypeScript
- **JWT rotation** (#125) : Blacklist des anciens tokens, logout sécurisé
- **Webhooks HMAC** (#120) : Anti-replay, nonce, timestamp validation
- **Docker sécurisé** (#123) : Utilisateur non-root, healthcheck, npm audit

### 🌍 Internationalisation

- **6 langues** : Français, English, Português, العربية, Hausa, Kiswahili
- **Support RTL** : Arabe détecté automatiquement
- **42 marchés** africains couverts (Nigéria, Tanzanie, Kenya, Cameroun, RDC...)
- **Traductions complètes** : Navigation, auth, agents, facturation, marketplace, monitoring

### 📋 Infrastructure & CI/CD

- **Docker Compose staging** (#126) : 14 services, 2 réplicas app, Traefik TLS
- **Monitoring stack** (#121) : 5 dashboards Grafana (agents, API, BullMQ, DB, alertes)
- **Logs centralisés** (#122) : Loki + Promtail + Grafana, transport HTTP structuré
- **CI/CD unifié** (#133) : 7 workflows → 3 optimisés (lint → type-check → test → security → build)
- **Guide contribution** (#131) : 14.5KB, 9 sections, 8 exemples de code
- **Nettoyage dépôt** (#130) : ~25 fichiers résiduels supprimés/archivés

### 🐛 Corrections

- `verifyWebhookSignature` retournait toujours `true` → HMAC SHA-256 + timingSafeEqual (#120)
- `subpay.ts` : Fallback `signature === SUBPAY_WEBHOOK_SECRET` → HMAC standard (#129)
- `refresh/route.ts` : Conflit git `<<<<<<< HEAD` résolu (#125)
- `login/route.ts` : Access token 7 jours → 15 minutes (#125)
- `logout/route.ts` : Logout vide → blacklist + suppression session (#125)
- `Dockerfile` : npm audit + healthcheck + utilisateur non-root (#123)
- `package.json` : Overrides sécurité pour dépendances critiques

## [0.9.0] — 2026-07-28 — Session Monorepo & Terminal v2

### 🚀 Nouvelles fonctionnalités
- **Terminal v2.1** : Exécution bash réelle, auto-complétion TAB, historique ↑/↓, sudo protégé
- **Éditeur de fichiers inline** : edit, read, delete dans le terminal
- **WebSocket hook** : `useTerminalWS` avec reconnexion automatique
- **Mode PWA** : Service Worker v2 offline-first, cache partitionné
- **Docker** : Dockerfile multi-stage, docker-compose avec postgres/redis/traefik
- **CI/CD Release** : Pipeline tests + coverage 80% + auto-tag GitHub Release
- **Monorepo** : Structure `packages/`, `apps/`, `tsconfig.base.json`

## [0.8.0] — 2026-07-20

- Version initiale Gen3ia
- Agents IA avec boucle ReAct
- Authentication Google/GitHub
- Dashboard avec métriques
- Paiements Mobile Money (SebPay)
- WhatsApp integration
