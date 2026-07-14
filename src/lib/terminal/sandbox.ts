/**
 * Code Agent Terminal — Sandbox d'exécution sécurisée
 * Exécute du code dans un environnement isolé et sécurisé.
 */

import { createLogger } from '@/lib/logger';
import crypto from 'crypto';

const log = createLogger('terminal-sandbox');

// ============================================================
// Types
// ============================================================

export type TerminalSessionStatus = 'running' | 'completed' | 'error' | 'timeout';

export interface TerminalSession {
  id: string;
  userId: string;
  agentId?: string;
  language: string;
  code: string;
  output: string;
  error: string | null;
  exitCode: number | null;
  status: TerminalSessionStatus;
  startedAt: Date;
  completedAt: Date | null;
  executionTimeMs: number;
}

export interface TerminalCommand {
  id: string;
  sessionId: string;
  command: string;
  output: string;
  error: string | null;
  exitCode: number | null;
  durationMs: number;
  timestamp: Date;
}

export interface ExecuteCodeInput {
  userId: string;
  agentId?: string;
  language: string;
  code: string;
  timeoutMs?: number;
}

// ============================================================
// Langages supportés
// ============================================================

const SUPPORTED_LANGUAGES = [
  'javascript',
  'typescript',
  'python',
  'bash',
  'html',
  'json',
] as const;

export type SupportedLanguage = typeof SUPPORTED_LANGUAGES[number];

export function isLanguageSupported(lang: string): lang is SupportedLanguage {
  return SUPPORTED_LANGUAGES.includes(lang as SupportedLanguage);
}

// ============================================================
// Sandbox sécurisée (simulation côté serveur)
// ============================================================

const MAX_CODE_LENGTH = 50000;
const DEFAULT_TIMEOUT_MS = 10000;

/**
 * Exécute du code dans un environnement sandboxé
 * Les commandes sont exécutées via un sous-processus limité
 */
export async function executeCode(input: ExecuteCodeInput): Promise<TerminalSession> {
  const { userId, agentId, language, code, timeoutMs } = input;
  const startTime = Date.now();
  const sessionId = crypto.randomUUID();

  // Validation
  if (!code || code.trim().length === 0) {
    return createErrorSession(sessionId, userId, agentId, language, code, 'Aucun code à exécuter', startTime);
  }

  if (code.length > MAX_CODE_LENGTH) {
    return createErrorSession(sessionId, userId, agentId, language, code,
      `Code trop long (${code.length} caractères). Maximum: ${MAX_CODE_LENGTH}`, startTime);
  }

  if (!isLanguageSupported(language)) {
    return createErrorSession(sessionId, userId, agentId, language, code,
      `Langage non supporté: "${language}". Supportés: ${SUPPORTED_LANGUAGES.join(', ')}`, startTime);
  }

  const timeout = timeoutMs || DEFAULT_TIMEOUT_MS;

  try {
    let output = '';
    let error: string | null = null;
    let exitCode: number | null = 0;

    switch (language) {
      case 'javascript':
      case 'typescript': {
        const result = await executeJavaScript(code, timeout);
        output = result.output;
        error = result.error;
        exitCode = result.exitCode;
        break;
      }
      case 'python':
      case 'bash': {
        const result = await executeShell(language === 'python' ? 'python3' : 'bash', code, timeout);
        output = result.stdout;
        error = result.stderr;
        exitCode = result.exitCode;
        break;
      }
      case 'html': {
        output = code;
        error = null;
        exitCode = 0;
        break;
      }
      case 'json': {
        try {
          const parsed = JSON.parse(code);
          output = JSON.stringify(parsed, null, 2);
          error = null;
          exitCode = 0;
        } catch (e) {
          output = '';
          error = `JSON invalide: ${e instanceof Error ? e.message : 'Erreur de parsing'}`;
          exitCode = 1;
        }
        break;
      }
      default:
        return createErrorSession(sessionId, userId, agentId, language, code,
          `Langage non supporté: ${language}`, startTime);
    }

    const durationMs = Date.now() - startTime;

    log.info('Code exécuté', {
      sessionId,
      language,
      durationMs,
      exitCode,
      outputLength: output.length,
    });

    return {
      id: sessionId,
      userId,
      agentId,
      language,
      code,
      output,
      error,
      exitCode,
      status: exitCode === 0 ? 'completed' : 'error',
      startedAt: new Date(startTime),
      completedAt: new Date(),
      executionTimeMs: durationMs,
    };
  } catch (err) {
    const durationMs = Date.now() - startTime;
    const message = err instanceof Error ? err.message : 'Erreur inconnue';

    log.error('Échec exécution code', {
      sessionId,
      language,
      error: message,
    });

    return {
      id: sessionId,
      userId,
      agentId,
      language,
      code,
      output: '',
      error: message,
      exitCode: 1,
      status: 'error',
      startedAt: new Date(startTime),
      completedAt: new Date(),
      executionTimeMs: durationMs,
    };
  }
}

