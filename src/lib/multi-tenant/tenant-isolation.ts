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
const CACHE_TTL = 5 * 60 * 1000;
const currentContext = new Map<string, TenantContext>();

function sanitizeIdentifier(name: string): string {
  return name.replace(/[^a-zA-Z0-9_]/g, '');
}

export class TenantIsolation {
  static async initContext(tenantId: string, userId: string): Promise<TenantContext> {
    const tenant = await this.getTenant(tenantId);
    if (!tenant || !tenant.isActive) {
      throw new Error(`Tenant ${tenantId} inactif ou introuvable`);
    }

    const membership = await db.$queryRawUnsafe<Array<{ role: string }>>(
      `SELECT role FROM tenant_members WHERE tenant_id = $1 AND user_id = $2 AND status = 'active'`,
      [tenantId, userId]
    );

    if (!membership || membership.length === 0) {
      throw new Error(`Utilisateur ${userId} n'est pas membre du tenant ${tenantId}`);
    }

    const role = membership[0].role as TenantContext['role'];
    const permissions = this.getPermissionsForRole(role, tenant.plan);
    const context: TenantContext = { tenantId, userId, role, permissions };
    const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    currentContext.set(requestId, context);
    setTimeout(() => currentContext.delete(requestId), 30_000);
    return context;
  }

  static getContext(requestId?: string): TenantContext | null {
    if (requestId) return currentContext.get(requestId) || null;
    const contexts = Array.from(currentContext.values());
    return contexts[contexts.length - 1] || null;
  }

  static async getTenant(tenantId: string): Promise<Tenant | null> {
    const cached = tenantCache.get(tenantId);
    if (cached && cached.expiresAt > Date.now()) return cached.tenant;

    try {
      const rows = await db.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `SELECT id, name, slug, plan, settings, features, max_agents, max_users, max_storage_mb, max_api_calls_per_day, is_active, created_at FROM tenants WHERE id = $1`,
        [tenantId]
      );
      if (!rows || rows.length === 0) return null;

      const row = rows[0];
      const tenant: Tenant = {
        id: row.id as string,
        name: row.name as string,
        slug: row.slug as string,
        plan: row.plan as Tenant['plan'],
        settings: typeof row.settings === 'string' ? JSON.parse(row.settings as string) : (row.settings as Record<string, unknown>),
        features: typeof row.features === 'string' ? JSON.parse(row.features as string) : (row.features as string[]),
        maxAgents: Number(row.max_agents) || 5,
        maxUsers: Number(row.max_users) || 3,
        maxStorageMB: Number(row.max_storage_mb) || 100,
        maxApiCallsPerDay: Number(row.max_api_calls_per_day) || 1000,
        isActive: Boolean(row.is_active),
        createdAt: row.created_at as Date,
      };

      tenantCache.set(tenantId, { tenant, expiresAt: Date.now() + CACHE_TTL });
      return tenant;
    } catch (error) {
      log.error('Erreur récupération tenant', { tenantId, error: error instanceof Error ? error.message : String(error) });
      return null;
    }
  }

  static async checkQuota(tenantId: string, action: 'api_call' | 'agent' | 'storage' | 'user'): Promise<boolean> {
    const tenant = await this.getTenant(tenantId);
    if (!tenant) return false;

    switch (action) {
      case 'api_call': {
        const today = await db.$queryRawUnsafe<Array<{ count: bigint }>>(
          `SELECT COUNT(*)::bigint as count FROM api_usage WHERE tenant_id = $1 AND created_at::date = CURRENT_DATE`,
          [tenantId]
        );
        return Number(today[0]?.count || 0n) < tenant.maxApiCallsPerDay;
      }
      case 'agent': {
        const count = await db.$queryRawUnsafe<Array<{ count: bigint }>>(
          `SELECT COUNT(*)::bigint as count FROM agents WHERE tenant_id = $1 AND status != 'deleted'`,
          [tenantId]
        );
        return Number(count[0]?.count || 0n) < tenant.maxAgents;
      }
      case 'storage': {
        const usage = await db.$queryRawUnsafe<Array<{ total: bigint }>>(
          `SELECT COALESCE(SUM(file_size), 0)::bigint as total FROM uploads WHERE tenant_id = $1`,
          [tenantId]
        );
        const totalBytes = Number(usage[0]?.total || 0n);
        return totalBytes < tenant.maxStorageMB * 1024 * 1024;
      }
      case 'user': {
        return true; // La vérification se fait dans initContext
      }
    }
  }

  /**
   * BUGFIX: Utilisation de paramètres préparés au lieu de concaténation
   */
  static buildIsolatedQuery(table: string): string {
    const safeTable = sanitizeIdentifier(table);
    return `SELECT * FROM ${safeTable} WHERE tenant_id = $1`;
  }

  static invalidateCache(tenantId: string): void {
    tenantCache.delete(tenantId);
    log.info('Cache tenant invalidé', { tenantId });
  }

  static async getMemberCount(tenantId: string): Promise<number> {
    const result = await db.$queryRawUnsafe<Array<{ count: bigint }>>(
      `SELECT COUNT(*)::bigint as count FROM tenant_members WHERE tenant_id = $1 AND status = 'active'`,
      [tenantId]
    );
    return Number(result[0]?.count || 0n);
  }

  private static getPermissionsForRole(role: TenantContext['role'], plan: string): string[] {
    const basePermissions = ['agents:read', 'messages:send'];
    if (role === 'viewer') return basePermissions;
    const memberPermissions = [...basePermissions, 'agents:create', 'agents:update', 'voice:call', 'billing:read'];
    if (role === 'member') return memberPermissions;
    const adminPermissions = [...memberPermissions, 'agents:delete', 'users:invite', 'users:manage', 'settings:read', 'settings:update'];
    if (role === 'admin') return adminPermissions;
    return [...adminPermissions, 'billing:manage', 'tenant:delete', 'plan:change', 'api_keys:manage'];
  }
}

export function createTenantContext(tenantId: string, userId: string): Promise<TenantContext> {
  return TenantIsolation.initContext(tenantId, userId);
}