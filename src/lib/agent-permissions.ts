// Core agent permission system and sandboxing guard

export enum PermissionScope {
  READ_CONVERSATIONS = 'read:conversations',
  WRITE_CONVERSATIONS = 'write:conversations',
  READ_FILES = 'read:files',
  WRITE_FILES = 'write:files',
  EXEC_TERMINAL = 'exec:terminal',
  ACCESS_NETWORK = 'access:network',
  READ_CREDITS = 'read:credits',
  USE_CREDITS = 'use:credits',
  READ_MEMORY = 'read:memory',
  WRITE_MEMORY = 'write:memory',
  MANAGE_AGENTS = 'manage:agents',
  ACCESS_BROWSER = 'access:browser',
  SEND_NOTIFICATIONS = 'send:notifications',
}

export enum RiskLevel {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

export interface ScopeDefinition {
  scope: PermissionScope;
  description: string;
  riskLevel: RiskLevel;
  requiresApproval: boolean;
}

export interface AgentPermissionGrant {
  id: string;
  agentId: string;
  userId: string;
  scopes: PermissionScope[];
  grantedAt: Date;
  grantedBy: string;
  expiresAt: Date | null;
  revokedAt: Date | null;
  conditions: {
    maxCreditsPerDay?: number;
    allowedDomains?: string[];
    rateLimitPerMinute?: number;
  };
}

export interface PermissionCheckResult {
  allowed: boolean;
  reason: string;
  missingScopes: PermissionScope[];
}

export interface AuditEntry {
  id: string;
  agentId: string;
  userId: string;
  scope: PermissionScope;
  action: string;
  timestamp: Date;
  allowed: boolean;
  resource?: string;
}

export const SCOPE_DEFINITIONS: Record<PermissionScope, ScopeDefinition> = {
  [PermissionScope.READ_CONVERSATIONS]: {
    scope: PermissionScope.READ_CONVERSATIONS,
    description: 'Read user conversation history',
    riskLevel: RiskLevel.MEDIUM,
    requiresApproval: true,
  },
  [PermissionScope.WRITE_CONVERSATIONS]: {
    scope: PermissionScope.WRITE_CONVERSATIONS,
    description: 'Create and update user conversations',
    riskLevel: RiskLevel.MEDIUM,
    requiresApproval: true,
  },
  [PermissionScope.READ_FILES]: {
    scope: PermissionScope.READ_FILES,
    description: 'Access and read stored user files',
    riskLevel: RiskLevel.LOW,
    requiresApproval: false,
  },
  [PermissionScope.WRITE_FILES]: {
    scope: PermissionScope.WRITE_FILES,
    description: 'Upload and modify user files',
    riskLevel: RiskLevel.MEDIUM,
    requiresApproval: true,
  },
  [PermissionScope.EXEC_TERMINAL]: {
    scope: PermissionScope.EXEC_TERMINAL,
    description: 'Execute shell commands in terminal sandbox',
    riskLevel: RiskLevel.CRITICAL,
    requiresApproval: true,
  },
  [PermissionScope.ACCESS_NETWORK]: {
    scope: PermissionScope.ACCESS_NETWORK,
    description: 'Make outbound network requests to external services',
    riskLevel: RiskLevel.HIGH,
    requiresApproval: true,
  },
  [PermissionScope.READ_CREDITS]: {
    scope: PermissionScope.READ_CREDITS,
    description: 'View current user credit balance and usage history',
    riskLevel: RiskLevel.LOW,
    requiresApproval: false,
  },
  [PermissionScope.USE_CREDITS]: {
    scope: PermissionScope.USE_CREDITS,
    description: 'Spend user credits for compute and API operations',
    riskLevel: RiskLevel.HIGH,
    requiresApproval: true,
  },
  [PermissionScope.READ_MEMORY]: {
    scope: PermissionScope.READ_MEMORY,
    description: 'Read agent long-term memory and context',
    riskLevel: RiskLevel.LOW,
    requiresApproval: false,
  },
  [PermissionScope.WRITE_MEMORY]: {
    scope: PermissionScope.WRITE_MEMORY,
    description: 'Write and update long-term agent memory',
    riskLevel: RiskLevel.MEDIUM,
    requiresApproval: true,
  },
  [PermissionScope.MANAGE_AGENTS]: {
    scope: PermissionScope.MANAGE_AGENTS,
    description: 'Deploy, configure, or modify other agents',
    riskLevel: RiskLevel.CRITICAL,
    requiresApproval: true,
  },
  [PermissionScope.ACCESS_BROWSER]: {
    scope: PermissionScope.ACCESS_BROWSER,
    description: 'Perform web browsing and scraping actions',
    riskLevel: RiskLevel.HIGH,
    requiresApproval: true,
  },
  [PermissionScope.SEND_NOTIFICATIONS]: {
    scope: PermissionScope.SEND_NOTIFICATIONS,
    description: 'Send notifications to the user',
    riskLevel: RiskLevel.LOW,
    requiresApproval: false,
  },
};

// Firestore mock pattern as specified in system instructions
const db = {
  collection: (_name: string) => ({
    add: async (_data: any) => ({ id: 'mock-' + Date.now() }),
    get: async () => ({ docs: [] as unknown[] }),
    where: () => ({
      get: async () => ({ docs: [] as unknown[] }),
      limit: () => ({ get: async () => ({ docs: [] as unknown[] }) }),
    }),
    doc: (_id: string) => ({
      delete: async () => undefined,
      update: async (_data: any) => undefined,
      get: async () => ({ exists: false }),
    }),
  }),
};

export class PermissionManager {
  private grants: AgentPermissionGrant[] = [];

