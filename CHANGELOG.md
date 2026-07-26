# Changelog

## [0.4.0] - 2026-07-26

### 🚀 Nouvelles fonctionnalités

#### 📊 Dashboard Temps Réel
- Composant `LiveMetrics` connecté aux événements SSE en temps réel
- Métriques en direct : providers, requêtes/min, coût, crédits, latence
- Flux d'événements avec filtrage visuel par type
- Indicateur de connexion SSE avec reconnexion automatique

#### 🎤 Templates d'Agents Vocaux (6 templates)
- **Service Client 🇫🇷** — Support client empathique, gestion réclamations
- **Sales Agent 🇬🇧** — Qualification leads, présentation produits, closing
- **Support Technique 🛠️** — Diagnostic, guide pas-à-pas, escalade
- **Prise de Rendez-vous 📅** — Disponibilités, confirmation, rappel
- **Enquête Satisfaction 📋** — Notation, commentaires, feedback structuré
- **Recepcionista 🇧🇷** — Accueil en portugais, routage appels
- Fonction `applyTemplate()` pour appliquer une config complète

#### 🚀 Webhook Engine Amélioré
- `webhook-delivery.ts` — Moteur de livraison avec file d'attente
- Retry exponentiel (backoff: 1s, 2s, 4s — configurable)
- Signature HMAC-SHA256 pour sécuriser les payloads
- Logs de toutes les tentatives dans `webhook_logs`
- `deliverToAllSubscribers()` — Broadcasting multi-webhook
- Timeout configurable par webhook

#### 🧪 Couverture de Code (Vitest + V8)
- Seuils : statements 80%, branches 75%, functions 80%, lines 80%
- Rapports : text, json, lcov, html, clover
- Alias `@test` pour les imports de tests
- `test:coverage` script dans package.json

### 🔧 Améliorations
- Migration : table `webhook_logs` pour historique des livraisons

## [0.3.0] - 2026-07-26

### 🚀 Nouvelles fonctionnalités
- SSE Events pour monitoring temps réel
- TTS multi-provider (OpenAI, ElevenLabs, HuggingFace)
- API Keys développeurs avec scopes
- Upload fichiers avec validation
- Tests E2E Playwright

## [0.2.0] - 2026-07-26

### 🚀 Nouvelles fonctionnalités
- WebGPU Compute Engine
- AI Router amélioré
- Génération contenu HuggingFace

## [0.1.0] - 2026-05-29

### 🚀 Première version
