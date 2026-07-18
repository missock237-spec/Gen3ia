/**
 * Code Engine — Module d'execution de code securise
 * 
 * Utilisation:
 * ```ts
 * import { executeCode, checkExecutionQuota, createSession } from '@/lib/code-engine';
 * const result = await executeCode({ code: 'console.log("hello")', language: 'javascript' });
 * ```
 */

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

export {
  registerApiKey,
  validateApiKey,
  revokeApiKey,
  listUserKeys,
} from './api-keys';

/**
 * Verifie si le code engine est disponible
 */
export function isCodeEngineAvailable(): boolean {
  return typeof globalThis !== 'undefined';
}

/**
 * Retourne la version du module
 */
export const VERSION = '1.0.0';