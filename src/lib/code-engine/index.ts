/**
 * Code Engine v4.0 — Plateforme universelle d'agents de code autonomes
 * 
 * Modules:
 * - sandbox: Execution securisee de code
 * - realtime-engine: Execution temps reel avec streaming
 * - generator: Generation automatique de code par IA
 * - deployer: Deploiement one-click en API live
 * - web-agent-core: Moteur d'autonomie pour agents
 * - orchestrator-core: Orchestration multi-agents
 * - api-gateway: Proxy securise vers API externes
 * - api-keys: Gestion des cles API
 * - persistence: Stockage persistant Prisma/PostgreSQL
 * - rate-limiter-redis: Rate limiting distribue Redis
 * - logger: Logger structure avec niveaux et contextes
 * - git-bridge: Integration GitHub
 * - comparator: Comparateur de code et versions
 * - openapi-export: Export OpenAPI 3.0
 * - sharing: Partage de sessions
 * - reviewer: AI Code Review
 */

// Execution securisee
export {
  executeCode,
  validateCode,
  checkExecutionQuota,
  createSession,
  getSession,
  updateSession,
  deleteSession,
  listUserSessions,
} from './sandbox';
export type { ExecutionRequest, ExecutionResult, CodeStudioSession } from './sandbox';

// Execution temps reel
export {
  createRealtimeExecution,
  executeRealtime,
  cancelExecution,
  getExecutionHistory,
  getExecution,
  forkExecution,
  addExecutionListener,
  analyzeCodeSecurity,
  realtimeEngine,
} from './realtime-engine';
export type { ExecutionEvent, RealtimeExecution } from './realtime-engine';

// Generation de code par IA
export {
  generateCode,
  generator,
} from './generator';
export type { GenerationRequest, GenerationResult } from './generator';

// Deploiement one-click
export {
  deployCode,
  executeDeployment,
  listDeployments,
  deleteDeployment,
  renewDeployment,
  deployer,
} from './deployer';
export type { DeployRequest, DeployResult } from './deployer';

// Agent autonome
export {
  autonomousAgent,
} from './web-agent-core';
export type { AgentAction, ActionResult, AgentState, AgentMemory } from './web-agent-core';

// Orchestrateur multi-agents
export {
  orchestrator,
} from './orchestrator-core';
export type { OrchestrationGoal, SubTask, DeployedAgent, OrchestrationReport, AgentRole, TaskStatus } from './orchestrator-core';

// API Gateway securise
export {
  callApi,
  storeCredential,
  getCredential,
  deleteCredential,
  listCredentials,
  grantPermission,
  revokePermission,
  checkPermission,
  createAgentSession,
  validateAgentSession,
  getAuditLog,
  gatewayStats,
} from './api-gateway';
export type { ApiProvider, HttpMethod, GatewayRequest, GatewayResponse, GatewayPermission, AuditEntry } from './api-gateway';

// Cles API
export {
  registerApiKey,
  validateApiKey,
  revokeApiKey,
  listUserKeys,
} from './api-keys';

// Persistence (NOUVEAU)
export {
  prisma,
  saveSession,
  updateSessionCode,
  getSession as getPersistedSession,
  getUserSessions,
  deleteSession as deletePersistedSession,
  getSessionByShareToken,
  incrementExecutionCount,
  saveExecution,
  getExecutionHistory as getPersistedExecutionHistory,
  saveDeployment,
  getUserDeployments,
  incrementDeploymentCallCount,
  deactivateDeployment,
  renewDeployment as renewPersistedDeployment,
} from './persistence';
export type { PersistedSession, PersistedExecution, PersistedDeployment } from './persistence';

// Rate Limiter Redis (NOUVEAU)
export {
  checkRateLimit,
  createRateLimiter,
  isRedisAvailable,
  codeExecutionLimiter,
  apiGatewayLimiter,
  orchestrationLimiter,
  generationLimiter,
  deployLimiter,
  authLimiter,
} from './rate-limiter-redis';
export type { RateLimitResult } from './rate-limiter-redis';

// Logger structure (NOUVEAU)
export {
  logger,
  log,
} from './logger';
export type { LogLevel, LogContext, LogEntry } from './logger';

// Git Bridge (NOUVEAU)
export {
  gitBridge,
} from './git-bridge';

// Comparateur de code (NOUVEAU)
export {
  diffCode,
  compareVersions,
  generateComparisonReport,
  createSnapshot,
  saveSnapshot,
  getSnapshots,
  compareSnapshots,
} from './comparator';
export type { CodeDiff, DiffLine, VersionSnapshot } from './comparator';

// OpenAPI Export (NOUVEAU)
export {
  generateOpenAPISpec,
  exportOpenAPIJson,
  exportOpenAPIYaml,
} from './openapi-export';
export type { OpenAPISpec } from './openapi-export';

// Sharing (NOUVEAU)
export {
  createShareLink,
  validateShareLink,
  logShareAccess,
  deactivateShareLink,
  getSessionShareLinks,
  getSharingStats,
} from './sharing';
export type { ShareLink, SharePermission } from './sharing';

// AI Code Reviewer (NOUVEAU)
export {
  reviewCode,
  generateReviewReport,
} from './reviewer';
export type { ReviewResult, ReviewIssue } from './reviewer';

// Version
export const VERSION = '4.0.0';
export const CODE_ENGINE = {
  name: 'Code Engine',
  version: '4.0.0',
  modules: [
    'sandbox', 'realtime', 'generator', 'deployer',
    'agents', 'orchestrator', 'gateway', 'persistence',
    'rate-limiter', 'logger', 'git-bridge', 'comparator',
    'openapi', 'sharing', 'reviewer',
  ],
  languages: ['javascript', 'typescript', 'python', 'html'],
  features: [
    'Execution securisee avec timeout et validation',
    'Streaming temps reel et debogage pas-a-pas',
    'Generation automatique de code par IA',
    'Deploiement one-click en API live avec OpenAPI',
    'Agents de code autonomes avec memoire et apprentissage',
    'Orchestration multi-agents (12 roles specialises)',
    'API Gateway securise (proxy credentials, audit)',
    'Persistence PostgreSQL via Prisma',
    'Rate limiting distribue Redis + fallback memoire',
    'Logger structure avec 6 niveaux et 11 contextes',
    'Integration GitHub (lecture, commit, PR)',
    'Comparateur de code et snapshots de versions',
    'Export OpenAPI 3.0 automatique',
    'Partage de sessions par lien (read/execute/edit)',
    'AI Code Review (securite, perf, style, erreurs, typage)',
  ],
};