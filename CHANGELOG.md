# Changelog

## [0.2.0] - 2026-07-26

### 🚀 Nouvelles fonctionnalités

#### 🔥 WebGPU Compute Engine
- Moteur de calcul avec support WebGPU (shaders WGSL) pour calculs GPU dans le navigateur
- Fallback automatique vers Web Workers (parallélisme CPU) puis CPU direct
- Opérations supportées : multiplication matricielle, convolution, attention, sigmoid, ReLU, softmax
- Pool de Workers avec répartition de charge aléatoire

#### 🤖 AI Router Amélioré
- Routage adaptatif basé sur les performances historiques (fiabilité, latence, coût)
- Cache intelligent des réponses (TTL configurable)
- Nouveau provider : Hugging Face (modèles gratuits)
- Filtrage par capacité (vision, reasoning, code, security)
- Budget maximum configurable par requête
- Mode "preferFree" pour prioriser les providers gratuits

#### 🖼️ Génération de contenu Hugging Face
- Client complet pour les modèles gratuits Hugging Face
- Génération d'images (Stable Diffusion 3.5, FLUX.1-schnell)
- Génération audio/musique (MusicGen, Bark TTS)
- Génération de texte (Mistral, Zephyr)
- Traduction (NLLB-200) et résumé (BART)
- TTS — Text-to-Speech

### 🔒 Sécurité
- Healthcheck : ne plus envoyer les clés API aux endpoints externes
- Ajout vérification de la validité des clés (longueur minimale)
- Variables d'environnement : ajout HUGGINGFACE_TOKEN, HEAP_THRESHOLD_MB

### 🛠️ Infrastructure
- Workflow CI amélioré avec cache, builds parallélisés, security scan
- Workflow de Release automatisé avec versioning sémantique (auto-détection major/minor/patch)
- Dependabot configuré pour npm, GitHub Actions, Docker, Cargo
- CODEOWNERS pour la revue de code par module
- Variables d'environnement complétées (20+ nouvelles entrées)

### 📝 Documentation
- CHANGELOG maintenu avec historique complet

## [0.1.0] - 2026-05-29

### 🚀 Première version
- Architecture Next.js + Prisma + PostgreSQL
- 55+ endpoints API
- Pipeline WhatsApp
- Routeur AI (Groq, OpenAI, Anthropic, OpenRouter)
- Moteur ReAct Loop
- Voice Agent (Twilio)
- Billing & Credits Engine
- Advertising Engine
- n8n intégration
- Docker Compose (dev, prod, GPU)
- Sentry monitoring