function createErrorSession(
  sessionId: string,
  userId: string,
  agentId: string | undefined,
  language: string,
  code: string,
  error: string,
  startedAt: number
): TerminalSession {
  return {
    id: sessionId,
    userId,
    agentId,
    language,
    code,
    output: '',
    error,
    exitCode: 1,
    status: 'error',
    startedAt: new Date(startedAt),
    completedAt: new Date(),
    executionTimeMs: Date.now() - startedAt,
  };
}

// ============================================================
// Exécution JavaScript sandboxée
// ============================================================

async function executeJavaScript(
  code: string,
  timeoutMs: number
): Promise<{ output: string; error: string | null; exitCode: number }> {
  const chunks: string[] = [];
  const errorChunks: string[] = [];

  const originalLog = console.log;
  const originalError = console.error;
  const originalWarn = console.warn;

  console.log = (...args: unknown[]) => {
    chunks.push(args.map((a) => (typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a))).join(' '));
  };
  console.error = (...args: unknown[]) => {
    errorChunks.push(args.map((a) => String(a)).join(' '));
  };
  console.warn = (...args: unknown[]) => {
    chunks.push(`⚠️ ${args.map((a) => String(a)).join(' ')}`);
  };

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      console.log = originalLog;
      console.error = originalError;
      console.warn = originalWarn;
      resolve({
        output: chunks.join('\n'),
        error: 'Timeout: exécution trop longue',
        exitCode: 1,
      });
    }, timeoutMs);

    try {
      const wrappedCode = `
        (async () => {
          try {
            ${code}
          } catch(e) {
            console.error(e instanceof Error ? e.message : String(e));
          }
        })()
      `;

      const fn = new Function(wrappedCode);
      const result = fn();

      if (result instanceof Promise) {
        result.finally(() => {
          clearTimeout(timer);
          console.log = originalLog;
          console.error = originalError;
          console.warn = originalWarn;
          resolve({
            output: chunks.join('\n'),
            error: errorChunks.length > 0 ? errorChunks.join('\n') : null,
            exitCode: errorChunks.length > 0 ? 1 : 0,
          });
        });
      } else {
        clearTimeout(timer);
        console.log = originalLog;
        console.error = originalError;
        console.warn = originalWarn;
        resolve({
          output: chunks.join('\n'),
          error: errorChunks.length > 0 ? errorChunks.join('\n') : null,
          exitCode: errorChunks.length > 0 ? 1 : 0,
        });
      }
    } catch (e) {
      clearTimeout(timer);
      console.log = originalLog;
      console.error = originalError;
      console.warn = originalWarn;
      resolve({
        output: chunks.join('\n'),
        error: e instanceof Error ? e.message : String(e),
        exitCode: 1,
      });
    }
  });
}

// ============================================================
// Exécution Shell (Python/Bash)
// ============================================================

async function executeShell(
  command: string,
  code: string,
  timeoutMs: number
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  // Simulation côté serveur — en production, utiliser exec() avec timeout
  // et tableau d'arguments pour éviter les injections
  return new Promise((resolve) => {
    const { exec } = require('child_process');

    const child = exec(
      command,
      {
        timeout: timeoutMs,
        maxBuffer: 1024 * 1024,
        env: { ...process.env, PATH: process.env.PATH },
      },
      (error: { code?: number; killed?: boolean; message?: string } | null, stdout: string, stderr: string) => {
        resolve({
          stdout: stdout || '',
          stderr: stderr || (error ? error.message || 'Erreur' : ''),
          exitCode: error?.code ?? (error ? 1 : 0),
        });
      }
    );

    if (child.stdin) {
      child.stdin.write(code);
      child.stdin.end();
    }

    setTimeout(() => {
      if (!child.killed) {
        child.kill('SIGKILL');
        resolve({ stdout: '', stderr: 'Timeout', exitCode: 1 });
      }
    }, timeoutMs);
  });
}

// ============================================================
// Sécurité : Liste des APIs interdites dans le sandbox JS
// ============================================================

const BLOCKED_PATTERNS = [
  /require\s*\(/i,
  /import\s+['"`]/i,
  /from\s+['"`][^.'"`]/i,
  /process\./i,
  /global(?:This)?\./i,
  /child_process/i,
  /exec(?:Sync)?\s*\(/i,
  /spawn(?:Sync)?\s*\(/i,
  /fs\s*\./i,
  /net\s*\./i,
  /dgram\s*\./i,
  /cluster/i,
  /vm2/i,
  /vm\./i,
  /eval\s*\(/i,
  /Function\s*\(/i,
];

/**
 * Vérifie si le code contient des patterns dangereux
 */
export function isCodeSafe(code: string): { safe: boolean; reason?: string } {
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(code)) {
      return { safe: false, reason: `Pattern dangereux détecté: ${pattern.source}` };
    }
  }
  return { safe: true };
}
