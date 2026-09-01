# ⚡ GEN3IA v3.1 — Plateforme de construction et d'orchestration d'agents IA

GEN3IA analyse vos demandes, **génère 5 plans**, les **compare** avec une formule d'évaluation pondérée, **exécute** le meilleur avec des **outils réels** (recherche web, calculs, code sandboxé, RAG), **vérifie** le résultat contre des critères prouvés, **corrige** les échecs automatiquement, **apprend** de chaque tâche et **livre** une réponse traçable — avec API publique et SDK.

```
Comprendre → Planifier → Comparer → Exécuter → Vérifier → Corriger → Évaluer → Apprendre → Livrer
```

---

## ✨ Nouveautés v3.1 — Fiabilité, qualité, observabilité

**Architecture & moteurs**
- **SDK de moteurs** : contrat strict `execute()` / `rollback()` / `getStatus()` + registre — ajout d'un nouveau moteur (ex : l'EthicsEngine fourni) sans toucher au cœur (ADR-0009)
- **RAG vectoriel** : embeddings persistés à l'ingestion (OpenAI-compatible ou repli local sans clé), recherche hybride 0.6·cosinus + 0.4·TF-IDF, réindexation en un clic (ADR-0003)
- **Learning actionnable** : les leçons d'échec ET de succès modulent l'évaluateur (prior par archétype A-E) et le planificateur (outils à éviter) ; patrons réutilisables persistés

**Qualité & fiabilité**
- **64 tests** (bun:test) : unitaires (évaluateur, éthique, breaker, erreurs, RAG, rate limit, machine à états) + **intégration pipeline complet** avec LLM simulé — `bun run test`
- **Erreurs centralisées** : catalogue de codes métier (PLANNING_FAILED, INSUFFICIENT_CREDITS, RETRY_BUDGET_EXCEEDED…)
- **Circuit breaker** par outil/fournisseur + **budget global de retries par tâche** (défaut 8) + backoff exponentiel avec jitter — fini les boucles infinies (ADR-0010)
- **SWITCH_TOOL câblé** : un outil défaillant est court-circuité, le moteur d'exécution bascule vers une approche alternative

**Performance & scalabilité**
- **Cache de plans** : exact (SHA-256) + sémantique (cosinus ≥ 0.92), TTL 7 j, fail-open (ADR-0011)
- **Checkpointing optimisé** : preuves volumineuses externalisées et compressées (gzip), checkpoint après CHAQUE étape d'exécution, fusions atomiques (verrouillage optimiste)

**Sécurité**
- **Sandbox durcie** : liste de refus des vecteurs d'échappement node:vm + audit systématique (ADR-0005)
- **Rate limiting unifié** : IP (login 10/min, inscription 5/h), utilisateur (120/min), clés API (60/min), webhook (120/min)

**Observabilité & UX**
- **Logger JSON structuré** avec rédaction des secrets + **métriques EngineRun** durables (taux de succès, latence p95 par moteur)
- **Interface admin Moteurs** : performances temps réel, état des breakers, pondérations d'évaluation éditables, purge du cache
- **Mode Explain** : sélection, édition et régénération des 5 plans AVANT exécution (ADR-0012)
- **Templates d'agents** : 8 profils pré-configurés (analyste financier, chercheur académique…) déployables en un clic

Décisions d'architecture documentées : [`docs/adr/`](docs/adr/) (12 ADR).

---

## 🚀 Démarrage rapide

```bash
# 1. Installer les dépendances
bun install        # ou npm install

# 2. Configurer l'environnement
cp .env.example .env
# → renseignez au minimum DATABASE_URL et une clé LLM (GLM_API_KEY recommandé)

# 3. Créer la base de données
bun run db:push

# 4. Lancer
bun run dev        # http://localhost:3000
```

Le **premier compte créé** devient administrateur. 25 crédits d'exécution sont offerts à l'inscription.

---

## 🧠 Le moteur d'orchestration

| Phase | Moteur | Rôle |
|---|---|---|
| ANALYZING | Prompt Analysis Engine | Objectifs, contraintes, risques, critères de succès vérifiables |
| PLANNING | Planner | 5 plans (A–E) : stratégie, étapes, outils, coûts, probabilité |
| SIMULATING | Plan Evaluation Engine + Ethics Engine | Formule pondérée configurable corrigée par l'historique, politique d'éthique déterministe |
| EXECUTING | Executor (ReAct) | Boucle d'outils réels avec journalisation et preuves |
| VERIFYING | Verification Engine | Critère non prouvé = critère non validé (anti-hallucination) |
| CORRECTING | Self-Correction Engine | Classification (transitoire/logique/outil/modèle) → RETRY, SWITCH_MODEL, REPLAN, ABORT |
| LEARNING | Learning Engine | Leçons mémorisées (5 couches) réutilisées par les tâches suivantes |
| DELIVERING | Orchestrator | Résultat + preuves + métriques + plan utilisé |

