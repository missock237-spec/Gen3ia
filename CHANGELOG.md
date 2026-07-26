# Changelog

## [0.6.2] - 2026-07-26
### Integration Compute V2 - Voice Memory + Replit Agent

#### Voice Memory Compute
- voice-memory-compute.ts: recherche de similarite via sigmoid/softmax
- computeRelevance(): scoring des embeddings memoires en parallele
- searchSimilarMemories(): recherche semantique acceleree par GPU
- classifyVoiceInput(): classification en 5 categories via softmax

#### Replit Compute
- replit-compute.ts: analyse de code et scoring via EngineV2
- computeComplexity(): estimation complexite du code via sigmoid
- batchAnalyzeFiles(): analyse parallele de fichiers
- estimateExecutionDuration(): prediction duree d'execution

### Nouveaux fichiers
- src/lib/voice/voice-memory-compute.ts
- src/lib/agent/replit-compute.ts

## [0.6.1] - 2026-07-26
### Integration Compute V2 - Embeddings + Agent Safety

## [0.6.0] - 2026-07-26
### Compute Engine V2 - Cache LRU + Pipeline + Predictor

## [0.5.1] - 2026-07-26
### Audit securite et dependances

## [0.5.0] - 2026-07-26
### Multi-Tenant, Agent Repl.IT, Playground API, Plugin Store

## [0.4.0] - 2026-07-26
### Dashboard temps reel, Templates vocaux, Webhook engine, Coverage 80%

## [0.3.0] - 2026-07-26
### SSE events, TTS multi-provider, API Keys, Upload, Tests E2E

## [0.2.0] - 2026-07-26
### WebGPU Compute, AI Router adaptatif, HuggingFace gratuit, CI/CD

## [0.1.0] - 2026-05-29
### Premiere version