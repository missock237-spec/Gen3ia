import { createLogger } from '@/lib/logger';
import { db } from '@/lib/db';

const log = createLogger('tenant-isolation');

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  plan: 'free' | 'pro' | 'enterprise';
  settings: Record<string, unknown>;
  features: string[];
  maxAgents: number;
  maxUsers: number;
  maxStorageMB: number;
  maxApiCallsPerDay: number;
  isActive: boolean;
  createdAt: Date;
}

export interface TenantContext {
  tenantId: string;
  userId: string;
  role: 'owner' | 'admin' | 'member' | 'viewer';
  permissions: string[];
}

interface TenantCacheEntry {
  tenant: Tenant;
  expiresAt: number;
}

const tenantCache = new Map<string, TenantCacheEntry>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const currentContext = new Map<string, TenantContext>();

export class TenantIsolation {
  /**
   * Initialiser le contexte du tenant pour une requête
   */
  static async initContext(tenantId: string, userId: string): Promise<TenantContext> {
    const tenant = await this.getTenant(tenantId);
    
    if (!tenant || !tenant.isActive) {
      throw new Error(`Tenant ${tenantId} inactif ou introuvable`);
    }

    // Vérifier les limites du plan
    const memberCount = await this.getMemberCount(tenantId);
    if (memberCount >= tenant.maxUsers) {
      throw new Error(`Limite d'utilisateurs atteinte (${tenant.maxUsers}) pour le plan ${tenant.plan}`);
    }

    const membership = await db.$queryRawUnsafe<Array<{ role: string }>>(`
      SELECT role FROM tenant_members WHERE tenant_id = $1 AND user_id = $2 AND status = 'active'
    `, [tenantId, userId]);

    if (!membership || membership.length === 0) {
      throw new Error(`Utilisateur ${userId} n'est pas membre du tenant ${tenantId}`);
    }

    const role = membership[0].role as TenantContext['role'];
    const permissions = this.getPermissionsForRole(role, tenant.plan);
    
    const context: TenantContext = { tenantId, userId, role, permissions };
    const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    currentContext.set(requestId, context);

    // Nettoyer après 30s
    setTimeout(() => currentContext.delete(requestId), 30_000);

    return context;
  }

  /**
   * Obtenir le contexte actuel
   */
  static getContext(requestId?: string): TenantContext | null {
    if (requestId) return currentContext.get(requestId) || null;
    // Dernier contexte créé
    const contexts = Array.from(currentContext.values());
    return contexts[contexts.length - 1] || null;
  }

  /**
   * Récupérer un tenant avec cache
   */
  static async getTenant(tenantId: string): Promise<Tenant | null> {
    const cached = tenantCache.get(tenantId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.tenant;
    }

    try {
      const rows = await db.$queryRawUnsafe<Array<Record<string, unknown>>>(`
        SELECT id, name, slug, plan, settings, features, max_agents as "maxAgents",
               max_users as "maxUsers", max_storage_mb as "maxStorageMB",
               max_api_calls_per_day as "maxApiCallsPerDay", is_active as "isActive", created_at as "createdAt"
        FROM tenants WHERE id = $1
      `, [tenantId]);

      if (!rows || rows.length === 0) return null;

      const row = rows[0];
      const tenant: Tenant = {
        id: row.id as string,
        name: row.name as string,
        slug: row.slug as string,
        plan: row.plan as Tenant['plan'],
        settings: typeof row.settings === 'string' ? JSON.parse(row.settings as string) : row.settings as Record<string, unknown>,
        features: typeof row.features === 'string' ? JSON.parse(row.features as string) : row.features as string[],
        maxAgents: row.maxAgents as number,
        maxUsers: row.maxUsers as number,
        maxStorageMB: row.maxStorageMB as number,
        maxApiCallsPerDay: row.maxApiCallsPerDay as number,
        isActive: row.isActive as boolean,
        createdAt: row.createdAt as Date,
      };

      tenantCache.set(tenantId, { tenant, expiresAt: Date.now() + CACHE_TTL });
      return tenant;
    } catch (error) {
      log.error('Erreur récupération tenant', { tenantId, error: error instanceof Error ? error.message : String(error) });
      return null;
    }
  }

  /**
   * Vérifier si un tenant peut effectuer une action (rate limiting + feature)
   */
  static async checkQuota(tenantId: string, action: 'api_call' | 'agent' | 'storage' | 'user'): Promise<boolean> {
    const tenant = await this.getTenant(tenantId);
    if (!tenant) return false;

    switch (action) {
      case 'api_call': {
        const today = await db.$queryRawUnsafe<Array<{ count: bigint }>>(`
          SELECT COUNT(*) as count FROM api_usage WHERE tenant_id = $1 AND created_at::date = CURRENT_DATE
        `, [tenantId]);
        return Number(today[0]?.count || 0) < tenant.maxApiCallsPerDay;
      }
      case 'agent': {
        const count = await db.$queryRawUnsafe<Array<{ count: bigint }>>(`
          SELECT COUNT(*) as count FROM agents WHERE tenant_id = $1 AND status != 'deleted'
        `, [tenantId]);
        return Number(count[0]?.count || 0) < tenant.maxAgents;
      }
      case 'storage': {
        const usage = await db.$queryRawUnsafe<Array<{ total: bigint }>>(`
          SELECT COALESCE(SUM(file_size), 0) as total FROM uploads WHERE tenant_id = $1
        `, [tenantId]);
        return Number(usage[0]?.total || 0) < tenant.maxStorageMB * 1024 * 1024;
      }
      case 'user': {
        const count = await this.getMemberCount(tenantId);
        return count < tenant.maxUsers;
      }
    }
  }

  /**
   * Filtrer une requête SQL pour n'inclure que les données du tenant
   */
  static isolateQuery(table: string, tenantId: string, extraConditions?: string): string {
    let query = `SELECT * FROM ${table} WHERE tenant_id = '${tenantId.replace(/'/g, "''")}'`;
    if (extraConditions) query += ` AND ${extraConditions}`;
    return query;
  }

  /**
   * Invalider le cache d'un tenant
   */
  static invalidateCache(tenantId: string): void {
    tenantCache.delete(tenantId);
    log.info('Cache tenant invalidé', { tenantId });
  }

  private static getPermissionsForRole(role: TenantContext['role'], plan: string): string[] {
    const basePermissions = ['agents:read', 'messages:send'];
    
    if (role === 'viewer') return basePermissions;
    
    const memberPermissions = [...basePermissions, 'agents:create', 'agents:update', 'voice:call', 'billing:read'];
    if (role === 'member') return memberPermissions;
    
    const adminPermissions = [...memberPermissions, 'agents:delete', 'users:invite', 'users:manage', 'settings:read', 'settings:update'];
    if (role === 'admin') return adminPermissions;
    
    // Owner — tout
    return [...adminPermissions, 'billing:manage', 'tenant:delete', 'plan:change', 'api_keys:manage'];
  }

  private static async getMemberCount(tenantId: string): Promise<number> {
    const result = await db.$queryRawUnsafe<Array<{ count: bigint }>>(`
      SELECT COUNT(*) as count FROM tenant_members WHERE tenant_id = $1 AND status = 'active'
    `, [tenantId]);
    return Number(result[0]?.count || 0);
  }
}

export function createTenantContext(tenantId: string, userId: string): Promise<TenantContext> {
  return TenantIsolation.initContext(tenantId, userId);
}
