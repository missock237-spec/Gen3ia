// ============================================================
// SAAS AUTOMATION — Module Index
//
// Système d'automatisation autonome multi-SaaS pour les agents IA.
// Permet aux agents d'accéder aux comptes utilisateurs sur des
// plateformes SaaS externes et d'agir de manière autonome.
//
// Architecture:
//   1. Account Connector — Liaison des comptes SaaS externes
//   2. Session Manager — Sessions persistantes (API + navigateur)
//   3. Safety Guard — Validation pré/post-action, consentement, audit
//   4. Action Templates — 20+ templates d'actions pré-construits
//   5. Action Engine — Moteur d'exécution autonome
//   6. Platform Adapters — Adaptations par provider
// ============================================================

// Account Connector
export { SaaSAccountConnector, getSaaSAccountConnector } from './account-connector';
export type {
  SaaSAuthType,
  LinkAccountInput,
  LinkAccountViaOAuthInput,
  AccountHealthStatus,
  SaaSAccountSummary,
} from './account-connector';

// Session Manager
export { SaaSSessionManager, getSaaSSessionManager } from './session-manager';
export type {
  SessionType,
  SessionStatus,
  SaaSSession,
  BrowserSessionConfig,
  CreateSessionInput,
  SessionExecuteOptions,
} from './session-manager';

// Safety Guard
export { SafetyGuard, getSafetyGuard } from './safety-guard';
export type {
  RiskLevel,
  ExecutionMode,
  ActionSafetyCheck,
  SafetyConfig,
  PostActionValidation,
} from './safety-guard';

// Action Templates
export { ActionTemplateManager, getActionTemplateManager } from './action-templates';
export type {
  TemplateCategory,
  TemplateActionType,
  ActionTemplateDefinition,
  ActionStep,
} from './action-templates';

// Action Engine
export { AutonomousActionEngine, getAutonomousActionEngine } from './action-engine';
export type {
  ExecuteActionInput,
  ExecuteActionResult,
  ComposedActionInput,
} from './action-engine';

// Platform Adapters
export {
  getPlatformAdapter,
  getAllAdapters,
  getSupportedProviders,
  registerAdapter,
} from './platform-adapters';
export type { PlatformAdapter } from './platform-adapters';
