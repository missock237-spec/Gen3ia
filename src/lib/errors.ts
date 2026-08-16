// Re-export des erreurs depuis @gen3ia/core
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
} from '../../packages/core/src/errors';

// Type aliases — these are defined in the core errors module but may not be
// properly resolved by the bundler. We provide them here as a fallback.
import type {
  ApiSuccessResponse as CoreApiSuccessResponse,
  ApiErrorResponse as CoreApiErrorResponse,
  ApiResponse as CoreApiResponse,
} from '../../packages/core/src/errors';

export type ApiSuccessResponse<T = unknown> = CoreApiSuccessResponse<T>;
export type ApiErrorResponse = CoreApiErrorResponse;
export type ApiResponse<T = unknown> = CoreApiResponse<T>;
