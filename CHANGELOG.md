# Changelog

## [0.5.0] - 2026-07-26

### 🚀 Nouvelles fonctionnalités

#### 🏢 Multi-Tenant
- Isolation complète des données par tenant (agents, conversations, uploads)
- 4 plans : free, pro, enterprise
- 4 rôles : owner, admin, member, viewer
- Permissions granulaires par rôle
- Cache tenant (5 min TTL)
- Rate limiting par quota (API, agents, stockage, utilisateurs)
- Comptage des membres avec limite par plan

#### 💻 Agent Répl.IT
- Agent de développement interactif
- Commandes : write, read, run, install, search, fix
- Sessions persistantes avec historique d\'exécution
- Itération automatique : analyse → génération → exécution → correction
- Jusqu\'à 3 itérations de correction automatique
- Support des langages : TypeScript, JavaScript, Python, HTML, CSS, JSON

#### 🎮 API Playground
- Interface interactive pour tester tous les endpoints Genova
- Endpoint POST `/api/playground` avec documentation GET
- 7 endpoints testables : chat, image, audio, translate, summarize, compute, stream
- Documentation automatique avec exemples et paramètres
- Messages d\'erreur explicites

#### 🛍️ Plugin Store
- 6 plugins pré-installés : Web Scraper, Email Sender, PDF Generator, SQL Query Engine, Image Editor Pro, WhatsApp Broadcast
- Catégories : tool, connector, template, skill, integration
- Système de permissions par plugin
- Hooks : before-agent-think, after-tool-execution, after-agent-response
- Installation/désinstallation avec suivi d\'utilisation

### 🗄️ Base de Données
- Migration 00005 : tables tenants, tenant_members, webhook_logs, api_usage
- Ajout colonne tenant_id aux tables agents, conversations, uploads
- Index optimisés pour les requêtes multi-tenant

## [0.4.0] - 2026-07-26
### 📊 Dashboard temps réel, Templates vocaux, Webhook engine, Coverage 80%

## [0.3.0] - 2026-07-26
### 📡 SSE events, TTS multi-provider, API Keys, Upload, Tests E2E

## [0.2.0] - 2026-07-26
### 🖥️ WebGPU Compute, AI Router adaptatif, HuggingFace gratuit, CI/CD

## [0.1.0] - 2026-05-29
### 🚀 Première version
