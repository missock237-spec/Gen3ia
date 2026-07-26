# Changelog

## [0.7.0] - 2026-07-26
### Systeme de Relais Multi-Provider avec Tracking de Quotas

#### Relay System
- 5 chaines de relais : reasoning, voice, image, video, audio
- Tracking quotas daily + monthly avec persistance DB
- Cache memoire avec flush periodique (30s) vers DB
- Selection auto du provider : priorite, quota restant, cout
- Fallback automatique en cascade

#### Chaines
- **Reasoning**: Groq (free) -> OpenRouter (free) -> OpenAI -> Anthropic
- **Voice**: HuggingFace (free) -> ElevenLabs
- **Image**: HuggingFace (free) -> OpenAI DALL-E
- **Video**: HuggingFace (free) -> OpenAI
- **Audio**: HuggingFace MusicGen (free) -> OpenAI TTS

#### Relay Integrator
- chat(), synthesizeSpeech(), generateImage(), generateVideo(), generateAudio()
- getRelayReport() pour le monitoring des quotas

### Fichiers
- src/lib/relay/relay-system.ts (16.9 KB)
- src/lib/relay/relay-integrator.ts (13.7 KB)
- prisma/migrations/00006_add_relay_usage.sql

## [0.6.2] - 2026-07-26
### Integration Compute V2 - Voice Memory + Replit

## [0.6.1] - 2026-07-26
### Integration Compute V2 - Embeddings + Agent Safety

## [0.6.0] - 2026-07-26
### Compute Engine V2 - Cache LRU + Pipeline + Predictor

## [0.5.1] - 2026-07-26
### Audit securite

## [0.5.0] - 2026-07-26
### Multi-Tenant, Agent Repl.IT, Playground API