# Changelog

## [0.8.0] - 2026-07-26
### Recherche Web Temps Reel avec SerpAPI + DuckDuckGo fallback

#### Web Search Engine
- Recherche via SerpAPI (Google) en priorite
- Fallback automatique DuckDuckGo
- Cache 5 min, 6 types: web, images, news, video, shopping, scholar

#### Search AI
- searchWithAISummary(): resume via relayChat (Groq/OpenRouter)

#### API Endpoint /api/search
- GET /api/search?q=...&type=web|images|news&limit=10&summarize=true

### Fichiers
- src/lib/search/web-search.ts
- src/lib/search/search-ai.ts
- src/app/api/search/route.ts

## [0.7.2] - 2026-07-26
### Integration Relay complete dans AI Router + endpoints

## [0.7.1] - 2026-07-26
### Integration Relay System dans AI Router + API endpoint

## [0.7.0] - 2026-07-26
### Systeme de Relais Multi-Provider

## [0.6.2] - 2026-07-26
### Integration Compute V2 Voice Memory + Replit