/**
 * GEN3IA Connectors — point d'entrée public.
 *
 * Moteur de connexions applicatives (OAuth2/OAuth1/clés) adapté de
 * l'architecture Composio (MIT, Copyright (c) 2025 Sampark Inc.),
 * réimplémenté pour une exécution locale complète.
 */

export * from "./core/types"
export { AuthScheme, withStatus } from "./core/auth-scheme"
export {
  encryptJson,
  decryptJson,
  signState,
  verifyState,
  generatePkcePair,
  pkceChallengeFrom,
  googleServiceAccountAccessToken,
} from "./core/crypto"
export {
  buildAuthorizeUrl,
  exchangeCodeForTokens,
  exchangeSlackCode,
  refreshAccessToken,
  revokeToken,
  isTokenExpired,
  decodeJwtPayload,
} from "./core/oauth2"
export {
  buildOAuth1Header,
  fetchRequestToken,
  buildOAuth1AuthorizeUrl,
  exchangeRequestToken,
  percentEncode,
  hmacSha1Signature,
} from "./core/oauth1"
export {
  buildRequest,
  executeHttpRequest,
  effectiveToken,
  assertExecutableConnection,
  ConnectorExecutionError,
} from "./core/executor"
export {
  initiateConnection,
  completeOAuth2,
  completeOAuth1,
  connectDirectly,
  ensureFreshConnection,
  listConnections,
  getActiveConnection,
  deleteConnection,
  callbackUrl,
} from "./core/connections"
export {
  executeAction,
  connectorToolsForUser,
  runConnectorTool,
  connectorToolKey,
  parseConnectorToolKey,
  CONNECTOR_TOOL_PREFIX,
  type ConnectorTool,
} from "./core/toolset"
export { getApp, listApps, getAction, appAvailability, requiresRedirect } from "./apps"
