/**
 * API Gateway — Pont securise entre les agents de code et les API externes
 * 
 * Les agents de code n'ont JAMAIS acces direct aux tokens, cles API ou secrets.
 * Ils passent par ce gateway qui :
 * 1. Valide les permissions de l'agent
 * 2. Injecte les credentials de facon securisee (hors vue de l'agent)
 * 3. Rate-limite et audite chaque appel
 * 4. Masque les tokens dans les logs et reponses
 */

// ====== TYPES ======

export type ApiProvider = 
  | 'github' | 'gitlab' | 'stripe' | 'supabase' 
  | 'slack' | 'discord' | 'resend' | 'openai'
  | 'groq' | 'openrouter' | 'google' | 'notion'
  | 'shopify' | 'twitter' | 'linkedin' | 'custom';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface GatewayRequest {
  provider: ApiProvider;
  endpoint: string;
  method: HttpMethod;
  headers?: Record<string, string>;
  body?: unknown;
  params?: Record<string, string>;
}

export interface GatewayResponse {
  success: boolean;
  status: number;
  data: unknown;
  duration: number;
  masked: string[]; // champs masques dans la reponse
}

export interface GatewayPermission {
  agentId: string;
  userId: string;
  provider: ApiProvider;
  scopes: string[];
  maxRequestsPerMinute: number;
  createdAt: Date;
}

export interface AuditEntry {
  id: string;
  timestamp: Date;
  agentId: string;
  userId: string;
  provider: ApiProvider;
  endpoint: string;
  method: HttpMethod;
  status: number;
  duration: number;
  approved: boolean;
}

// ====== STORE SECURISE DES CREDENTIALS ======
// Les cles sont stockees en memoire, JAMAIS exposees aux agents

interface StoredCredential {
  provider: ApiProvider;
  credentials: Record<string, string>;
  label: string;
  createdAt: Date;
  lastUsed: Date;
}

const credentialVault = new Map<string, StoredCredential>();
const auditLog: AuditEntry[] = [];
const agentPermissions = new Map<string, GatewayPermission[]>();
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

// ====== CHAMPS SENSIBLES A MASQUER ======
const SENSITIVE_FIELDS = [
  'token', 'secret', 'key', 'password', 'auth', 
  'access_token', 'refresh_token', 'api_key', 'api-key',
  'bearer', 'authorization', 'x-api-key', 'private_key',
  'client_secret', 'client_id', 'session', 'jwt',
];

function maskSensitive(data: unknown, depth = 0): { data: unknown; masked: string[] } {
  const masked: string[] = [];
  if (depth > 5 || typeof data !== 'object' || data === null) {
    return { data, masked };
  }

  if (Array.isArray(data)) {
    const arr = data.map(item => {
      const result = maskSensitive(item, depth + 1);
      masked.push(...result.masked);
      return result.data;
    });
    return { data: arr, masked };
  }

  const obj = data as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  
  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    const isSensitive = SENSITIVE_FIELDS.some(f => lowerKey.includes(f));
    
    if (isSensitive && typeof value === 'string') {
      if (value.length > 4) {
        result[key] = value.slice(0, 4) + '*'.repeat(value.length - 4);
        masked.push(key);
      } else {
        result[key] = '***';
        masked.push(key);
      }
    } else if (typeof value === 'object' && value !== null) {
      const nested = maskSensitive(value, depth + 1);
      result[key] = nested.data;
      masked.push(...nested.masked);
    } else {
      result[key] = value;
    }
  }

  return { data: result, masked };
}

// ====== GESTION DES CREDENTIALS ======

export function storeCredential(
  id: string,
  provider: ApiProvider,
  credentials: Record<string, string>,
  label: string = ''
): void {
  credentialVault.set(id, {
    provider,
    credentials: { ...credentials },
    label,
    createdAt: new Date(),
    lastUsed: new Date(),
  });
}

export function getCredential(id: string): StoredCredential | undefined {
  const cred = credentialVault.get(id);
  if (cred) {
    cred.lastUsed = new Date();
    credentialVault.set(id, cred);
  }
  return cred;
}

export function deleteCredential(id: string): boolean {
  return credentialVault.delete(id);
}

export function listCredentials(): { id: string; provider: ApiProvider; label: string; createdAt: Date }[] {
  return Array.from(credentialVault.entries()).map(([id, cred]) => ({
    id,
    provider: cred.provider,
    label: cred.label,
    createdAt: cred.createdAt,
  }));
}

// ====== GESTION DES PERMISSIONS ======

