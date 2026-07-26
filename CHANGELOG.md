# Changelog

## [0.6.1] - 2026-07-26
### 🔗 Integration Compute Engine V2 dans les modules metier

#### 🧠 Embeddings Compute
- `embeddings-compute.ts`: sigmoid/normalize/softmax via GPU
- `batchNormalize()` traitement parallele via computeBatch

#### 🛡️ Agent Safety Compute
- `agent-compute.ts`: scoreRisk/classifyPrompt/toolScoring
- Estimation cout execution via sigmoid

### 📁 Nouveaux fichiers
- `src/lib/memory/embeddings-compute.ts`
- `src/lib/agent/agent-compute.ts`

## [0.6.0] - 2026-07-26
### 🚀 Compute Engine V2 — Cache LRU + Pipeline 5 etages + Predictor

## [0.5.1] - 2026-07-26
### 🐛 Audit securite et dependances

## [0.5.0] - 2026-07-26
### 🚀 Multi-Tenant, Agent Repl.IT, Playground API, Plugin Store

## [0.4.0] - 2026-07-26
### 📊 Dashboard temps reel, Templates vocaux, Webhook engine, Coverage 80%

## [0.3.0] - 2026-07-26
### 📡 SSE events, TTS multi-provider, API Keys, Upload, Tests E2E

## [0.2.0] - 2026-07-26
### 🖥️ WebGPU Compute, AI Router adaptatif, HuggingFace gratuit, CI/CD

## [0.1.0] - 2026-05-29
### 🚀 Premiere version