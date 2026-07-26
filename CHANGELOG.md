# Changelog — Genova AI Agent Operating System

## [Unreleased]

### Added
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

### Changed
- next-auth mis à jour 4.24.11 → 4.24.13 (CVE-2026-22028)
- npm engine mis à jour >=10.0.0 → >=12.0.0
- SEO enrichi (Open Graph, JSON-LD, sitemap, robots.txt)
