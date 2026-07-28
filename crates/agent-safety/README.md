# agent-safety — Moteur Rust de sécurité & performance pour agents IA

> package: `@gen3ia/agent-safety` (NAPI module)
> langage: Rust, edition 2024
> bindings: NAPI-6 (Node.js Addon)

## 🎯 Rôle

Ce crate Rust est un **moteur de sécurité sandboxé** qui s'exécute **côté serveur** pour protéger l'infrastructure Gen3ia contre les agents IA malveillants ou défaillants. Il est compilé en **NAPI module** (`.node`) et appelé directement depuis TypeScript.

## 🏗️ Architecture

```
TypeScript (Next.js)                    Rust (agent-safety)
┌──────────────────┐                  ┌──────────────────────────┐
│  validatePrompt()├──► NAPI bind ──►│  PromptInspector         │
│  validateTools() │                  │  ├─ Injection patterns   │
│  checkResources()│                  │  ├─ Jailbreak detection  │
│  startSession()  │                  │  ├─ System prompt leak   │
│  getStatus()     │                  │  ├─ Sensitive data       │
└──────────────────┘                  │  └─ Loop detection       │
                                      ├──────────────────────────┤
                                      │  ToolValidator           │
                                      │  ├─ Allowed list check   │
                                      │  └─ Blocked list check   │
                                      ├──────────────────────────┤
                                      │  ResourceLimiter         │
                                      │  ├─ Mémoire (max 512MB)  │
                                      │  ├─ CPU (max 80%)        │
                                      │  ├─ Tokens (max 128k)    │
                                      │  └─ Tool calls (max 100) │
                                      ├──────────────────────────┤
                                      │  Sandbox                 │
                                      │  ├─ file_read sécurisé   │
                                      │  ├─ file_write limité    │
                                      │  ├─ network restreint    │
                                      │  └─ process interdit     │
                                      ├──────────────────────────┤
                                      │  ExecutionTracker        │
                                      │  └─ Sessions + timeout   │
                                      └──────────────────────────┘
```

## ⚡ Intégration TypeScript

### Installation

```bash
npm install @gen3ia/agent-safety
# Le build NAPI produit : agent-safety.linux-x64-gnu.node
```

### Utilisation

```typescript
import {
  validateAgentPrompt,
  validateAgentTools,
  checkAgentResources,
  startAgentExecutionSession,
  getExecutionSessionStatus,
  safetyInit,
} from '@gen3ia/agent-safety';

// Initialisation
safetyInit();

// 1. Valider un prompt avant de l'envoyer au LLM
const verdict = validateAgentPrompt(
  'Quelle est la météo ?',
  4096 // max tokens
);
// → { safe: true, risk_score: 0, flagged_categories: [], ... }

// 2. Valider les outils demandés par l'agent
const validation = validateAgentTools(
  ['file_read', 'network_request'],
  ['read_only', 'safe_domains']
);
// → { safe: true, allowed_tools: [...], blocked_tools: [] }

// 3. Démarrer une session d'exécution
const sessionId = startAgentExecutionSession(
  'agent_123',
  30000 // timeout 30s
);

// 4. Vérifier les ressources consommées
const resources = checkAgentResources(
  256 * 1024 * 1024, // 256 MB memory
  45.0,              // 45% CPU
  5000,              // 5k tokens
  12                 // 12 tool calls
);
// → { can_proceed: true, memory_exceeded: false, ... }

// 5. Suivi de session
const status = getExecutionSessionStatus(sessionId);
// → { is_active: true, elapsed_ms: 1500, remaining_ms: 28500, ... }
```

## 🧩 Modules

### 1. `prompt_inspector.rs` — Inspection de prompts (8 KB)

Détecte les **attaques par injection** en temps réel via 7 patterns regex compilés en `LazyLock` :

| Pattern | Exemple | Poids risque |
|---------|---------|-------------|
| **Injection de prompt** | `ignore all previous instructions` | 0.40 |
| **Jailbreak** | `DAN mode`, `sudo mode`, `developer mode` | 0.35 |
| **Fuite de prompt système** | `reveal your system prompt` | 0.30 |
| **Données sensibles** | `credit card`, `SSN`, emails | 0.15 |
| **Exécution de code** | `write a code that does` | 0.20 |
| **Boucle répétitive** | 20+ mots identiques consécutifs | 0.50 |

