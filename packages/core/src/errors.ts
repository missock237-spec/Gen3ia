// ============================================================
// Gen3ia — Classes d'erreur standardisees
// ============================================================

import { ZodError } from "zod";
import { logger } from "./logger";

// ============================================================
// Classe de base
// ============================================================

export class ApiError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: Record<string, unknown>;

  constructor(code: string, message: string, statusCode = 500, details?: Record<string, unknown>) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

// ============================================================
// Erreurs HTTP generiques
// ============================================================

export class NotFoundError extends ApiError {
  constructor(resource: string, id?: string) {
    super("NOT_FOUND", `${resource}${id ? ` (${id})` : ""} introuvable`, 404);
  }
}

export class UnauthorizedError extends ApiError {
  constructor(message = "Non authentifie") {
    super("UNAUTHORIZED", message, 401);
  }
}

export class ForbiddenError extends ApiError {
  constructor(message = "Acces refuse") {
    super("FORBIDDEN", message, 403);
  }
}

export class ValidationError extends ApiError {
  constructor(message: string, details?: Record<string, unknown>) {
    super("VALIDATION_ERROR", message, 400, details);
  }
}

export class RateLimitError extends ApiError {
  constructor(retryAfter: number) {
    super("RATE_LIMIT_EXCEEDED", `Trop de requetes. Reessayez dans ${retryAfter}s.`, 429, { retryAfter });
  }
}

// ============================================================
// AgentError — Boucle ReAct, LLM, outils
// ============================================================

export class AgentError extends ApiError {
  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(code, message, 400, details);
    this.name = "AgentError";
  }
}

export class AgentTimeoutError extends AgentError {
  constructor(agentId: string, timeoutMs: number) {
    super("AGENT_TIMEOUT", `L'agent ${agentId} a expire apres ${timeoutMs}ms`, { agentId, timeoutMs });
  }
}

export class AgentMaxIterationsError extends AgentError {
  constructor(agentId: string, iterations: number) {
    super("AGENT_MAX_ITERATIONS", `L'agent ${agentId} a atteint la limite de ${iterations} iterations`, { agentId, iterations });
  }
}

export class AgentLoopDetectedError extends AgentError {
  constructor(agentId: string, action: string, count: number) {
    super("AGENT_LOOP_DETECTED", `Boucle infinie: "${action}" repete ${count}x`, { agentId, action, count });
  }
}

export class LLMError extends AgentError {
  constructor(provider: string, status: number, message: string) {
    super("LLM_ERROR", `Erreur LLM ${provider} (${status}): ${message}`, { provider, status });
    this.statusCode = status >= 500 ? 502 : 400;
  }
}

export class ToolNotAllowedError extends AgentError {
  constructor(tool: string, agentId: string) {
    super("TOOL_NOT_ALLOWED", `L'outil "${tool}" n'est pas autorise`, { tool, agentId });
  }
}

// ============================================================
// PaymentError — Credits, Stripe, Mobile Money
// ============================================================

export class PaymentError extends ApiError {
  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(code, message, 402, details);
    this.name = "PaymentError";
  }
}

export class InsufficientCreditsError extends PaymentError {
  constructor(required: number, available: number) {
    super("INSUFFICIENT_CREDITS", `Credits insuffisants. Requis: ${required}, Disponible: ${available}`, { required, available });
  }
}

export class PaymentFailedError extends PaymentError {
  constructor(provider: string, reason: string) {
    super("PAYMENT_FAILED", `Paiement echoue (${provider}): ${reason}`, { provider });
    this.statusCode = 400;
  }
}

export class StripeError extends PaymentError {
  constructor(stripeCode: string, message: string) {
    super("STRIPE_ERROR", `Stripe: ${message}`, { stripeCode });
    this.statusCode = 502;
  }
}

export class MobileMoneyError extends PaymentError {
  constructor(operator: string, message: string) {
    super("MOBILE_MONEY_ERROR", `${operator}: ${message}`, { operator });
  }
}

export class PlanLimitReachedError extends PaymentError {
  constructor(plan: string, limit: string, current: number) {
    super("PLAN_LIMIT_REACHED", `Limite du plan ${plan}: ${limit}`, { plan, limit, current });
  }
}

// ============================================================
// AuthError — Authentification, sessions
// ============================================================

export class AuthError extends ApiError {
  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(code, message, 401, details);
    this.name = "AuthError";
  }
}

export class SessionExpiredError extends AuthError {
  constructor() {
    super("SESSION_EXPIRED", "Session expiree. Veuillez vous reconnecter.");
  }
}

export class InvalidTokenError extends AuthError {
  constructor(reason?: string) {
    super("INVALID_TOKEN", `Token invalide${reason ? `: ${reason}` : ""}`);
  }
}

export class OAuthError extends AuthError {
  constructor(provider: string, message: string) {
    super("OAUTH_ERROR", `Erreur OAuth ${provider}: ${message}`, { provider });
  }
}

export class InvalidCredentialsError extends AuthError {
  constructor() {
    super("INVALID_CREDENTIALS", "Email ou mot de passe incorrect");
    this.statusCode = 401;
  }
}

// ============================================================
// AgentSafetyError — Sandbox Rust, ressources
// ============================================================

