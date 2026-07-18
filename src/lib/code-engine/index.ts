/**
 * Code Engine — Module d'execution de code et gateway API securise
 * 
 * Utilisation:
 * ```ts
 * import { executeCode, callApi } from '@/lib/code-engine';
 * ```
 */

// Sandbox d'execution
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

export type {
  ExecutionRequest,
  ExecutionResult,
  CodeStudioSession,
} from './sandbox';

// Cles API
export {
  registerApiKey,
  validateApiKey,
  revokeApiKey,
  listUserKeys,
} from './api-keys';

// API Gateway securise pour agents de code
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

export type {
  ApiProvider,
  HttpMethod,
  GatewayRequest,
  GatewayResponse,
  GatewayPermission,
  AuditEntry,
} from './api-gateway';

/**
 * Verifie si le code engine est disponible
 */
export function isCodeEngineAvailable(): boolean {
  return typeof globalThis !== 'undefined';
}

/**
 * Retourne la version du module
 */
export const VERSION = '2.0.0';