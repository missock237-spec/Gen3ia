# Changelog

## [0.3.0] - 2026-07-26

### 🚀 Nouvelles fonctionnalités

#### 📡 SSE Events — Notifications Temps Réel
- Endpoint SSE (`/api/events`) pour streaming temps réel
- Événements : llm_completion, voice_call, credit_deduction, agent_execution, image_generation, system_alert
- Filtrage par type d'événement via query params
- Heartbeat automatique toutes les 30s
- Hook `trackEvent()` pour émettre des événements depuis n'importe où

#### 🎤 TTS Amélioré (Multi-Provider)
- OpenAI TTS : voix alloy, echo, fable, onyx, nova, shimmer
- ElevenLabs TTS : voix Rachel, Domi, Bella, Antoni
- Hugging Face TTS : ESPnet VITS, Suno Bark (gratuit ✅)
- Cache audio intelligent (1h TTL)
- Fallback automatique: OpenAI → ElevenLabs → HuggingFace → Edge

#### 🔑 API Keys Développeurs
- Endpoint CRUD complet (`/api/keys`)
- Génération de clés sécurisées avec préfixe `gv_`
- Scopes : agents:read/write, voice:call, messages:send, billing:read
- Révocation de clés
- Expiration configurable

#### 📁 Upload de Fichiers
- Validation type MIME (20 formats supportés)
- Limite de taille : 10 MB
- Catégories : avatar, document, image, audio, video, general
- Stockage base64 sécurisé

#### 🌐 i18n
- Support complet : Français, Anglais, Portugais
- Configuration avec détection de langue navigateur
- 200+ clés de traduction

### 🧪 Tests
- Tests E2E Playwright pour l'agent vocal (8 scénarios)
- Tests E2E Playwright pour le billing/crédits (10 scénarios)
- Tests de bout en bout avec authentification

### 🗄️ Base de Données
- Nouvelle table `api_keys` pour les clés développeurs
- Nouvelle table `webhook_endpoints` pour les webhooks sortants
- Nouvelle table `uploads` pour les fichiers
- Index optimisés

## [0.2.0] - 2026-07-26

### 🚀 Nouvelles fonctionnalités
- WebGPU Compute Engine avec shaders WGSL
- AI Router amélioré : routage adaptatif, cache, HuggingFace
- Génération contenu HuggingFace (image, audio, texte, traduction, résumé)

## [0.1.0] - 2026-05-29

### 🚀 Première version
- Architecture Next.js + Prisma + PostgreSQL
- 55+ endpoints API, Pipeline WhatsApp, AI Router
