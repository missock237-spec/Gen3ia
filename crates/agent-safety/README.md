# agent-safety — Moteur Rust de securite & performance pour agents IA

> package: `@gen3ia/agent-safety` (NAPI module)
> langage: Rust, edition 2024
> bindings: NAPI-6 (Node.js Addon)

## Role

Ce crate Rust est un **moteur de securite sandboxe** qui s'execute **cote serveur** pour proteger l'infrastructure Gen3ia contre les agents IA malveillants ou defaillants. Il est compile en **NAPI module** (`.node`) et appele directement depuis TypeScript.

## Architecture

```
TypeScript (Next.js)                    Rust (agent-safety)
+------------------+                  +--------------------------+
|  validatePrompt()|----> NAPI bind ->|  PromptInspector         |
|  validateTools() |                  |  - Injection patterns    |
|  checkResources()|                  |  - Jailbreak detection   |
|  startSession()  |                  |  - System prompt leak    |
|  getStatus()     |                  |  - Sensitive data        |
+------------------+                  |  - Loop detection        |
                                      +--------------------------+
                                      |  ToolValidator           |
                                      |  - Allowed list check    |
                                      |  - Blocked list check    |
                                      +--------------------------+
                                      |  ResourceLimiter         |
                                      |  - Memoire (max 512MB)   |
                                      |  - CPU (max 80%)         |
                                      |  - Tokens (max 128k)     |
                                      |  - Tool calls (max 100)  |
                                      +--------------------------+
                                      |  Sandbox                 |
                                      |  - file_read securise    |
                                      |  - file_write limite     |
                                      |  - network restreint     |
                                      |  - process interdit      |
                                      +--------------------------+
                                      |  ExecutionTracker        |
                                      |  - Sessions + timeout    |
                                      +--------------------------+
```

## Integration TypeScript

```typescript
import {
  validateAgentPrompt, validateAgentTools, checkAgentResources,
  startAgentExecutionSession, getExecutionSessionStatus, safetyInit,
} from '@gen3ia/agent-safety';

safetyInit();

// 1. Valider un prompt avant de l'envoyer au LLM
const verdict = validateAgentPrompt('Quelle est la meteo ?', 4096);
// -> { safe: true, risk_score: 0, flagged_categories: [], ... }

// 2. Valider les outils demandes
const validation = validateAgentTools(
  ['file_read', 'network_request'],
  ['read_only', 'safe_domains']
);

// 3. Demarrer une session
const sessionId = startAgentExecutionSession('agent_123', 30000);

// 4. Verifier les ressources
const resources = checkAgentResources(268435456, 45.0, 5000, 12);

// 5. Suivi
const status = getExecutionSessionStatus(sessionId);
```

## Modules

### 1. `prompt_inspector.rs` (8 KB)

7 patterns regex compiles en `LazyLock` :

| Pattern | Exemple | Poids |
|---------|---------|-------|
| Injection | `ignore all previous instructions` | 0.40 |
| Jailbreak | `DAN mode`, `sudo mode` | 0.35 |
| Fuite prompt | `reveal your system prompt` | 0.30 |
| Donnees sensibles | credit card, SSN, emails | 0.15 |
| Execution code | `write a code that does` | 0.20 |
| Boucle | 20+ mots identiques | 0.50 |

### 2. `tool_validator.rs` (4 KB)

Compare les outils demandes contre une liste blanche.

### 3. `sandbox.rs` (6.7 KB)

| Operation | Regles |
|-----------|--------|
| `file_read` | Bloque `/etc/shadow`, `/proc/`, `.env`, path traversal |
| `file_write` | Taille max 10MB, bloque `/etc/`, `/bin/` |
| `network_request` | HTTP/HTTPS only, bloque IP privees |
| `database_query` | Bloque DROP, ALTER, GRANT, injection SQL |
| `process_spawn` | **Toujours bloque** |
| `llm_inference` | Taille max 100 KB |

### 4. `execution_tracker.rs` (7.3 KB)

Sessions avec timeout.

### 5. `resource_limiter.rs`

| Ressource | Limite |
|-----------|--------|
| Memoire | 512 MB |
| CPU | 80% |
| Tokens | 128 000 |
| Tool calls | 100 |

## Tests Rust

```bash
cd crates/agent-safety && cargo test
```

## Build NAPI

```bash
cargo build --release -p agent-safety
# Options: LTO, panic=abort, strip, opt-level=3
```

## Flux complet

```
1. TS recoit requete utilisateur
2. validateAgentPrompt() -> PromptInspector
3. Si safe -> startAgentExecutionSession()
4. Pour chaque action :
   a. validateAgentTools() -> ToolValidator
   b. sandbox.validate_operation() -> Sandbox
   c. checkAgentResources() -> ResourceLimiter
5. getExecutionSessionStatus() pour monitoring
6. Si timeout ou violation -> session arretee
```
