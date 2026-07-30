// ============================================================
// Gen3ia Core — Index barrel
// ============================================================

export { db, prisma } from './db.js';
export { createLogger, logger } from './logger.js';

// Erreurs standardisees
export {
  ApiError,
  NotFoundError, UnauthorizedError, ForbiddenError,
  ValidationError, RateLimitError,
  AgentError,
  AgentTimeoutError, AgentMaxIterationsError, AgentLoopDetectedError,
  LLMError, ToolNotAllowedError,
  PaymentError,
  InsufficientCreditsError, PaymentFailedError, StripeError,
  MobileMoneyError, PlanLimitReachedError,
  AuthError,
  SessionExpiredError, InvalidTokenError, OAuthError,
  InvalidCredentialsError,
  AgentSafetyError,
  SandboxViolationError, PromptInjectionError, ResourceExceededError,
  WebhookError,
  InvalidSignatureError, ReplayDetectedError,
  DatabaseError, UniqueConstraintError,
  handleApiError, ErrorCodes,
  ApiResponse, ApiSuccessResponse, ApiErrorResponse,
} from './errors.js';

export {
  executeAgentSchema, createAgentSchema, loginSchema, registerSchema, formatZodErrors,
} from './validation.js';
export { encrypt, decrypt, hashToken } from './security.js';
export { checkpointManager, CheckpointData } from './checkpoint.js';
export { rateLimiter, getCategory, EndpointCategory, RateLimitResult } from './rate-limiter.js';
export {
  signPayload, verifySignature, createSecurePayload,
  validateWebhook, webhookSecurityMiddleware,
  WebhookPayload,
} from './webhook-security.js';
export { supervisor, SupervisorAgent } from './agent/supervisor.js';
