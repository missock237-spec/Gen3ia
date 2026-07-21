# Changelog

## [1.0.0] - 2026-07-21

### Phase 1 — Architecture & Scalabilite
- [x] Micro-service agent-engine (Hono/Bun) avec endpoints : execute, supervisor, checkpoint
- [x] Dockerfile pour le micro-service
- [x] docker-compose.agent.yml (agent-engine + Redis + PostgreSQL)

### Phase 2 — Experience Developpeur
- [x] SDK Python (genova-sdk pip) avec client complet
- [x] SDK TypeScript (@genova/agent-engine npm)
- [x] CLI genova-cli (agent list, run, deploy, test, logs)

### Phase 3 — Fonctionnalites Avancees
- [x] Agent Swarm orchestrator (7 roles, dependances, execution parallele)
- [x] Planificateur adaptatif Plan-and-Execute (retry, detection d'impasse)
- [x] Generation audio TTS (Hugging Face)
- [x] Human-in-the-loop (10 actions critiques)

### Phase 4 — Securite & Conformite
- [x] Guardrails anti-injection (11 patterns)
- [x] Detecteur d'hallucinations (second LLM, scoring)
- [x] Rate limiting granulaire (9 categories)

### Phase 5 — Performance
- [x] Cache semantique (similarite cosinus, embeddings)
- [x] Compression de contexte (economie tokens 40-60%)
- [x] Memoire vectorielle RAG (Qdrant)

### Phase 6 — Communaute & Business
- [x] Marketplace d'agents
- [x] Programme d'affiliation
- [x] Webhooks developpeurs

### Phase 7 — Qualite & Maintainabilite
- [x] Tests unitaires (23 tests)
- [x] CI/CD pipeline
- [x] Documentation API OpenAPI
- [x] Prisma migrations versionnees