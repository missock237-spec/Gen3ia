/**
 * Fabrique ConnectionData — porté et adapté de Composio
 * `ts/packages/core/src/models/AuthScheme.ts` (MIT, Sampark Inc.).
 *
 * La sémantique est conservée : un token d'accès fourni ⇒ ACTIVE
 * (import de token) ; absent ⇒ INITIALIZING (flux OAuth par redirection).
 * Le statut explicite prime toujours sur la détection automatique.
 */

import {
  AuthSchemeTypes,
  ConnectionStatuses,
  type ApiKeyConnectionData,
  type BasicConnectionData,
  type BearerTokenConnectionData,
  type BaseConnectionFields,
  type ConnectionData,
  type GoogleServiceAccountConnectionData,
  type NoAuthConnectionData,
  type OAuth1ConnectionData,
  type OAuth2ConnectionData,
} from "./types";

export class AuthScheme {
  /**
   * Données de connexion OAuth2.
   * `access_token` fourni ⇒ ACTIVE (import) ; sinon INITIALIZING (flux redirection).
   * @param params Paramètres OAuth2
   */
  static OAuth2(
    params: BaseConnectionFields & {
      access_token?: string;
      token_type?: string;
      id_token?: string;
      refresh_token?: string | null;
      expires_in?: number | null;
      expires_at?: string | null;
      scope?: string | null;
      authed_user?: { access_token?: string; scope?: string } | null;
      error?: string;
      error_description?: string;
    }
  ): OAuth2ConnectionData {
    const hasToken = !!params.access_token;
    const { status: _ignored, ...rest } = params as Record<string, unknown>;
    return {
      authScheme: AuthSchemeTypes.OAUTH2,
      status: hasToken ? ConnectionStatuses.ACTIVE : ConnectionStatuses.INITIALIZING,
      ...rest,
    } as OAuth2ConnectionData;
  }

  /**
   * Données de connexion OAuth1.
   * `oauth_token` + `oauth_token_secret` fournis ⇒ ACTIVE (import) ;
   * sinon INITIALIZING.
   * @param params Paramètres OAuth1
   */
  static OAuth1(
    params: BaseConnectionFields & {
      oauth_token?: string;
      oauth_token_secret?: string;
      consumer_key?: string;
      error?: string;
      error_description?: string;
    }
  ): OAuth1ConnectionData {
    const hasTokens = !!params.oauth_token && !!params.oauth_token_secret;
    const { status: _ignored, ...rest } = params as Record<string, unknown>;
    return {
      authScheme: AuthSchemeTypes.OAUTH1,
      status: hasTokens ? ConnectionStatuses.ACTIVE : ConnectionStatuses.INITIALIZING,
      ...rest,
    } as OAuth1ConnectionData;
  }

  /**
   * Données de connexion par clé d'API.
   * @param params Clé d'API
   */
  static APIKey(
    params: BaseConnectionFields & { api_key?: string }
  ): ApiKeyConnectionData {
    const { status: _ignored, ...rest } = params as Record<string, unknown>;
    return {
      authScheme: AuthSchemeTypes.API_KEY,
      status: ConnectionStatuses.ACTIVE,
      ...rest,
    } as ApiKeyConnectionData;
  }

  /**
   * Données de connexion Basic.
   * @param params Utilisateur/mot de passe
   */
  static Basic(
    params: BaseConnectionFields & { username?: string; password?: string }
  ): BasicConnectionData {
    const { status: _ignored, ...rest } = params as Record<string, unknown>;
    return {
      authScheme: AuthSchemeTypes.BASIC,
      status: ConnectionStatuses.ACTIVE,
      ...rest,
    } as BasicConnectionData;
  }

  /**
   * Données de connexion Bearer.
   * @param params Token
   */
  static BearerToken(
    params: BaseConnectionFields & { bearer_token?: string }
  ): BearerTokenConnectionData {
    const { status: _ignored, ...rest } = params as Record<string, unknown>;
    return {
      authScheme: AuthSchemeTypes.BEARER_TOKEN,
      status: ConnectionStatuses.ACTIVE,
      ...rest,
    } as BearerTokenConnectionData;
  }

  /**
   * Données de connexion par compte de service Google.
   * @param params JSON d'identifiants du compte de service
   */
  static GoogleServiceAccount(
    params: BaseConnectionFields & { credentials_json?: string; client_email?: string; error?: string }
  ): GoogleServiceAccountConnectionData {
    const { status: _ignored, ...rest } = params as Record<string, unknown>;
    return {
      authScheme: AuthSchemeTypes.GOOGLE_SERVICE_ACCOUNT,
      status: params.credentials_json ? ConnectionStatuses.ACTIVE : ConnectionStatuses.INITIALIZING,
      ...rest,
    } as GoogleServiceAccountConnectionData;
  }

  /**
   * Données de connexion sans authentification.
   * @param params Champs de base optionnels (ex. base_url)
   */
  static NoAuth(params?: BaseConnectionFields): NoAuthConnectionData {
    return {
      authScheme: AuthSchemeTypes.NO_AUTH,
      status: ConnectionStatuses.ACTIVE,
      ...(params ?? {}),
    } as NoAuthConnectionData;
  }
}

/** Cast utilitaire : garantit `status` cohérent après une mutation. */
export function withStatus(data: ConnectionData, status: ConnectionData["status"]): ConnectionData {
  return { ...data, status } as ConnectionData;
}
