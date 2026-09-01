import { localEmbed, cosineSimilarity } from "@/lib/rag/embeddings"
import type { EngineContext } from "@/lib/engines/sdk"
import type { Logger } from "@/lib/observability/logger"

/** Accès de test au fournisseur local (sans réseau, déterministe). */
export { localEmbed as localEmbedForTest }
export { cosineSimilarity }

/** Logger fantôme pour les contextes de moteur dans les tests. */
export const fakeLogger: Logger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
  child: () => fakeLogger,
  timer: () => ({ end: () => 0 }),
}

/** Contexte de moteur minimal pour les tests unitaires. */
export function fakeEngineContext(overrides: Partial<EngineContext> = {}): EngineContext {
  return {
    taskId: "test-task",
    userId: "test-user",
    agentId: null,
    settings: { maxAttempts: 3, confirmDangerousOps: true, planApproval: "auto" },
    allowedTools: [],
    memories: [],
    knowledgeContext: "",
    logger: fakeLogger,
    ...overrides,
  }
}
