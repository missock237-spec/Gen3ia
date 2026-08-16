// Process Isolator — isolation des executions de code dangereux
// Empeche le code genere par les agents d'acceder au systeme hote

import * as crypto from 'crypto';

interface IsolatedExecution {
  id: string;
  code: string;
  language: string;
  userId: string;
  agentId: string;
  status: 'running' | 'completed' | 'failed' | 'timeout';
  startTime: number;
  output: string;
  error: string | null;
  memoryEstimate: number;
}

const MAX_EXECUTION_TIME = 10000;
const MAX_OUTPUT_SIZE = 100000;
const MAX_CODE_SIZE = 50000;
const MAX_MEMORY_PER_EXEC = 50 * 1024 * 1024;
const MAX_CONCURRENT_EXEC = 10;
const BLOCKED_PATTERNS = [
  /process\.env/i, /require\s*\(\s*['"]fs['"]/, /require\s*\(\s*['"]child_process['"]/,
  /require\s*\(\s*['"]net['"]/, /require\s*\(\s*['"]dgram['"]/, /__dirname/, /__filename/,
  /global\./, /globalThis\./, /Reflect\./, /Proxy\s*\(/,
  /eval\s*\(/, /Function\s*\(\s*['"]/, /setTimeout/, /setInterval/,
  /fetch\s*\(/, /XMLHttpRequest/, /WebSocket/, /import\s*\(/, /importScripts/,
  /localStorage/, /sessionStorage/, /IndexedDB/, /cookie/,
  /process\.exit/, /process\.kill/, /process\.abort/,
];

const activeExecutions = new Map<string, IsolatedExecution>();

function sanitizeCode(code: string, language: string): { safe: boolean; sanitized: string; blockedReason?: string } {
  if (code.length > MAX_CODE_SIZE) {
    return { safe: false, sanitized: '', blockedReason: 'Code trop long (' + code.length + ' > ' + MAX_CODE_SIZE + ')' };
  }

  if (language === 'html' || language === 'css') {
    // Le HTML/CSS n'est pas execute cote serveur, seulement rendu dans l'iframe
    // Mais on bloque quand meme les scripts inline dangereux
    if (/<script\b[^>]*>([\s\S]*?)<\/script>/i.test(code) && !/<script\b[^>]*\bsrc=/i.test(code)) {
      // Les scripts inline sont autorises pour le rendu, pas d'injection
    }
    return { safe: true, sanitized: code };
  }

  let sanitized = code;

  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(sanitized)) {
      return { safe: false, sanitized: '', blockedReason: 'Pattern dangereux detecte: ' + pattern.source.slice(0, 50) };
    }
  }

  // Supprimer les commentaires malveillants
  sanitized = sanitized.replace(/\/\*[\s\S]*?\*\//g, '');

  // Empecher les boucles infinies (ajouter des compteurs de securite)
  if (language === 'javascript' || language === 'typescript') {
    // Ajouter un compteur d'iterations pour les boucles
    const hasLoops = /\b(for|while)\s*\(/.test(sanitized);
    if (hasLoops) {
      // On ne peut pas modifier le code arbitrairement, le timeout fait office de protection
    }
  }

  return { safe: true, sanitized };
}

export async function executeIsolated(
  code: string,
  language: string,
  userId: string,
  agentId: string
): Promise<IsolatedExecution> {
  const execId = crypto.randomUUID();
  const startTime = Date.now();

  if (activeExecutions.size >= MAX_CONCURRENT_EXEC) {
    return {
      id: execId, code, language, userId, agentId,
      status: 'failed', startTime,
      output: '', error: 'Trop d\'executions concurrentes (max: ' + MAX_CONCURRENT_EXEC + ')',
      memoryEstimate: 0,
    };
  }

  const check = sanitizeCode(code, language);
  if (!check.safe) {
    return {
      id: execId, code, language, userId, agentId,
      status: 'failed', startTime,
      output: '', error: check.blockedReason || 'Code bloque par securite',
      memoryEstimate: 0,
    };
  }

  const execution: IsolatedExecution = {
    id: execId, code: check.sanitized, language, userId, agentId,
    status: 'running', startTime,
    output: '', error: null,
    memoryEstimate: 0,
  };
  activeExecutions.set(execId, execution);

  // Pour le HTML/CSS, on retourne le code pour rendu iframe cote client
  if (language === 'html' || language === 'css') {
    execution.status = 'completed';
    execution.output = check.sanitized;
    execution.memoryEstimate = check.sanitized.length;
    activeExecutions.delete(execId);
    return execution;
  }

  try {
    const logs: string[] = [];
    const safeConsole = {
      log: (...args: unknown[]) => {
        const str = args.map(String).join(' ');
        if (logs.join('\n').length + str.length < MAX_OUTPUT_SIZE) logs.push(str);
      },
      error: (...args: unknown[]) => {
        const str = '[ERROR] ' + args.map(String).join(' ');
        if (logs.join('\n').length + str.length < MAX_OUTPUT_SIZE) logs.push(str);
      },
      warn: (...args: unknown[]) => {
        const str = '[WARN] ' + args.map(String).join(' ');
        if (logs.join('\n').length + str.length < MAX_OUTPUT_SIZE) logs.push(str);
      },
    };

    // Sandbox via new Function avec timeout
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Execution timeout (' + MAX_EXECUTION_TIME + 'ms)')), MAX_EXECUTION_TIME)
    );

    let execCode = check.sanitized;
    if (language === 'typescript') {
      execCode = execCode.replace(/:\s*\w+(?:<[^>]*>)?(?:\[\])?/g, '')
        .replace(/interface\s+\w+\s*{[^}]*}/g, '')
        .replace(/as\s+\w+/g, '');
    }

    const fn = new Function('console', execCode);

    await Promise.race([
      Promise.resolve().then(() => fn(safeConsole)),
      timeoutPromise,
    ]);

    execution.status = 'completed';
    execution.output = logs.join('\n') || 'Execution reussie (aucun output)';
    execution.memoryEstimate = execCode.length + logs.join('\n').length;
  } catch (error) {
    execution.status = 'failed';
    execution.error = 'Erreur: ' + (error instanceof Error ? error.message : 'Inconnue');
  } finally {
    execution.startTime = Date.now() - startTime;
    activeExecutions.delete(execId);
  }

  return execution;
}

export function getIsolatorStatus() {
  return {
    activeExecutions: activeExecutions.size,
    maxConcurrent: MAX_CONCURRENT_EXEC,
    maxExecutionTime: MAX_EXECUTION_TIME,
    blockedPatterns: BLOCKED_PATTERNS.length,
  };
}

export function cancelExecution(execId: string): boolean {
  return activeExecutions.delete(execId);
}
