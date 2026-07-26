# Changelog — Genova AI Agent Operating System

## [Unreleased]

### Added (Session en cours — Juillet 2026)
- 🏥 **Healthcheck enrichi** — Tests des 4 providers LLM (OpenAI, Anthropic, Groq, OpenRouter), Redis, version depuis package.json, headers X-Health
- ⚡ **Endpoint SSE** — Server-Sent Events temps réel pour notifications (appels vocaux, crédits, publicités) avec keepalive et broadcast multi-utilisateur
- 📤 **Upload amélioré** — Upload par chunks, matrice de types MIME (7 catégories), limites par type, vérification SHA-256, support des dimensions d'images via sharp
- 🔑 **API Keys développeurs** — Endpoint CRUD pour clés avec hash SHA-256, scopes, expiration, prefixe `gv_`
- 🌍 **Fichiers i18n** — Dictionnaires complets FR/EN/PT (JSON), +200 clés par langue (nav, auth, agents, billing, common, workspace, voice, marketplace, ads, monitoring, settings, errors)
- 🧪 **Config Vitest** — Couverture V8 avec seuils (60% statements), setup de tests global avec mocks, helpers createMockRequest/createMockFormData
- 🕸️ **Webhooks configurables** — Endpoint CRUD, test de livraison, signature HMAC-SHA256, logs de livraison, retry configurable

### Added (Session precedente)
- Moteur Rust agent-safety (PromptInspector, ToolValidator, ResourceLimiter, ExecutionTracker, Sandbox)
- Agents IA vocaux avec Twilio (passer/répondre appels, STT→LLM→TTS, analyse post-appel)
- Système d'intégration n8n (40+ connecteurs, 5 templates de workflows)
- Moteur de crédits avec déduction automatique basée sur l'effort et le coût des fournisseurs
- Sélection intelligente du fournisseur LLM selon le budget et la tâche
- Tests unitaires pour le credit-engine
- CHANGELOG.md

### Fixed
- Conflits de merge résolus dans api.ts, session.ts, ai-router.ts, human-in-the-loop.ts
- Vulnérabilités Dependabot corrigées (23 overrides dans package.json)
- CSP renforcé dans middleware.ts (form-action, retrait de unsafe-eval)
- Import crypto → node:crypto dans secret-vault.ts
- Blocage des protocoles data: et javascript: dans ssrf-protect.ts et sanitize.ts
- Workflow permissions ajoutées dans deploy.yml et main.yml (CodeQL alert #66)
- Fichier vide proxy.ts supprimé

### Security
- Overrides pour cookies, axios, follow-redirects, path-to-regexp, micromatch, minimatch, tar, word-wrap, tough-cookie, json5, loader-utils, express, ejs, nth-check, postcss, rollup, preact, undici, jose
- Secret-vault chiffre les credentials Twilio avec AES-256-GCM
- Audit logs pour toutes les sessions utilisateur
- Clés API hashées en SHA-256 avant stockage
- Signatures HMAC-SHA256 pour les webhooks sortants

### Changed
- next-auth mis à jour 4.24.11 → 4.24.13 (CVE-2026-22028)
- npm engine mis à jour >=10.0.0 → >=12.0.0
- SEO enrichi (Open Graph, JSON-LD, sitemap, robots.txt)