export function grantPermission(permission: GatewayPermission): void {
  const existing = agentPermissions.get(permission.agentId) || [];
  // Empecher les doublons
  const idx = existing.findIndex(p => p.provider === permission.provider);
  if (idx >= 0) {
    existing[idx] = permission;
  } else {
    existing.push(permission);
  }
  agentPermissions.set(permission.agentId, existing);
}

export function revokePermission(agentId: string, provider: ApiProvider): void {
  const existing = agentPermissions.get(agentId);
  if (!existing) return;
  agentPermissions.set(
    agentId,
    existing.filter(p => p.provider !== provider)
  );
}

export function checkPermission(agentId: string, provider: ApiProvider): { ok: boolean; reason?: string; permission?: GatewayPermission } {
  const perms = agentPermissions.get(agentId);
  if (!perms || perms.length === 0) {
    return { ok: false, reason: 'Aucune permission accordee a cet agent' };
  }
  const perm = perms.find(p => p.provider === provider);
  if (!perm) {
    return { ok: false, reason: 'Permission refusee pour le provider ' + provider };
  }
  return { ok: true, permission: perm };
}

// ====== RATE LIMITING ======

export function checkRateLimit(agentId: string, maxPerMinute: number): { ok: boolean; remaining: number } {
  const now = Date.now();
  const key = 'gateway:' + agentId;
  const entry = rateLimitMap.get(key);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + 60000 });
    return { ok: true, remaining: maxPerMinute - 1 };
  }

  entry.count++;
  if (entry.count > maxPerMinute) {
    return { ok: false, remaining: 0 };
  }

  return { ok: true, remaining: maxPerMinute - entry.count };
}

// ====== APPEL API GATEWAY ======

export async function callApi(
  agentId: string,
  userId: string,
  request: GatewayRequest
): Promise<GatewayResponse> {
  const start = Date.now();
  const auditId = 'aud_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  // 1. Verifier les permissions
  const permCheck = checkPermission(agentId, request.provider);
  if (!permCheck.ok) {
    auditLog.push({
      id: auditId, timestamp: new Date(), agentId, userId,
      provider: request.provider, endpoint: request.endpoint,
      method: request.method, status: 403, duration: 0, approved: false,
    });
    return { success: false, status: 403, data: { error: permCheck.reason }, duration: 0, masked: [] };
  }

  // 2. Rate limit
  const maxReq = permCheck.permission?.maxRequestsPerMinute || 10;
  const rl = checkRateLimit(agentId, maxReq);
  if (!rl.ok) {
    auditLog.push({
      id: auditId, timestamp: new Date(), agentId, userId,
      provider: request.provider, endpoint: request.endpoint,
      method: request.method, status: 429, duration: 0, approved: false,
    });
    return { success: false, status: 429, data: { error: 'Rate limit atteint: ' + maxReq + '/min' }, duration: 0, masked: [] };
  }

  // 3. Construire les headers avec les credentials (l'agent ne les voit JAMAIS)
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': 'Genova-CodeAgent/1.0',
    ...request.headers,
  };

  // Injection securisee des credentials selon le provider
  const credId = userId + ':' + request.provider;
  const storedCred = credentialVault.get(credId);
  
  if (storedCred) {
    const creds = storedCred.credentials;
    switch (request.provider) {
      case 'github':
        headers['Authorization'] = 'Bearer ' + (creds['token'] || creds['access_token'] || '');
        break;
      case 'stripe':
        headers['Authorization'] = 'Bearer ' + (creds['secret_key'] || '');
        break;
      case 'openai':
      case 'groq':
      case 'openrouter':
        headers['Authorization'] = 'Bearer ' + (creds['api_key'] || '');
        break;
      case 'slack':
        headers['Authorization'] = 'Bearer ' + (creds['bot_token'] || '');
        break;
      case 'supabase':
        headers['apikey'] = creds['anon_key'] || '';
        headers['Authorization'] = 'Bearer ' + (creds['service_key'] || creds['anon_key'] || '');
        break;
      case 'resend':
        headers['Authorization'] = 'Bearer ' + (creds['api_key'] || '');
        break;
      default:
        // Provider custom : on injecte tous les creds comme headers
        for (const [k, v] of Object.entries(creds)) {
          headers['X-Cred-' + k] = v;
        }
    }
  }

  // 4. Construire l'URL
  const baseUrls: Partial<Record<ApiProvider, string>> = {
    github: 'https://api.github.com',
    stripe: 'https://api.stripe.com/v1',
    supabase: storedCred?.credentials['supabase_url'] || 'https://api.supabase.io',
    slack: 'https://slack.com/api',
    discord: 'https://discord.com/api/v10',
    resend: 'https://api.resend.com',
    openai: 'https://api.openai.com/v1',
    groq: 'https://api.groq.com/openai/v1',
    openrouter: 'https://openrouter.ai/api/v1',
  };

  const baseUrl = baseUrls[request.provider] || storedCred?.credentials['base_url'] || '';
  
  // Construire query string
  let queryString = '';
  if (request.params) {
    const qs = new URLSearchParams(request.params).toString();
    if (qs) queryString = '?' + qs;
  }

  const url = baseUrl + request.endpoint + queryString;

  // 5. Effectuer l'appel (dans un vrai environnement, ce serait fetch)
  // Ici on simule l'appel pour la demonstration
  try {
    // Simulation d'appel API
    let data: unknown;
    let status = 200;

    // Simuler les appels selon le provider
    if (request.provider === 'github' && request.endpoint === '/user') {
      data = { login: 'agent-genova', id: 12345, plan: 'free', public_repos: 3 };
    } else if (request.provider === 'github' && request.endpoint.startsWith('/repos/')) {
      data = { name: 'repo', private: false, owner: { login: 'agent-genova' } };
    } else if (request.provider === 'stripe' && request.endpoint === '/charges') {
      data = { object: 'list', data: [{ id: 'ch_123', amount: 2000, currency: 'usd', status: 'succeeded' }] };
    } else if (request.provider === 'resend' && request.endpoint === '/emails') {
      data = { id: 'em_123', from: 'genova@test.com', to: ['user@test.com'], subject: 'Test' };
    } else if (request.provider === 'supabase') {
      data = [{ id: 1, name: 'Test', created_at: new Date().toISOString() }];
    } else if (request.provider === 'slack') {
      data = { ok: true, channel: 'C123', message: { text: 'Message envoye' } };
    } else if (request.provider === 'openai' || request.provider === 'groq') {
      data = { choices: [{ message: { content: 'Reponse simulee de ' + request.provider, role: 'assistant' } }], usage: { total_tokens: 42 } };
    } else {
      data = { success: true, message: 'Appel API simule', provider: request.provider, endpoint: request.endpoint };
    }

    // Masquer les donnees sensibles dans la reponse
    const maskedResult = maskSensitive(data);

    const duration = Date.now() - start;

    auditLog.push({
      id: auditId, timestamp: new Date(), agentId, userId,
      provider: request.provider, endpoint: request.endpoint,
      method: request.method, status, duration, approved: true,
    });

    return {
      success: true,
      status,
      data: maskedResult.data,
      duration,
      masked: maskedResult.masked,
    };
  } catch (err: unknown) {
    const duration = Date.now() - start;
    const msg = err instanceof Error ? err.message : 'Erreur inconnue';
    
    auditLog.push({
      id: auditId, timestamp: new Date(), agentId, userId,
      provider: request.provider, endpoint: request.endpoint,
      method: request.method, status: 500, duration, approved: false,
    });

    return { success: false, status: 500, data: { error: msg }, duration, masked: [] };
  }
}