  public requestScopes(
    agentId: string,
    scopes: PermissionScope[]
  ): {
    requiredApprovals: ScopeDefinition[];
    riskSummary: Record<RiskLevel, number>;
  } {
    const requiredApprovals: ScopeDefinition[] = [];
    const riskSummary: Record<RiskLevel, number> = {
      [RiskLevel.LOW]: 0,
      [RiskLevel.MEDIUM]: 0,
      [RiskLevel.HIGH]: 0,
      [RiskLevel.CRITICAL]: 0,
    };

    const uniqueScopes = Array.from(new Set(scopes));
    for (const scope of uniqueScopes) {
      const def = SCOPE_DEFINITIONS[scope];
      if (def) {
        if (def.requiresApproval) {
          requiredApprovals.push(def);
        }
        riskSummary[def.riskLevel] = (riskSummary[def.riskLevel] || 0) + 1;
      }
    }

    return { requiredApprovals, riskSummary };
  }

  public async grantPermissions(
    agentId: string,
    userId: string,
    scopes: PermissionScope[],
    conditions?: Partial<AgentPermissionGrant['conditions']>
  ): Promise<AgentPermissionGrant> {
    const grant: AgentPermissionGrant = {
      id: `grant-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      agentId,
      userId,
      scopes: Array.from(new Set(scopes)),
      grantedAt: new Date(),
      grantedBy: userId,
      expiresAt: null,
      revokedAt: null,
      conditions: {
        maxCreditsPerDay: conditions?.maxCreditsPerDay,
        allowedDomains: conditions?.allowedDomains,
        rateLimitPerMinute: conditions?.rateLimitPerMinute,
      },
    };

    // Mark previous grant for this agent & user as revoked
    const existingIdx = this.grants.findIndex(
      (g) => g.agentId === agentId && g.userId === userId && !g.revokedAt
    );
    if (existingIdx !== -1) {
      this.grants[existingIdx].revokedAt = new Date();
      await db.collection('grants').doc(this.grants[existingIdx].id).update({ revokedAt: new Date() });
    }

    this.grants.push(grant);
    await db.collection('grants').add(grant);

    return grant;
  }

  public async revokePermissions(agentId: string, userId: string): Promise<void> {
    const now = new Date();
    for (const grant of this.grants) {
      if (grant.agentId === agentId && grant.userId === userId && !grant.revokedAt) {
        grant.revokedAt = now;
        await db.collection('grants').doc(grant.id).update({ revokedAt: now });
      }
    }
  }

  public async getGrantedScopes(agentId: string, userId: string): Promise<PermissionScope[]> {
    const grant = await this.getGrant(agentId, userId);
    return grant ? grant.scopes : [];
  }

  public async getGrant(agentId: string, userId: string): Promise<AgentPermissionGrant | null> {
    const now = new Date();
    const grant = this.grants.find(
      (g) =>
        g.agentId === agentId &&
        g.userId === userId &&
        !g.revokedAt &&
        (g.expiresAt === null || new Date(g.expiresAt) > now)
    );
    return grant || null;
  }

  public async getUserGrants(userId: string): Promise<AgentPermissionGrant[]> {
    const now = new Date();
    return this.grants.filter(
      (g) =>
        g.userId === userId &&
        !g.revokedAt &&
        (g.expiresAt === null || new Date(g.expiresAt) > now)
    );
  }

  public async checkPermission(
    agentId: string,
    userId: string,
    scope: PermissionScope,
    resource?: string
  ): Promise<PermissionCheckResult> {
    const grant = await this.getGrant(agentId, userId);

    if (!grant) {
      return {
        allowed: false,
        reason: `No active permission grant found for agent ${agentId}`,
        missingScopes: [scope],
      };
    }

    if (!grant.scopes.includes(scope)) {
      return {
        allowed: false,
        reason: `Scope '${scope}' is not granted to agent ${agentId}`,
        missingScopes: [scope],
      };
    }

    if (resource && grant.conditions.allowedDomains && grant.conditions.allowedDomains.length > 0) {
      const isAllowedDomain = grant.conditions.allowedDomains.some((domain) =>
        resource.toLowerCase().includes(domain.toLowerCase())
      );
      if (!isAllowedDomain) {
        return {
          allowed: false,
          reason: `Resource '${resource}' is not in allowed domains list`,
          missingScopes: [],
        };
      }
    }

    return {
      allowed: true,
      reason: 'Permission granted',
      missingScopes: [],
    };
  }

  public async checkMultiple(
    agentId: string,
    userId: string,
    scopes: PermissionScope[]
  ): Promise<PermissionCheckResult> {
    const grant = await this.getGrant(agentId, userId);
    const grantedScopes = grant ? grant.scopes : [];

    const missingScopes = scopes.filter((s) => !grantedScopes.includes(s));

    if (!grant) {
      return {
        allowed: false,
        reason: `No active permission grant found for agent ${agentId}`,
        missingScopes: scopes,
      };
    }

    if (missingScopes.length > 0) {
      return {
        allowed: false,
        reason: `Missing required scopes: ${missingScopes.join(', ')}`,
        missingScopes,
      };
    }

    return {
      allowed: true,
      reason: 'All requested permissions are granted',
      missingScopes: [],
    };
  }
}

export class SandboxGuard {
  private rateLimits: Map<string, number[]> = new Map();
  private creditLimits: Map<string, number> = new Map();

  public async wrapApiCall<T>(
    agentId: string,
    userId: string,
    scope: PermissionScope,
    fn: () => Promise<T>
  ): Promise<T> {
    const check = await permissionManager.checkPermission(agentId, userId, scope);

    if (!check.allowed) {
      await auditLogger.log({
        agentId,
        userId,
        scope,
        action: 'api_call',
        allowed: false,
      });
      throw new Error(`Permission denied for scope ${scope}: ${check.reason}`);
    }

    await auditLogger.log({
      agentId,
      userId,
      scope,
      action: 'api_call',
      allowed: true,
    });

    return await fn();
  }

  public enforceRateLimit(agentId: string, userId: string, maxPerMinute: number): boolean {
    const key = `${agentId}:${userId}`;
    const now = Date.now();
    const windowMs = 60 * 1000;

    const timestamps = (this.rateLimits.get(key) || []).filter((t) => now - t < windowMs);

    if (timestamps.length >= maxPerMinute) {
      this.rateLimits.set(key, timestamps);
      return false;
    }

    timestamps.push(now);
    this.rateLimits.set(key, timestamps);
    return true;
  }

  public async enforceCreditLimit(
    agentId: string,
    userId: string,
    maxPerDay: number,
    creditsToUse: number = 1
  ): Promise<boolean> {
    const today = new Date().toISOString().split('T')[0];
    const key = `${agentId}:${userId}:${today}`;

    const currentUsage = this.creditLimits.get(key) || 0;
    if (currentUsage + creditsToUse > maxPerDay) {
      return false;
    }

    this.creditLimits.set(key, currentUsage + creditsToUse);
    return true;
  }
}

export class AuditLogger {
  private auditLogs: AuditEntry[] = [];

  public async log(entry: Omit<AuditEntry, 'id' | 'timestamp'>): Promise<void> {
    const fullEntry: AuditEntry = {
      id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      timestamp: new Date(),
      ...entry,
    };

    this.auditLogs.unshift(fullEntry);
    await db.collection('audit_logs').add(fullEntry);
  }

  public async getAuditLog(
    agentId: string,
    userId: string,
    limit: number = 50
  ): Promise<AuditEntry[]> {
    return this.auditLogs
      .filter((entry) => {
        const matchAgent = !agentId || entry.agentId === agentId;
        const matchUser = !userId || entry.userId === userId;
        return matchAgent && matchUser;
      })
      .slice(0, limit);
  }
}

export const permissionManager = new PermissionManager();
export const sandboxGuard = new SandboxGuard();
export const auditLogger = new AuditLogger();
