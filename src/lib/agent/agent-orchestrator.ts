// Agent Autonome Multi-Platforme - Version stable
import type { P, L, PF, UA, OT, AA } from './orchestrator';
export type {P as Platform, L as PermissionLevel, PF as PlatformPermission, UA as UserAuthorization, OT as OAuthToken, AA as AgentAction};
export {SC as PLATFORM_SCOPES, RK as RISKY_ACTIONS} from './orchestrator';
export {agentOrchestrator, AM as AuthorizationManager, EX as ActionExecutor, O as AgentOrchestrator} from './orchestrator';
