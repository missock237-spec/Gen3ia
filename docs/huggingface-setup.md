# Configuration Hugging Face — GEN3IA v4.0

## 1. Jeton d'accès (HF_TOKEN)

Créez un jeton fine-grained : https://huggingface.co/settings/tokens

Droits recommandés :
- `Inference Providers` (lecture) — appels via le routeur ;
- `Read access to contents of all public gated repos you can access` — modèles gated ;
- `Write access to contents/settings of selected repos` — Buckets Storage (précisez les repos) ;
- `Inference Endpoints` (écriture) — gestion des endpoints dédiés (admin).

```bash
HF_TOKEN="hf_xxx..."
HF_ORG_ID=""            # optionnel : org hébergeant buckets/endpoints
HF_DEFAULT_PROVIDER="auto"
HF_DEFAULT_MODEL="meta-llama/Llama-3.3-70B-Instruct"
HF_BUCKET_PREFIX="gen3ia"   # préfixe des repos datasets (buckets)
```

**Le jeton ne sort JAMAIS du serveur** : le frontend passe par
`/api/v1/files/download` (passe-relais authentifié) pour lire les objets.

## 2. Inference Providers (routeur partagé)

Utilisé automatiquement par le `HuggingFaceProvider` via
`https://router.huggingface.co/v1` (compatible OpenAI : chat/completions,
embeddings, streaming SSE). Aucune configuration supplémentaire.

Modèles privés/gated : le jeton porte les droits ; une erreur 403 HF est
remontée telle quelle (jamais masquée).

## 3. Inference Endpoints (compute garanti)

Admin → onglet « Registre & Compute (v4) » → boutons `Sync endpoints` /
`Endpoints`, ou API :

```bash
POST /api/admin/models-registry {"action":"sync-endpoints"}
```

Création programmatique (déploiement payant — explicite) :
`src/lib/hf/endpoints.ts` (`createEndpoint`) — API officielle
`https://api.endpoints.huggingface.cloud/v2`. Scale-to-zero géré par
`setEndpointScale(name, 0|1)`.

Recommandation hardware : `hardwareRecommendation()` estime la VRAM
(paramètres × quantization + overhead KV-cache).

## 4. HF Jobs (tâches longues)

Kinds natifs HF (fine-tuning, dataset-generation, conversion) : soumis à
`https://huggingface.co/api/jobs`, suivis par polling (`syncNativeHFJobs`).

Kinds GEN3IA (embeddings-batch, batch-inference, preprocessing, evaluation,
media-processing) : worker BullMQ (file `gen3ia-hf-jobs`) si `REDIS_URL`,
sinon reprise par sondage `PATCH /api/v1/jobs {"action":"drain"}` ou
`GET /api/v1/jobs?id=...`. Idempotence par `idempotency_key`. Checkpoints
dans le Bucket `checkpoints/`.

## 5. Storage Buckets

11 buckets logiques = repos datasets **privés** HF créés à la demande :
`models, datasets, users, agents, knowledge, embeddings, generated,
checkpoints, artifacts, logs, temporary`.

```bash
# Déposer un fichier (API publique v1)
curl -X POST https://votre-domaine/api/v1/files \
  -H "Authorization: Bearer g3ia_live_..." \
  -d '{"path":"knowledge/rapport.pdf","content_base64":"...","bucket":"knowledge"}'

# Lister / télécharger / supprimer
curl "https://votre-domaine/api/v1/files?bucket=knowledge" -H "Authorization: Bearer ..."
curl "https://votre-domaine/api/v1/files/download?bucket=knowledge&path=rapport.pdf" -H "..."
curl -X DELETE "https://votre-domaine/api/v1/files?bucket=knowledge" -H "..." -d '{"path":"rapport.pdf"}'
```

## 6. RAG multi-backends

```bash
VECTOR_BACKEND="auto"   # auto | json | pgvector | qdrant
QDRANT_URL="https://qdrant.example.com"
QDRANT_API_KEY=""
```

- `auto` : Qdrant si URL, sinon pgvector si Postgres, sinon json ;
- chaque backend respecte le même contrat (`indexDocument`/`searchVector`) ;
- indisponibilité → fail-open json (la recherche ne casse jamais) ;
- les collections Qdrant sont cloisonnées par utilisateur (filtre payload).

## 7. Limites documentées

- L'API HF Jobs (produit récent) couvre nativement les jobs datasets/
  training ; les kinds GEN3IA sans équivalent natif sont exécutés par le
  worker interne via les Inference Providers (même contrat de statuts) ;
- les dimensionnalités d'embeddings Qdrant/pgvector sont figées par
  collection/table (une par modèle) ;
- l'upload Bucket passe par l'API commit Hub (limite ~5 Go/fichier HF) ;
  les fichiers plus volumineux doivent être découpés (jobs de conversion).

## 8. Dépannage

| Symptôme | Cause probable | Action |
|----------|----------------|--------|
| `HF_NOT_CONFIGURED` 503 | HF_TOKEN absent | définir HF_TOKEN |
| 403 sur un modèle | gated sans droit | accorder le droit au jeton (page du modèle → Agree and access) |
| Router sélectionne HF mais échec 5xx | provider sous-jacent indisponible | chaîne de repli automatique ; vérifier `/api/admin/models` |
| Bucket 404 | repo non créé | `ensureBucketRepo` est automatique ; vérifier les droits d'écriture du jeton |
| Qdrant connection refused | URL erronée | le système fail-open vers json — corriger QDRANT_URL |