export class AgentSafetyError extends ApiError {
  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(code, message, 403, details);
    this.name = "AgentSafetyError";
  }
}

export class SandboxViolationError extends AgentSafetyError {
  constructor(operation: string, path?: string) {
    super("SANDBOX_VIOLATION", `Violation: ${operation}${path ? ` sur ${path}` : ""}`, { operation, path });
  }
}

export class PromptInjectionError extends AgentSafetyError {
  constructor(riskScore: number, categories: string[]) {
    super("PROMPT_INJECTION", `Injection detectee (score: ${riskScore.toFixed(2)})`, { riskScore, categories });
  }
}

export class ResourceExceededError extends AgentSafetyError {
  constructor(resource: string, limit: number, current: number) {
    super("RESOURCE_EXCEEDED", `Limite depassee: ${resource} (${current}/${limit})`, { resource, limit, current });
  }
}

// ============================================================
// WebhookError
// ============================================================

export class WebhookError extends ApiError {
  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(code, message, 401, details);
    this.name = "WebhookError";
  }
}

export class InvalidSignatureError extends WebhookError {
  constructor(webhookId: string) {
    super("INVALID_SIGNATURE", `Signature invalide pour le webhook ${webhookId}`, { webhookId });
  }
}

export class ReplayDetectedError extends WebhookError {
  constructor(nonce: string) {
    super("REPLAY_DETECTED", "Attaque par replay detectee", { nonce });
  }
}

// ============================================================
// DatabaseError
// ============================================================

export class DatabaseError extends ApiError {
  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(code, message, 500, details);
    this.name = "DatabaseError";
  }
}

export class UniqueConstraintError extends DatabaseError {
  constructor(field: string, value: string) {
    super("UNIQUE_CONSTRAINT", `Valeur deja existante: ${field}=${value}`, { field, value });
    this.statusCode = 409;
  }
}

// ============================================================
// Types de reponse standardises
// ============================================================

export interface ApiSuccessResponse<T = unknown> {
  success: true;
  data: T;
  meta?: { page?: number; limit?: number; total?: number; totalPages?: number; duration?: number };
}

export interface ApiErrorResponse {
  success: false;
  error: { code: string; message: string; details?: Record<string, unknown>; requestId?: string };
}

export type ApiResponse<T = unknown> = ApiSuccessResponse<T> | ApiErrorResponse;

// ============================================================
// Error code catalog
// ============================================================

export const ErrorCodes = {
  NOT_FOUND: "NOT_FOUND",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  RATE_LIMIT_EXCEEDED: "RATE_LIMIT_EXCEEDED",
  INSUFFICIENT_CREDITS: "INSUFFICIENT_CREDITS",
  AGENT_TIMEOUT: "AGENT_TIMEOUT",
  AGENT_MAX_ITERATIONS: "AGENT_MAX_ITERATIONS",
  AGENT_LOOP_DETECTED: "AGENT_LOOP_DETECTED",
  LLM_ERROR: "LLM_ERROR",
  SANDBOX_VIOLATION: "SANDBOX_VIOLATION",
  PROMPT_INJECTION: "PROMPT_INJECTION",
  REPLAY_DETECTED: "REPLAY_DETECTED",
  INVALID_SIGNATURE: "INVALID_SIGNATURE",
  CONNECTION_ERROR: "CONNECTION_ERROR",
  UNIQUE_CONSTRAINT: "UNIQUE_CONSTRAINT",
} as const;

// ============================================================
// Handler centralise
// ============================================================

let requestCounter = 0;

export function handleApiError(error: unknown): { statusCode: number; body: ApiErrorResponse } {
  const requestId = `err_${Date.now()}_${++requestCounter}`;

  if (error instanceof ApiError) {
    const level = error.statusCode >= 500 ? 'error' : 'warn';
    logger[level]('api_error', { requestId, code: error.code, message: error.message, status: error.statusCode });
    return { statusCode: error.statusCode, body: { success: false, error: { code: error.code, message: error.message, details: error.details, requestId } } };
  }

  if (error instanceof ZodError) {
    const details = error.errors.reduce((acc, e) => {
      const path = e.path.join('.');
      if (!acc[path]) acc[path] = [];
      acc[path].push(e.message);
      return acc;
    }, {} as Record<string, string[]>);
    logger.warn('validation_error', { requestId, details });
    return { statusCode: 400, body: { success: false, error: { code: 'VALIDATION_ERROR', message: 'Donnees invalides', details: { fields: details }, requestId } } };
  }

  if (error instanceof SyntaxError) {
    logger.warn('syntax_error', { requestId, message: error.message });
    return { statusCode: 400, body: { success: false, error: { code: 'INVALID_JSON', message: 'Format JSON invalide', requestId } } };
  }

  const message = error instanceof Error ? error.message : 'Erreur interne';
  logger.error('unhandled_error', { requestId, error: message });

  try {
    const Sentry = require('@sentry/nextjs');
    if (error instanceof Error) Sentry.captureException(error, { tags: { requestId } });
  } catch {}

  return {
    statusCode: 500,
    body: { success: false, error: { code: 'INTERNAL_ERROR', message: process.env.NODE_ENV === 'development' ? message : 'Une erreur interne est survenue', requestId } },
  };
}