// ====== AUDIT ======

export function getAuditLog(userId?: string, agentId?: string, limit = 50): AuditEntry[] {
  let entries = [...auditLog].reverse();
  if (userId) entries = entries.filter(e => e.userId === userId);
  if (agentId) entries = entries.filter(e => e.agentId === agentId);
  return entries.slice(0, limit);
}

// ====== CONNEXION AVEC LE CODE ENGINE ======
// Point d'entree pour les agents de code :
// Ils recoivent UNIQUEMENT un token de session temporaire

export function createAgentSession(agentId: string, userId: string, ttlMs = 300000): string {
  const sessionToken = 'gva_sess_' + Array.from({ length: 24 }, () =>
    'abcdefghijklmnopqrstuvwxyz0123456789'.charAt(Math.floor(Math.random() * 36))
  ).join('');
  
  agentTokens.set(sessionToken, {
    agentId,
    userId,
    expiresAt: Date.now() + ttlMs,
  });

  return sessionToken;
}

interface AgentToken {
  agentId: string;
  userId: string;
  expiresAt: number;
}

const agentTokens = new Map<string, AgentToken>();

export function validateAgentSession(token: string): { valid: boolean; agentId?: string; userId?: string; error?: string } {
  const entry = agentTokens.get(token);
  if (!entry) {
    return { valid: false, error: 'Session invalide' };
  }
  if (Date.now() > entry.expiresAt) {
    agentTokens.delete(token);
    return { valid: false, error: 'Session expiree' };
  }
  return { valid: true, agentId: entry.agentId, userId: entry.userId };
}

// ====== EXPORTS ======

export const gatewayStats = () => ({
  totalCredentials: credentialVault.size,
  totalPermissions: agentPermissions.size,
  totalAuditEntries: auditLog.length,
  activeSessions: agentTokens.size,
});