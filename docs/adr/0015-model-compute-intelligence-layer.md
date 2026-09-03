# ADR-0015 — Model & Compute Intelligence Layer (Hugging Face comme infrastructure principale)

Date : 2026-09-04 — Statut : accepté — Version : 4.0.0

## Contexte

Gen3ia v3.6 route les appels LLM via un catalogue statique (8 modèles) et une
priorité codée par type de tâche. Les fournisseurs sont appelés directement
(zai, openai-compatible). Aucune mesure de la performance RÉELLE des modèles
n'influence le routage ; aucun usage des surfaces Hugging Face (Inference
Providers, Endpoints, Jobs, Storage) ; les vecteurs RAG vivent en JSON dans
PostgreSQL.

## Décision

Ajouter la **GEN3IA MODEL & COMPUTE INTELLIGENCE LAYER** sans remplacer
l'existant (règle EXISTANT > RÉUTILISER > AMÉLIORER > ÉTENDRE > CRÉER) :

1. **Provider Abstraction** (`ModelProvider`) — contrat unique
   (generate/stream/embed/vision/healthCheck/estimateCost/listModels/
   getModelMetadata). Les implémentations existantes sont enrobées par des
   adapters ; Gemini natif et les providers custom (env) sont ajoutés. Le
   planner et l'orchestrateur ne connaissent QUE cette abstraction.
2. **Model Registry** (table `AIModel` + `ModelCapability`) — évolution sans
   code : seed idempotent depuis les catalogues, synchronisation HF Hub
   (nouveaux modèles en EXPERIMENTAL), édition admin (statut, priorité).
   Champs appris (successRate, qualityScore, avgLatencyMs, sampleCount)
   séparés des champs statiques — jamais écrasés par le re-seed.
3. **Model Router v2** — score pondéré par TaskContext (adéquation 0.30,
   réussite mesurée 0.22, qualité 0.16, capacité 0.12, disponibilité 0.08,
   latence 0.07, coût 0.05), contraintes dures (providers, contexte,
   commercial-use), sortie justifiée (raison, alternatives, coût estimé,
   confiance). `routeCall()` historique conservé comme repli.
4. **Performance Registry** (`ModelPerformance`) — chaque appel mesuré
   (succès ET échec) ; agrégat glissant pondéré par récence (demi-vie 14 j,
   lissage exponentiel α≤0.3, promotion automatique EXPERIMENTAL→ACTIVE à
   ≥10 succès et ≥0.85). C'est la boucle d'apprentissage du routage.
5. **Hugging Face comme couche principale** — client HTTP typé sur les
   endpoints officiels uniquement (router.huggingface.co/v1,
   api.endpoints.huggingface.cloud/v2, huggingface.co/api/jobs,
   Hub datasets repos pour les Buckets). Aucun endpoint inventé.
6. **HF Jobs** — kinds natifs HF soumis à l'API jobs ; kinds GEN3IA exécutés
   par worker BullMQ dédié (même contrat de statuts) ; idempotence par clé.
7. **Compute Scheduler** — abstraction ComputeBackend (hf-router,
   hf-endpoint, hf-job, external) scorée par besoin (VRAM, durée, priorité).
8. **VectorStore abstraction** — backends json (portable, repli garanti),
   pgvector (Supabase), qdrant (grande échelle) ; sélection auto par
   environnement, fail-open.
9. **API unifiée étendue** — /api/v1/models, /models/select, /embeddings,
   /files (+download), /knowledge, /jobs.

## Conséquences

- 8 nouvelles tables Prisma (additives, migrations propres — pas de
  breaking change) ; 62 modèles au total ;
- la facturation des phases utilise le fournisseur RÉELLEMENT utilisé
  (fin du « zai » codé en dur dans chargePhase) ;
- les 5 plans portent chacun un modèle dédié (`Plan.model`,
  `modelOverride` exécuteur) — diversité A-E ;
- le token HF reste serveur uniquement (passe-relais authentifié pour les
  téléchargements) ;
- limites documentées : HF Jobs natifs limités aux kinds datasets/training ;
  Qdrant/pgvector dimensionnels par modèle ; fail-open json systématique.

## Alternatives rejetées

- Remplacer le routeur statique existant (cassé pour les environnements
  sans base) → conservé comme repli ;
- SDK Python HF dans le backend principal (la mission interdit Python sauf
  nécessité) → client HTTP TypeScript officiel ;
-/pgvector seul → trois backends derrière une même interface (portabilité
  SQLite préservée pour le développement).
