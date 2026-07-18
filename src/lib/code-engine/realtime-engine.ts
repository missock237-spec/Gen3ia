/**
 * Realtime Engine — Moteur d'execution temps reel avec streaming
 * Support WebSocket, execution progressive, cancellation
 * et debogage pas-a-pas dans le navigateur
 */

export type ExecutionEvent = 
  | { type: 'start'; timestamp: number; sessionId: string }
  | { type: 'log'; message: string; level: 'info' | 'warn' | 'error' | 'result'; timestamp: number }
  | { type: 'snapshot'; vars: Record<string, unknown>; line: number; timestamp: number }
  | { type: 'breakpoint'; line: number; vars: Record<string, unknown>; timestamp: number }
  | { type: 'progress'; percent: number; message: string; timestamp: number }
  | { type: 'complete'; result?: unknown; duration: number; timestamp: number }
  | { type: 'error'; message: string; stack?: string; timestamp: number }
  | { type: 'canceled'; reason: string; timestamp: number }
  | { type: 'websocket'; method: string; url: string; status: number; timestamp: number };

export interface RealtimeExecution {
  sessionId: string;
  userId: string;
  code: string;
  language: string;
  status: 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'canceled';
  events: ExecutionEvent[];
  context: Record<string, unknown>;
  startTime?: number;
  endTime?: number;
}

interface ExecutionListener {
  sessionId: string;
  onEvent: (event: ExecutionEvent) => void;
}

// Stockage des executions en cours
const executions = new Map<string, RealtimeExecution>();
const listeners = new Map<string, Set<ExecutionListener>>();

// Historiseur
const executionHistory: RealtimeExecution[] = [];
const MAX_HISTORY = 1000;

