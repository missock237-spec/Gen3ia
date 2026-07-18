/**
 * Code Engine v3.0 — Plateforme universelle d'agents de code autonomes
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

// Orchestrateur multi-agents (NOUVEAU)
export {
  orchestrator,
} from './orchestrator-core';
export type {
  OrchestrationGoal,
  SubTask,
  DeployedAgent,
  OrchestrationReport,
  AgentRole,
  TaskStatus,
} from './orchestrator-core';

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

// Version
export const VERSION = '3.0.0';
export const CODE_ENGINE = {
  name: 'Code Engine',
  version: '3.0.0',
  modules: ['sandbox', 'realtime', 'generator', 'deployer', 'agents', 'orchestrator', 'gateway'],
  languages: ['javascript', 'typescript', 'python', 'html'],
  features: [
    'Execution securisee avec timeout',
    'Streaming temps reel et pas-a-pas',
    'Generation automatique de code par IA',
    'Deploiement one-click en API live',
    'Agents de code autonomes avec memoire',
    'Orchestration multi-agents (12 roles)',
    'API Gateway securise (proxy credentials)',
    'Analyse de securite et scoring',
  ],
};