**Exécution reprise-ez** : chaque phase est un checkpoint persisté. Le pipeline avance à chaque sondage (compatible serverless — aucune file Redis requise pour démarrer).

## 🛠 Outils réels intégrés

`web_search` (recherche live) · `page_reader` (lecture de page) · `calculator` (évaluations exactes) · `code_runner` (bac à sable vm, 5 s, réseau coupé) · `knowledge_search` (RAG TF-IDF sur vos documents) · `memory_recall` · `http_fetch` (SSRF bloqué) · `datetime`

Les outils `code_runner` et `http_fetch` sont **sensibles** : ils déclenchent une approbation humaine (HITL) avant exécution.

## 🧭 Model Router

Routage par type de tâche avec basculement automatique de fournisseur :

1. **GLM (Z.AI intégré)** — moteur par défaut
2. **GLM (Zhipu BigModel)** — `GLM_API_KEY`
3. **OpenRouter** — `OPENROUTER_API_KEY`
4. **Groq** — `GROQ_API_KEY`
5. **OpenAI** — `OPENAI_API_KEY`
6. **HuggingFace** — `HUGGINGFACE_API_KEY`

## 💳 Crédits & paiements

- Chaque phase consomme des crédits calculés sur les tokens réels, **débités via le Credit Ledger** (chaque variation est une transaction journalisée — jamais de modification directe du solde).
- Recharges via **Chariow** (seul processeur autorisé) : `CHARIOW_API_KEY` + `CHARIOW_WEBHOOK_SECRET` (webhook HMAC-SHA256 vérifié, créditation idempotente).

## 🔌 API publique v1 (SDK)

Chaque agent publié expose :

```bash
curl -X POST $APP_URL/api/v1/chat \
  -H "Authorization: Bearer g3ia_live_..." \
  -H "Content-Type: application/json" \
  -d '{"message": "Bonjour", "agent_slug": "mon-agent"}'
```

- `POST /api/v1/chat` — conversation avec un agent publié
- `POST /api/v1/task` — pipeline d'orchestration complet (sync/async)
- `GET /api/v1/task/{id}` — statut + résultat (chaque appel fait avancer le pipeline)

SDK **JavaScript** et **Python** sans dépendance : page `/sdk` de l'application. Clés `g3ia_live_…` : SHA-256 stocké, secret visible une seule fois, révocation possible, 60 req/min.

## 📄 Structure

```
src/
  app/                    # Pages (App Router) — 19 routes
    (app)/                # Espace authentifié (shell + 14 pages)
    api/                  # ~25 routes API (auth, agents, tasks, v1 publique…)
  lib/
    ai/                   # Model Router + 6 fournisseurs + JSON structuré
    engines/              # Orchestrateur + 8 moteurs (analyse, plans, évaluation…)
    tools/                # Registre d'outils réels
    rag/                  # Découpage + récupération TF-IDF
    memory/               # Mémoire 5 couches
    credits/              # Credit Ledger (transactions atomiques)
    payments/             # Intégration Chariow (checkout + webhook HMAC)
    agents/               # Chat d'agent (RAG + mémoire)
    sdk/                  # Génération de clés + SDK
    auth/                 # scrypt + sessions httpOnly + clés API
  prisma/schema.prisma    # 15 modèles (users, agents, tasks, transactions…)
```

## 🏗 Déploiement

### Vercel (recommandé)
1. Importez le dépôt, framework Next.js détecté automatiquement.
2. Variables d'environnement : voir `.env.example`.
3. **Persistance en production** : définissez `DATABASE_URL` vers un Postgres (Neon/Supabase — gratuites). Sans Postgres, SQLite fonctionne mais est éphémère sur serverless.

### Docker
```bash
docker build -t gen3ia .
docker run -p 3000:3000 --env-file .env gen3ia
```

## 🔐 Sécurité

- Mots de passe : scrypt + sel aléatoire (jamais stockés en clair)
- Sessions : cookies httpOnly + SameSite, révocables (base)
- Clés API : SHA-256 uniquement, comparaison à temps constant
- Webhook Chariow : HMAC-SHA256 sur corps brut + idempotence
- Sandbox code : `node:vm`, 5 s, réseau et `require` neutralisés
- SSRF : adresses privées bloquées sur les outils HTTP
- Secrets : exclusivement en variables d'environnement
- Audit : journal append-only (auth, paiements, déploiements, HITL)

## 🧪 Tests

```bash
# Suite complète (64 tests) : unitaires + intégration pipeline (LLM simulé)
bun run test

# Test du pipeline avec un vrai LLM (requiert GLM_API_KEY)
bun run test:pipeline

# Test de la couche LLM (routage, repli, JSON structuré)
bun run test:llm
```

La suite d'intégration exécute une tâche complète (ANALYZING → COMPLETED) sur
une base dédiée (`db/test.db`) avec la couche LLM simulée : vérifie l'enchaînement
des moteurs, les checkpoints, la télémétrie EngineRun, le Credit Ledger,
l'apprentissage et le cache de plans — sans aucune clé API.
