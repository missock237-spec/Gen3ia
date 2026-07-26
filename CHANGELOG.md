# Changelog

## [0.6.0] - 2026-07-26
### 🚀 Compute Engine V2 — Cache adaptatif + Pipeline hybride + Predictor

#### 🧠 Cache LRU avec priorités
- Cache multi-niveaux avec 4 priorités : low (30s), normal (2min), high (10min), critical (1h)
- Éviction intelligente : priorité + LRU combinés
- Statistiques : hit rate, taille, évictions
- Nettoyage automatique des entrées expirées

#### 🔄 Pipeline d'opérations
- 5 étages : INPUT_VALIDATION → DATA_PREPARATION → COMPUTATION → POST_PROCESSING → RESULT_ASSEMBLY
- Timeout configurable par étape
- Retry avec backoff exponentiel
- Fallback personnalisable par étape
- Batch processing avec parallélisation
- Résultats partiels en cas d'échec

#### 🎯 Predictor de performance
- Historique des performances par backend/opération/taille
- Scoring basé sur success rate + durée moyenne
- Bucket-based estimation pour les nouvelles opérations
- Buckets de taille : 64, 256, 1K, 4K, 16K, 64K, 256K
- Auto-nettoyage de l'historique (max 1000 entrées)

#### ⚡ Orchestrateur EngineV2
- Cache-first : vérifie le cache avant tout calcul
- Prédiction : choisit le meilleur backend automatiquement
- Pipeline hybride : exécute via pipeline si disponible
- Fallback direct : utilise l'Engine v1 en dernier recours
- Batch parallélisé : répartit les opérations intelligemment
- API unifiée : `compute()`, `computeBatch()`, `registerPipeline()`

### 📁 Nouveaux fichiers
| Fichier | Description | Taille |
|---------|-------------|--------|
| `src/lib/compute/cache.ts` | Cache LRU avec priorités et éviction | 6.5 KB |
| `src/lib/compute/pipeline.ts` | Pipeline 5 étages avec retry/fallback | 10.5 KB |
| `src/lib/compute/predictor.ts` | Predictor de performance backend | 5.9 KB |
| `src/lib/compute/engine-v2.ts` | Orchestrateur principal | 10.6 KB |
| `src/lib/compute/index.ts` | Exports publics mis à jour | 872 B |

## [0.5.1] - 2026-07-26
### 🐛 Audit sécurité et dépendances

## [0.5.0] - 2026-07-26
### 🚀 Multi-Tenant, Agent Répl.IT, Playground API, Plugin Store

## [0.4.0] - 2026-07-26
### 📊 Dashboard temps réel, Templates vocaux, Webhook engine, Coverage 80%

## [0.3.0] - 2026-07-26
### 📡 SSE events, TTS multi-provider, API Keys, Upload, Tests E2E

## [0.2.0] - 2026-07-26
### 🖥️ WebGPU Compute, AI Router adaptatif, HuggingFace gratuit, CI/CD

## [0.1.0] - 2026-05-29
### 🚀 Première version