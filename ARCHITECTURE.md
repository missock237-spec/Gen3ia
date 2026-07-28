# Gen3ia — Architecture Guide

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
    R->>L: requete LLM
    L-->>R: reponse + tool_calls
    R-->>A: AIResponse
    A->>T: execute tool
    T-->>A: tool result
    A->>R: chat() avec historique
    R->>L: nouvelle requete LLM
    L-->>R: reponse finale
    R-->>A: AIResponse
    A-->>U: reponse
```

## Role de BullMQ

BullMQ (via Redis) gere les taches asynchrones :
- Appels vocaux sortants
- Analyse post-appel
- Deductions de credits
- Notifications utilisateur

## Role de PostgreSQL

- Utilisateurs, sessions, agents
- Historique des conversations
- Transactions de credits
- Campagnes publicitaires
- Configurations Twilio

## Flux de deduction des credits

```mermaid
flowchart LR
    T[Tache executee] --> CE[CreditEngine.calculateTaskCost]
    CE --> CI[CreditIntegrator.deductForExecution]
    CI --> CT[CreditTransaction creee]
    CT --> BA[Balance utilisateur mise a jour]
    CI --> AI[AICost enregistre]
```

## Securite

- Toutes les cles API chiffrees avec AES-256-GCM
- Sessions utilisateur hachees avec SHA-256
- Rate limiting par IP (100 req/min)
- CSP strict dans le middleware
- Webhooks Twilio avec validation HMAC

## Deploiement

- Next.js App Router
- PostgreSQL (via Prisma ORM)
- Redis (file BullMQ, cache)
- Twilio (voix)
- n8n (integrations)