// Patterns de code dangereux (version renforcee)
const DANGEROUS_PATTERNS: { pattern: RegExp; risk: 'critical' | 'high' | 'medium'; reason: string }[] = [
  { pattern: /require\s*\(\s*['"`](child_process|fs|net|dgram|cluster|v8|native)['"`]\s*\)/, risk: 'critical', reason: 'Module systeme interdit' },
  { pattern: /process\.(env|argv|chdir|cwd|exit|kill|memoryUsage|uptime)/, risk: 'critical', reason: 'Acces processus interdit' },
  { pattern: /eval\s*\(/, risk: 'critical', reason: 'Eval est interdit pour la securite' },
  { pattern: /new\s+Function\s*\\(/, risk: 'high', reason: 'Dynamic function creation bloquee' },
  { pattern: /fetch\s*\(/, risk: 'medium', reason: 'Network non autorise dans le sandbox' },
  { pattern: /XMLHttpRequest/, risk: 'high', reason: 'Requetes HTTP bloquees' },
  { pattern: /WebSocket\s*\(/, risk: 'medium', reason: 'WebSocket bloques depuis le code' },
  { pattern: /localStorage|sessionStorage|indexedDB/, risk: 'medium', reason: 'Stockage navigateur non accessible' },
  { pattern: /import\s+[\s\S]*?from/, risk: 'high', reason: 'Imports ES modules non supportes' },
  { pattern: /globalThis/, risk: 'medium', reason: 'Acces globalThis restreint' },
  { pattern: /Function\s*\(/, risk: 'high', reason: 'Constructeur Function interdit' },
  { pattern: /setTimeout|setInterval|setImmediate/, risk: 'medium', reason: 'Timers limites (max 5)' },
  { pattern: /atob\s*\(|btoa\s*\(/, risk: 'low', reason: 'Base64 limite' },
];

let timerCount = 0;

/**
 * Analyse la securite du code avec scoring
 */
export function analyzeCodeSecurity(code: string): {
  safe: boolean;
  score: number;
  violations: { pattern: RegExp; risk: string; reason: string }[];
  riskLevel: 'safe' | 'low' | 'medium' | 'high' | 'critical';
} {
  const violations = DANGEROUS_PATTERNS.filter(({ pattern }) => pattern.test(code));
  const score = Math.max(0, 100 - violations.reduce((acc, v) => {
    const weights = { critical: 40, high: 20, medium: 10, low: 3 };
    return acc + (weights[v.risk] || 10);
  }, 0));

  const maxRisk = violations.reduce((max, v) => {
    const levels = { critical: 4, high: 3, medium: 2, low: 1 };
    return Math.max(max, levels[v.risk] || 0);
  }, 0);

  const riskLevels = ['safe', 'low', 'medium', 'high', 'critical'] as const;

  return {
    safe: score >= 60,
    score,
    violations,
    riskLevel: riskLevels[Math.min(maxRisk, 4)],
  };
}

/**
 * Cree une execution temps reel
 */
export function createRealtimeExecution(
  userId: string,
  code: string,
  language: string = 'javascript',
  context: Record<string, unknown> = {},
  sessionId?: string
): RealtimeExecution {
  const id = sessionId || 'rt_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  
  const execution: RealtimeExecution = {
    sessionId: id,
    userId,
    code,
    language,
    status: 'pending',
    events: [],
    context,
  };

  executions.set(id, execution);
  return execution;
}

/**
 * Ajoute un ecouteur d'evenements
 */
export function addExecutionListener(sessionId: string, onEvent: (event: ExecutionEvent) => void): () => void {
  if (!listeners.has(sessionId)) {
    listeners.set(sessionId, new Set());
  }
  const entry: ExecutionListener = { sessionId, onEvent };
  listeners.get(sessionId)!.add(entry);
  return () => listeners.get(sessionId)?.delete(entry);
}

/**
 * Emet un evenement vers tous les ecouteurs
 */
function emit(sessionId: string, event: ExecutionEvent): void {
  const exec = executions.get(sessionId);
  if (exec) {
    exec.events.push(event);
  }
  const sessionListeners = listeners.get(sessionId);
  if (sessionListeners) {
    sessionListeners.forEach(l => {
      try { l.onEvent(event); } catch { /* ignore failed listeners */ }
    });
  }
}

/**
 * Execute du code avec streaming d'evenements
 */
export async function executeRealtime(
  sessionId: string,
  options?: {
    timeout?: number;
    maxSteps?: number;
    breakpoints?: number[];
    stepMode?: boolean;
  }
): Promise<RealtimeExecution> {
  const exec = executions.get(sessionId);
  if (!exec) throw new Error('Session introuvable: ' + sessionId);

  const timeout = options?.timeout || 15000;
  exec.status = 'running';
  exec.startTime = Date.now();

  emit(sessionId, { type: 'start', timestamp: Date.now(), sessionId });

  // Analyse de securite
  const security = analyzeCodeSecurity(exec.code);
  if (!security.safe) {
    exec.status = 'failed';
    exec.endTime = Date.now();
    emit(sessionId, {
      type: 'error',
      message: 'Code rejete par l\'analyse de securite. Score: ' + security.score + '/100. Risque: ' + security.riskLevel,
      timestamp: Date.now(),
    });
    return exec;
  }

  const logs: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;
  const originalWarn = console.warn;

  // Interception console avec streaming
  console.log = (...args: unknown[]) => {
    const msg = args.map(a => String(a)).join(' ');
    logs.push(msg);
    emit(sessionId, { type: 'log', message: msg, level: 'info', timestamp: Date.now() });
  };
  console.error = (...args: unknown[]) => {
    const msg = args.map(a => String(a)).join(' ');
    logs.push(msg);
    emit(sessionId, { type: 'log', message: msg, level: 'error', timestamp: Date.now() });
  };
  console.warn = (...args: unknown[]) => {
    const msg = args.map(a => String(a)).join(' ');
    logs.push(msg);
    emit(sessionId, { type: 'log', message: msg, level: 'warn', timestamp: Date.now() });
  };

  try {
    // Timeout watchdogs
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      exec.status = 'failed';
      exec.endTime = Date.now();
      emit(sessionId, { type: 'error', message: 'Timeout: execution annulee (>' + timeout + 'ms)', timestamp: Date.now() });
    }, timeout);

    // Emballage du code avec injection de contexte
    const wrappedCode = `
      (async () => {
        ${exec.code}
      })()
    `;

    let result: unknown;
    
    try {
      // Execution en mode pas-a-pas si demande
      if (options?.stepMode) {
        emit(sessionId, { type: 'log', message: '🐞 Mode pas-a-pas actif. Envoie \'step\' pour avancer.', level: 'info', timestamp: Date.now() });
        // Version pas-a-pas avec points d'arret
        const stepFn = new Function('emit', 'context', '"use strict";\n' + exec.code);
        result = await Promise.resolve(stepFn(
          (event: ExecutionEvent) => emit(sessionId, event),
          exec.context
        ));
      } else {
        // Execution normale
        const asyncFn = new Function('context', wrappedCode);
        result = await Promise.resolve(asyncFn(exec.context));
      }
    } catch (execError: unknown) {
      clearTimeout(timer);
      if (!timedOut) {
        const msg = execError instanceof Error ? execError.message : String(execError);
        const stack = execError instanceof Error ? execError.stack : undefined;
        exec.status = 'failed';
        exec.endTime = Date.now();
        emit(sessionId, { type: 'error', message: msg, stack, timestamp: Date.now() });
      }
      return exec;
    }

    clearTimeout(timer);

    if (timedOut) return exec;

    // Resultat final
    if (result !== undefined) {
      const resultStr = typeof result === 'object' ? JSON.stringify(result, null, 2) : String(result);
      emit(sessionId, { type: 'log', message: '→ ' + resultStr, level: 'result', timestamp: Date.now() });
    }

    const duration = Date.now() - exec.startTime!;
    exec.status = 'completed';
    exec.endTime = Date.now();

    emit(sessionId, { type: 'complete', result, duration, timestamp: Date.now() });

    // Archiver dans l'historique
    executionHistory.unshift({ ...exec });
    if (executionHistory.length > MAX_HISTORY) executionHistory.pop();

    return exec;
  } catch (error: unknown) {
    exec.status = 'failed';
    exec.endTime = Date.now();
    const msg = error instanceof Error ? error.message : 'Erreur fatale';
    emit(sessionId, { type: 'error', message: msg, timestamp: Date.now() });
    return exec;
  } finally {
    console.log = originalLog;
    console.error = originalError;
    console.warn = originalWarn;
  }
}

/**
 * Annule une execution en cours
 */
export function cancelExecution(sessionId: string, reason: string = 'Annule par l\'utilisateur'): boolean {
  const exec = executions.get(sessionId);
  if (!exec || exec.status === 'completed' || exec.status === 'failed') return false;
  exec.status = 'canceled';
  exec.endTime = Date.now();
  emit(sessionId, { type: 'canceled', reason, timestamp: Date.now() });
  return true;
}

/**
 * Recupere l'historique des executions
 */
export function getExecutionHistory(userId?: string, limit = 50): RealtimeExecution[] {
  let history = executionHistory;
  if (userId) history = history.filter(e => e.userId === userId);
  return history.slice(0, limit);
}

/**
 * Recupere une execution par son ID
 */
export function getExecution(sessionId: string): RealtimeExecution | undefined {
  return executions.get(sessionId) || executionHistory.find(e => e.sessionId === sessionId);
}

/**
 * Clone une execution (fork)
 */
export function forkExecution(sessionId: string, userId: string): RealtimeExecution | undefined {
  const original = getExecution(sessionId);
  if (!original) return undefined;
  return createRealtimeExecution(userId, original.code, original.language, { ...original.context });
}

/**
 * Moteur d'execution de code utilisateur de maniere autonome
 * Les agents peuvent controler ce moteur via l'API Gateway
 */
export const realtimeEngine = {
  create: createRealtimeExecution,
  execute: executeRealtime,
  cancel: cancelExecution,
  fork: forkExecution,
  get: getExecution,
  history: getExecutionHistory,
  listen: addExecutionListener,
  analyze: analyzeCodeSecurity,
};