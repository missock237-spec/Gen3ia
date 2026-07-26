# Changelog

## [0.7.2] - 2026-07-26
### Integration Relay System dans AI Router, Voice, Images, Videos, Audio

#### Relay AI Router Adapter
- RelayAIAgent: wrapper AIRouter + Relay System en priorite
- chat() essaie Relay (Groq -> OpenRouter -> OpenAI) puis fallback AIRouter
- chatStream() compatible streaming

#### Integration endpoints API
- /api/voice/tts: relay HuggingFace -> ElevenLabs
- /api/images: relay HuggingFace SD3.5 -> DALL-E
- /api/videos: relay HuggingFace ModelScope
- /api/audio: relay MusicGen -> OpenAI TTS

### Fichiers
- src/lib/relay/relay-ai-router-adapter.ts

## [0.7.1] - 2026-07-26
### Integration Relay System dans AI Router + API endpoint

## [0.7.0] - 2026-07-26
### Systeme de Relais Multi-Provider

## [0.6.2] - 2026-07-26
### Integration Compute V2 Voice Memory + Replit

## [0.6.1] - 2026-07-26
### Integration Compute V2 Embeddings + Agent Safety

## [0.6.0] - 2026-07-26
### Compute Engine V2 Cache LRU + Pipeline + Predictor

## [0.5.1] - 2026-07-26
### Audit securite

## [0.5.0] - 2026-07-26
### Multi-Tenant, Agent Repl.IT, Playground API