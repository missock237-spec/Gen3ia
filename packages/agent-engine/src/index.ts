// ============================================================
// @gen3ia/agent-engine — Bridge vers le vrai agent-engine
// ============================================================
//  Ce package était auparavant un package autonome avec 6 exports
//  (checkpoint, supervisor, rate-limiter, guardrail, semantic-cache,
//  context-compressor) pointant vers des fichiers inexistants.
//
//  L'implémentation réelle vit dans src/lib/agent-engine/ (Next.js app).
//  Ce fichier est conservé pour la compat du workspace Turborepo mais
//  réexporte depuis la source de vérité.
// ============================================================

export {
  executeAgentLoop,
  AgentManager,
  decomposeTask,
} from '@/lib/agent-engine';

export type {
  ExecutionContext,
  ExecutionStep,
  ExecutionPlan,
  PlanStep,
  PlanAdaptation,
  MultiAgentPlan,
} from '@/lib/agent-engine';

// Les modules suivants étaient exportés mais n'existaient pas.
// Ils sont désormais importés directement depuis src/lib/agent-engine/
// là où ils sont réellement implémentés :
//   - checkpoint      -> @/lib/agent-engine/checkpoint-manager.ts
//   - supervisor      -> @/lib/agent-engine/supervisor.ts
//   - rate-limiter    -> @/lib/agent-engine/rate-limiter.ts
//   - guardrail       -> @/lib/agent-engine/guardrail.ts
//   - semantic-cache  -> @/lib/agent-engine/semantic-cache.ts
//   - context-compressor -> @/lib/agent-engine/context-compressor.ts
