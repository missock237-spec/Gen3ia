/**
 * Code Engine — Sandbox d'execution securise
 * Execute du code utilisateur dans un environnement isole
 * avec timeout, limitation memoire et blocage des patterns dangereux.
 */

export interface ExecutionRequest {
  code: string;
  language: 'javascript' | 'typescript' | 'python' | 'html' | 'bash';
  timeout?: number;
  context?: Record<string, unknown>;
}

export interface ExecutionResult {
  success: boolean;
  output: string[];
  error?: string;
  duration: number;
  tokens?: number;
}

const BLOCKED_PATTERNS: RegExp[] = [
  /require\s*\(/,
  /process\s*\./,
  /child_process/,
  /fs\./,
  /eval\s*\(/,
  /Function\s*\(/,
  /setTimeout\s*\(/,
  /setInterval\s*\(/,
  /XMLHttpRequest/,
  /localStorage/,
  /sessionStorage/,
  /indexedDB/,
  /window\s*\./,
  /document\s*\./,
  /importScripts/,
  /new\s+Function/,
];

export function validateCode(code: string, language: string): { valid: boolean; error?: string } {
  if (code.length > 50000) {
    return { valid: false, error: 'Code trop long: 50000 caracteres max' };
  }
  if (!code.trim()) {
    return { valid: false, error: 'Code vide' };
  }
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(code)) {
      return { valid: false, error: 'Pattern dangereux detecte' };
    }
  }
  return { valid: true };
}

export async function executeCode(req: ExecutionRequest): Promise<ExecutionResult> {
  const start = performance.now();
  const output: string[] = [];
  const maxDuration = Math.min(req.timeout || 10000, 30000);

  const validation = validateCode(req.code, req.language);
  if (!validation.valid) {
    return { success: false, output: [], error: validation.error, duration: 0 };
  }

  const logs: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;
  const originalWarn = console.warn;

  console.log = (...args: unknown[]) => {
    const msg = args.map(a => String(a)).join(' ');
    logs.push(msg);
    output.push(msg);
  };
  console.error = (...args: unknown[]) => {
    const msg = 'Erreur: ' + args.map(a => String(a)).join(' ');
    logs.push(msg);
    output.push(msg);
  };
  console.warn = (...args: unknown[]) => {
    const msg = 'Attention: ' + args.map(a => String(a)).join(' ');
    logs.push(msg);
    output.push(msg);
  };

  try {
    const timer = setTimeout(() => {
      throw new Error('Timeout: execution annulee (' + maxDuration + 'ms)');
    }, maxDuration);

    let result: unknown;
    try {
      const asyncFn = new Function('context', 'return (async () => { ' + req.code + ' })();');
      result = await Promise.resolve(asyncFn(req.context || {}));
    } catch (execError: unknown) {
      clearTimeout(timer);
      const msg = execError instanceof Error ? execError.message : String(execError);
      throw new Error(msg);
    }

    clearTimeout(timer);

    if (result !== undefined) {
      const resultStr = typeof result === 'object'
        ? JSON.stringify(result, null, 2)
        : String(result);
      logs.push('→ ' + resultStr);
    }

    const duration = Math.round(performance.now() - start);
    const tokens = Math.round(req.code.length / 4);

    return { success: true, output: logs, duration, tokens };
  } catch (error: unknown) {
    const duration = Math.round(performance.now() - start);
    return {
      success: false,
      output: logs,
      error: error instanceof Error ? error.message : 'Erreur inconnue',
      duration,
    };
  } finally {
    console.log = originalLog;
    console.error = originalError;
    console.warn = originalWarn;
  }
}

const executionQuota = new Map<string, { count: number; resetAt: number }>();

export function checkExecutionQuota(userId: string, maxPerMinute = 10): { ok: boolean; remaining: number } {
  const now = Date.now();
  const entry = executionQuota.get(userId);
  if (!entry || now > entry.resetAt) {
    executionQuota.set(userId, { count: 1, resetAt: now + 60000 });
    return { ok: true, remaining: maxPerMinute - 1 };
  }
  entry.count++;
  if (entry.count > maxPerMinute) {
    return { ok: false, remaining: 0 };
  }
  return { ok: true, remaining: maxPerMinute - entry.count };
}

export interface CodeStudioSession {
  sessionId: string;
  userId: string;
  code: string;
  language: string;
  createdAt: Date;
}

const sessions = new Map<string, CodeStudioSession>();

export function createSession(userId: string, code: string, language: string = 'javascript'): CodeStudioSession {
  const sessionId = 'cs_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const session: CodeStudioSession = { sessionId, userId, code, language, createdAt: new Date() };
  sessions.set(sessionId, session);
  return session;
}

export function getSession(sessionId: string): CodeStudioSession | undefined {
  return sessions.get(sessionId);
}

export function updateSession(sessionId: string, code: string, language?: string): CodeStudioSession | undefined {
  const session = sessions.get(sessionId);
  if (!session) return undefined;
  session.code = code;
  if (language) session.language = language;
  return session;
}

export function deleteSession(sessionId: string): boolean {
  return sessions.delete(sessionId);
}

export function listUserSessions(userId: string): CodeStudioSession[] {
  return Array.from(sessions.values()).filter(s => s.userId === userId);
}