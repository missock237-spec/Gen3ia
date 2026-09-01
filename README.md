# ⚡ GEN3IA — Plateforme de construction et d'orchestration d'agents IA

GEN3IA analyse vos demandes, **génère 5 plans**, les **compare** avec une formule d'évaluation pondérée, **exécute** le meilleur avec des **outils réels** (recherche web, calculs, code sandboxé, RAG), **vérifie** le résultat contre des critères prouvés, **corrige** les échecs automatiquement, **apprend** de chaque tâche et **livre** une réponse traçable — avec API publique et SDK.

```
Comprendre → Planifier → Comparer → Exécuter → Vérifier → Corriger → Évaluer → Apprendre → Livrer
```

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
| SIMULATING | Plan Evaluation Engine | Formule pondérée configurable (succès, coût, latence, risque, complétude) |
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
bun scripts/test-llm.ts        # couche IA (providers + JSON structuré)
bun scripts/test-pipeline.ts   # pipeline d'orchestration complet en réel
bun run lint                   # qualité de code
```

---

© 2026 GEN3IA — Tous droits réservés.