**Score total** : plafonné à `[0.0, 1.0]`
**Seuil de sécurité** : `risk_score ≥ 0.5` → bloqué

### 2. `tool_validator.rs` — Validation d'outils (4 KB)

Compare les outils demandés par l'agent contre une **liste blanche** :

```rust
validate_tools(
  &["file_read", "file_write", "network_request"],  // demandés
  &["file_read", "llm_inference"]                   // autorisés
)
// → safe: false, blocked: ["file_write", "network_request"]
```

### 3. `sandbox.rs` — Sandbox d'opérations (6.7 KB)

Valide les opérations élémentaires avec des règles strictes :

| Opération | Règles |
|-----------|--------|
| `file_read` | ✅ Chemins autorisés seulement. ❌ Bloque `/etc/shadow`, `/proc/`, `.env`, path traversal (`..`) |
| `file_write` | ✅ Taille max 10MB. ❌ Bloque écriture dans `/etc/`, `/bin/`, `/boot/` |
| `network_request` | ✅ HTTP/HTTPS seulement. ❌ Bloque IP privées (10.x, 192.168.x), localhost, metadata cloud |
| `database_query` | ✅ Lectures seulement. ❌ Bloque `DROP`, `ALTER`, `GRANT`, injection SQL (`--`, `/*`) |
| `process_spawn` | ❌ **Toujours bloqué** — aucun processus autorisé |
| `llm_inference` | ✅ Taille max 100 KB |

### 4. `execution_tracker.rs` — Suivi d'exécution (7.3 KB)

Gère les sessions d'exécution avec timeout :

```rust
start_session("agent_123", 30_000)  // 30s max
// → session_id: "sess_abc123..."

get_status("sess_abc123...")
// → { is_active: true, elapsed_ms: 1500, remaining_ms: 28500, ... }
```

### 5. `resource_limiter.rs` — Limiteur de ressources

Vérifie que l'agent ne dépasse pas les limites configurées :

| Ressource | Limite par défaut |
|-----------|------------------|
| Mémoire | 512 MB |
| CPU | 80% |
| Tokens par session | 128 000 |
| Appels d'outils | 100 |

### 6. `model.rs` — Modèles de données (3.9 KB)

Types partagés entre tous les modules, avec `Serialize + Deserialize` :

- `PromptVerdict` : résultat d'inspection
- `ToolValidationResult` : validation d'outils
- `ResourceCheckResult` : vérification des limites
- `ExecutionSessionStatus` : état d'une session
- `RiskCategory` : 9 catégories de risque (énumération)

### 7. `error.rs` — Gestion d'erreurs (1.3 KB)

```rust
pub enum AgentSafetyError {
    SandboxViolation(String),
    ResourceExceeded(String),
    InvalidSession(String),
    TimeoutExceeded(String),
}
```

## 🧪 Tests Rust inclus

```bash
cd crates/agent-safety
cargo test

# Test examples
# - test_sandbox_init
# - test_forbidden_file_read
# - test_network_request_blocked
# - test_process_blocked
```

## 📦 Build & Performance

```bash
# Build NAPI module (production)
cargo build --release -p agent-safety
# Produit : target/release/libagent_safety.so/.dylib/.dll

# Options de release
# - LTO activé
# - 1 codegen unit
# - panic = abort (pas de stack unwinding)
# - strip = true (symboles supprimés)
# - opt-level = 3 (optimisation max)
```

## 🔄 Flux complet d'un appel agent

```
1. TypeScript reçoit une requête utilisateur
2. validateAgentPrompt(prompt) ─────────► PromptInspector
3. ◄── { safe: true } ou { safe: false, reason: "..." }
4. Si safe → startAgentExecutionSession() ──► ExecutionTracker
5. Pour chaque action :
   a. validateAgentTools(tools) ──► ToolValidator
   b. sandbox.validate_operation(op) ──► Sandbox
   c. checkAgentResources() ──► ResourceLimiter
6. getExecutionSessionStatus() pour monitoring
7. Si timeout ou violation → session arrêtée
```

## 📊 Benchmarks

(Tests de performance à réaliser)

| Opération | Temps estimé (release) |
|-----------|----------------------|
| Inspection de prompt (100 mots) | < 5 µs |
| Validation d'outils (10 items) | < 2 µs |
| Vérification ressources | < 1 µs |
| Démarrage session | < 3 µs |
