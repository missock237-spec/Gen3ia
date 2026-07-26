# Changelog

## [0.7.1] - 2026-07-26
### Integration Relay System dans AI Router + API endpoints

#### Relay Router
- relayChat(): remplace AI Router, utilise Groq -> OpenRouter -> OpenAI -> Anthropic
- relaySynthesizeSpeech(): TTS via HuggingFace -> ElevenLabs
- relayGenerateImage(): image via HuggingFace SD3.5 -> OpenAI DALL-E
- relayGenerateVideo(): video via HuggingFace ModelScope
- relayGenerateAudio(): audio via HuggingFace MusicGen -> OpenAI TTS
- getRelayStatus(): rapport complet de toutes les chaines

#### API Endpoint /api/relay
- GET: retourne le statut de toutes les chaines de relais
- POST action=chat: chat avec relay automatique
- POST action=tts: synthese vocale avec relay
- POST action=image: generation image avec relay
- POST action=video: generation video avec relay
- POST action=audio: generation audio avec relay

### Fichiers
- src/lib/relay/relay-router.ts (4.1 KB)
- src/app/api/relay/route.ts (2.8 KB)

## [0.7.0] - 2026-07-26
### Systeme de Relais Multi-Provider avec tracking quotas

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