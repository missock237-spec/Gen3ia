# Genova AI — Architecture Guide

## Vue d'ensemble

```mermaid
flowchart TD
    Client[Client Web/Mobile] --> Next[Next.js App Router]
    Next --> API[API Routes /api/*]
    API --> Auth[Auth Middleware]
    Auth --> Session[Session Validation]
    API --> CreditEngine[Credit Engine]
    API --> VoiceEngine[Voice Agent Engine]
    API --> AdEngine[Ad Engine]
    CreditEngine --> DB[(PostgreSQL)]
    VoiceEngine --> DB
    AdEngine --> DB
    Next --> Twilio[Twilio Voice API]
    Twilio --> Webhooks[Voice Webhooks /api/voice/*]
    Webhooks --> VoiceEngine
```

## Boucle ReAct

```mermaid
sequenceDiagram
    participant U as Utilisateur
    participant A as Agent
    participant R as AIRouter
    participant T as Tool Executor
    participant L as LLM (Groq/OpenAI/Anthropic)

    U->>A: Prompt
    A->>R: chat()
    R->>L: requête LLM
    L-->>R: réponse + tool_calls
    R-->>A: AIResponse
    A->>T: execute tool
    T-->>A: tool result
    A->>R: chat() avec historique
    R->>L: nouvelle requête LLM
    L-->>R: réponse finale
    R-->>A: AIResponse
    A-->>U: réponse
```

## Rôle de BullMQ

BullMQ (via Redis) gère les tâches asynchrones :
- Appels vocaux sortants
- Analyse post-appel
- Déductions de crédits
- Notifications utilisateur

## Rôle de PostgreSQL

- Utilisateurs, sessions, agents
- Historique des conversations
- Transactions de crédits
- Campagnes publicitaires
- Configurations Twilio

## Flux de déduction des crédits

```mermaid
flowchart LR
    T[Tâche exécutée] --> CE[CreditEngine.calculateTaskCost]
    CE --> CI[CreditIntegrator.deductForExecution]
    CI --> CT[CreditTransaction créée]
    CT --> BA[Balance utilisateur mise à jour]
    CI --> AI[AICost enregistré]
```

## Sécurité

- Toutes les clés API chiffrées avec AES-256-GCM
- Sessions utilisateur hashées avec SHA-256
- Rate limiting par IP (100 req/min)
- CSP strict dans le middleware
- Webhooks Twilio avec validation HMAC

## Déploiement

- Next.js App Router
- PostgreSQL (via Prisma ORM)
- Redis (file BullMQ, cache)
- Twilio (voix)
- n8n (intégrations)
