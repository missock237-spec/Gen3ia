# ⚡ GEN3IA v4.0 — Infrastructure d'agents IA pilotée par Model & Compute Intelligence

GEN3IA analyse vos demandes, **génère 5 plans multi-modèles**, les **compare** avec une formule d'évaluation pondérée, **route chaque tâche vers le meilleur modèle IA** (Hugging Face en couche principale : Inference Providers, Endpoints, Jobs, Storage Buckets ; Gemini/GLM/OpenRouter/Groq/OpenAI en repli), **exécute** le meilleur plan avec des **outils réels** (recherche web, calculs, code sandboxé, RAG hybride Qdrant/pgvector, **1000+ applications externes via Composio**), **vérifie** le résultat, **apprend des succès et échecs réels de chaque modèle** (Model Performance Registry — la sélection s'améliore à chaque tâche) et **livre** une réponse traçable — avec API unifiée /v1 et SDK.

```
Comprendre → Planifier (5 plans multi-modèles) → Router → Exécuter → Vérifier → Corriger → Évaluer → Apprendre (boucle modèles) → Livrer
```

---

## ✨ Nouveautés v4.0 — Model & Compute Intelligence Layer (Hugging Face)

- **Model Router intelligent** : chaque appel est routé vers le meilleur modèle selon la tâche (adéquation, taux de réussite HISTORIQUE mesuré, qualité, capacités, disponibilité, latence, coût) — décision tracée avec **raison lisible, alternatives, coût estimé et confiance** (`POST /api/v1/models/select`).
- **Model Registry** (table `AIModel`) : catalogue central des modèles — provider, capacités, contexte, coûts, statut — qui **évolue sans modification du code** (seed idempotent, synchronisation HF Hub, promotion/désactivation admin depuis le tableau de bord).
- **Boucle d'apprentissage du routage** : chaque exécution réelle alimente `ModelPerformance` ; l'agrégat glissant (demi-vie 14 jours) met à jour successRate/qualityScore/latence par modèle — le routeur privilégie progressivement les modèles réellement efficaces par catégorie de tâche.
- **5 plans multi-modèles** : chaque plan A-E peut utiliser un **modèle différent** (ex : A→Llama 70B HF, B→Llama 8B, C→Gemini Flash, D→GLM, E→Qwen Coder) — la diversité réduit les risques d'échec corrélé.
- **Hugging Face Provider** complet : Inference Providers (routeur OpenAI-compatible), **streaming SSE**, embeddings, vision multimodale, modèles privés/gated selon les droits du jeton, découverte du Hub.
- **HF Inference Endpoints** : gestion des endpoints dédiés (création, scale-to-zero/réveil, suppression, résolution d'URL par modèle) — compute garanti pour les charges critiques.
- **HF Jobs** : tâches longues (embeddings batch, batch-inference, preprocessing, fine-tuning…) sur file BullMQ dédiée — statuts complets (PENDING/RUNNING/COMPLETED/FAILED/CANCELLED), **idempotence par clé**, retry/timeout, checkpoints Bucket, drainage serverless (`PATCH /api/v1/jobs {"action":"drain"}`).
- **HF Storage Buckets** : 11 buckets logiques (repos datasets privés) — upload/download/list/move/copy/mount/delete — les **octets restent chez HF**, PostgreSQL ne conserve que les métadonnées ; le token HF ne sort jamais du serveur (passe-relais authentifié `/api/v1/files/download`).
- **Compute Scheduler** : choisit la meilleure infrastructure (routeur HF partagé ↔ endpoint dédié ↔ jobs ↔ repli externe) selon VRAM, durée, priorité, budget.
- **RAG multi-backends** : abstraction VectorStore — **Qdrant** (grande échelle), **Supabase pgvector** (proximité PostgreSQL), json portable (repli garanti) — sélection auto par environnement, fail-open, cloisonnement par utilisateur.
- **API unifiée v1 étendue** : `/api/v1/models`, `/api/v1/models/select`, `/api/v1/embeddings`, `/api/v1/files`, `/api/v1/knowledge`, `/api/v1/jobs` (OpenAPI 3.1 : `/api/openapi.json`, Swagger UI : `/docs/api`).
- **Tableau de bord admin « Registre & Compute »** : modèles (scores appris, activation/promotion), endpoints, jobs, buckets, classement de performance réelle, coût par modèle, dernières sélections justifiées.

Documentation complète : `docs/architecture-v4.md` (diagrammes Mermaid), `docs/huggingface-setup.md` (jeton, endpoints, jobs, buckets, RAG, dépannage).

---

## ✨ Nouveautés v3.3 — Connecteurs d'applications (Composio)

- **1000+ applications réelles** accessibles aux agents IA (GitHub, Slack, Notion, Gmail, WhatsApp, Google Sheets…) via l'API Composio v3.1 — client TypeScript natif, circuit breaker, zéro dépendance ajoutée (ADR-0014).
- **Connexion OAuth guidée** : page Connecteurs → autorisation chez le fournisseur → retour callback → statut ACTIVE ; les jetons restent dans le coffre Composio (GEN3IA ne stocke aucun secret applicatif).
- **3 outils moteur** (`composio_list_apps`, `composio_list_actions`, `composio_execute`) : le planner découvre les apps connectées, l'exécuteur agit de manière authentifiée — `composio_execute` est SENSIBLE (confirmation humaine HITL par défaut).
- Activation : `COMPOSIO_API_KEY` (gratuite sur dashboard.composio.dev) ; sans clé, fail-closed explicite — le catalogue d'outils n'expose même pas les outils inutiles (économie de tokens).

## ✨ Nouveautés v3.2 — Audit qualité externe (correctifs)

**Corrections prioritaires**
- **Typage strict effectif** : `ignoreBuildErrors: false` — le build ÉCHOUE sur toute erreur de type (plus de silence en prod) ; `tsc --noEmit` ajouté à la CI
- **React StrictMode réactivé** : détection des effets non idempotents dès le développement
- **Gestionnaire unique : bun** — CI (`bun install --frozen-lockfile`) et Dockerfile alignés sur `bun.lock` (fini la divergence npm/bun entre versions testées et déployées) — ADR-0013

**Sécurité & architecture**
- **Middleware central** : `/api/admin/*` bloqué en amont sans cookie de session (filet de sécurité contre l'oubli de garde sur une future route)
- **Tests du code « argent »** : 19 tests webhook Chariow (HMAC, idempotence, double-crédit impossible) + Credit Ledger (atomicité) + guards admin (401/403) — **83 tests au total**

**Divers**
- Pagination standard (limit + curseur) sur agents, clés API, documents, skills — rétro-compatible
- `next-intl` retiré (dépendance morte), **LICENSE MIT** ajoutée
- **3 templates sectoriels** : réservation restaurant, facturation PME, prospection commerciale (11 profils au total)
- ADR-0005 renforcée : modèle de menace explicite + **déclencheur de migration documenté** vers un isolat réel avant exposition d'exécution de code à des tiers

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
- **Templates d'agents** : 11 profils pré-configurés (analyste financier, chercheur académique, facturation PME, réservation restaurant…) déployables en un clic

Décisions d'architecture documentées : [`docs/adr/`](docs/adr/) (13 ADR).

---

## 🚀 Démarrage rapide

```bash
# 1. Installer les dépendances (bun — gestionnaire unique, voir ADR-0013)
bun install

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

`web_search` (recherche live) · `page_reader` (lecture de page) · `calculator` (évaluations exactes) · `code_runner` (bac à sable vm, 5 s, réseau coupé) · `knowledge_search` (RAG TF-IDF sur vos documents) · `memory_recall` · `http_fetch` (SSRF bloqué) · `datetime` · **`composio_list_apps` / `composio_list_actions` / `composio_execute` (1000+ apps externes — cf. /connectors)**

Les outils `code_runner`, `http_fetch` et `composio_execute` sont **sensibles** : ils déclenchent une approbation humaine (HITL) avant exécution.

## 🔌 Connecteurs d'applications (moteur local, architecture Composio adaptée — ADR-0014)

13 applications réelles, 77 actions exécutées **directement** contre leurs API publiques (aucun intermédiaire, aucun SaaS de connecteurs) :

`GitHub` · `Slack` · `Gmail` · `Google Calendar` · `Notion` · `Discord` · `Trello` · `Jira Cloud` · `Linear` · `Airtable` · `Telegram` · `Stripe` · `X (Twitter)`

- **Authentifications** : OAuth2 complet (code + PKCE, refresh automatique, révocation), OAuth1.0a (signature HMAC-SHA1 par requête), comptes de service Google (JWT RS256), import de tokens personnels (PAT GitHub, token Slack/Bot, Notion, Linear, Airtable, Telegram, Stripe), Basic (Jira).
- **Sécurité** : secrets chiffrés **AES-256-GCM** au repos (`ConnectedAccount.encryptedData`), state OAuth signé HMAC anti-CSRF à usage unique, jamais renvoyés par l'API.
- **Agents** : les actions des apps connectées apparaissent comme outils (`connector_github_create_issue`…) — joker `connectors`, préfixe `connector:<app>` ou action exacte dans la config de l'agent. Les actions en écriture sont marquées sensibles (HITL).
- **Activation OAuth** (optionnelle — sinon l'import de token suffit) : `GITHUB_CLIENT_ID/SECRET`, `SLACK_CLIENT_ID/SECRET`, `GOOGLE_CLIENT_ID/SECRET`, `TRELLO_CONSUMER_KEY/SECRET`, `X_CLIENT_ID/SECRET`. Recommandé : `CONNECTORS_ENCRYPTION_KEY` (hex 32 octets) pour une clé de chiffrement dédiée.
- **Vérification E2E réelle** : `BASE_URL=… GITHUB_TOKEN=ghp_… node scripts/connectors-verify.mjs` (appel authentifié à api.github.com, catalogue, erreurs propres).
- Page UI `/connectors` : catalogue, connexion, console d'exécution d'action. API : `/api/connectors/*`.

## ☁️ Composio Cloud — 300+ apps en un clic (v4.2, ADR-0016)

Intégration du **SDK officiel `@composio/core`** en complément du moteur local : avec une clé
API Composio, les ~300 apps gérées par leur plateforme deviennent connectables **en un clic**
(OAuth opéré par Composio, aucun identifiant local), et leurs outils s'exécutent par les agents
via le même registre (`connector_<app>_<ACTION>`).

- **Clé API** : `COMPOSIO_API_KEY` (env, prioritaire) **ou** panneau admin de la page
  Connecteurs (clé chiffrée AES-256-GCM en base, table `PlatformSecret`, rotation à chaud).
  Obtention : [dashboard.composio.dev](https://dashboard.composio.dev) → Settings → API Keys
  (gratuit pour développer).
- **Priorités** : OAuth local préconfiguré > Composio managé > import de token ;
  exécution : connexion locale active d'abord (secrets GEN3IA), relay Composio ensuite.
- **Sécurité** : la clé n'est jamais exposée au client ; vues de connexions sanitisées
  (id `cpc_`, statut, indice de compte) ; chaque appel réseau borné (15 s) ; span OTel.
- **API** : `POST /api/connectors/connect` (mode `COMPOSIO`), `GET /api/connectors/connections`
  (fusion locale + hébergée), `GET/POST/DELETE /api/admin/composio` (gestion de la clé, admin).
- Sans clé : comportement strictement inchangé (moteur local seul).

## 🛡 Action Gateway — permissions · risque · vérification · audit (v4.3, ADR-0017)

Couche de décision unique par laquelle passe **toute exécution d'action connecteur**
(agents, console, SDK, confirmations) :

```
Agent / Console → Risk Engine → Permission Engine → Exécution (local → Composio)
                → Result Verification (read-back) → Audit immuable → Résultat
```

- **Risk Engine** : score 0-100 à facteurs explicites (méthode HTTP, verbe du slug
  — compatible slugs Composio `GMAIL_SEND_EMAIL` —, catégorie finance, diffusion
  massive, montants). Niveaux LOW / MEDIUM / HIGH / CRITICAL.
- **Permissions** : motifs `app.action`, `app.*`, `*.action`, `*` — ALLOW (avec
  plafond de risque) ou **DENY prioritaire**, expiration, provenance (USER/ADMIN/HITL).
  Défaut sans permission : plafond MEDIUM (lectures et écritures standard).
- **HITL au niveau action** : risque au-dessus du plafond → demande de confirmation
  persistée (params chiffrés AES-256-GCM, TTL fail-closed) — approuvable/refusable
  depuis la page Connecteurs, avec « toujours autoriser jusqu'à NIVEAU » (permission
  persistante). CRITICAL exige toujours un accord explicite.
- **Tool Discovery** : le planner reçoit les actions réellement connectées de
  l'utilisateur (clés exactes `connector_<app>_<action>` + niveau de risque) ;
  `GET /api/connectors/discover?q=...` expose la même recherche.
- **Result Verification** : contrôles de forme + **read-back** (relecture de la
  ressource créée via l'action GET jumelle : issue GitHub, page Notion, carte
  Trello, issue Jira, dépôt GitHub).
- **Traçabilité** : chaque exécution persistée (`ConnectorExecution`) avec la
  chaîne `requestId → taskId → planId → stepIndex → executionId` + entrée
  `CONNECTOR_EXECUTED` dans la **chaîne d'audit immuable** (hash chaîné).
- **API** : `POST /api/connectors/execute` (champs enrichis), `GET
  /api/connectors/executions[/:id]`, `POST /api/connectors/executions/:id/confirm`,
  `GET/POST /api/connectors/permissions`, `DELETE /:id`.

## 🧭 Model Router (v4.0 — intelligent et apprenant)

Routage en deux niveaux, sans jamais coupler le cœur à un fournisseur :

1. **Model Router v2** (`src/lib/ai/router-v2.ts`) — pour chaque appel : score pondéré de TOUS les modèles actifs du registre (adéquation tâche 30 %, taux de réussite mesuré 22 %, qualité 16 %, capacités 12 %, disponibilité 8 %, latence 7 %, coût 5 %) → meilleur modèle + raison + alternatives + coût estimé + confiance ; contraintes dures (listes blanches/noires, fenêtre de contexte, commercial-only) ;
2. **Provider Abstraction** (`ModelProvider`) — adapters : **Hugging Face (principal)**, Gemini, ZAI, GLM, OpenRouter, Groq, OpenAI, customs par variables d'environnement ;
3. **Basculement de repli** — chaîne provider→provider en cas d'échec (fail-closed explicite si tout échoue) ;
4. **Boucle d'apprentissage** — chaque exécution mesure la performance réelle (`ModelPerformance`) et met à jour les scores du registre : le routage s'améliore avec l'usage.

L'ancien routage statique (`routeCall`) reste le repli garanti si le registre est indisponible — le pipeline ne casse jamais.

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
- **Middleware central : /api/admin/* bloqué sans session (filet de sécurité)**
- Clés API : SHA-256 uniquement, comparaison à temps constant
- Webhook Chariow : HMAC-SHA256 sur corps brut + idempotence
- Sandbox code : `node:vm`, 5 s, réseau et `require` neutralisés
- SSRF : adresses privées bloquées sur les outils HTTP
- Secrets : exclusivement en variables d'environnement
- Audit : journal append-only (auth, paiements, déploiements, HITL)

## 🧪 Tests

```bash
# Suite complète (83 tests) : unitaires + intégration pipeline (LLM simulé)
# + webhook/ledger/guards (code qui touche à l'argent)
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
