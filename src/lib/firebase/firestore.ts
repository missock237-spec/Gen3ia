// ============================================================
// Gen3ia — Cloud Firestore data layer
// ============================================================
//  Remplace :
//    - src/lib/prisma.ts
//    - src/lib/db.ts
//    - packages/core/src/db.ts
//    - packages/core/src/repositories/* (Prisma-based)
//
//  Collections Firestore (équivalent des modèles Prisma) :
//    - users (profils, miroir étendu de Firebase Auth)
//    - agents (agents IA achetés/créés)
//    - conversations + messages (historique des conversations)
//    - credits (crédits utilisateurs)
//    - notifications (inbox intra-app)
//    - audit_logs (sécurité / compliance)
//    - api_keys, tasks, workflows, guardrails, etc.
//    - partners + partner_events (recommandation SaaS)
//
//  Pour préserver la compat avec les ~50 API routes existantes qui
//  appellent `db.user.findUnique(...)` etc., on expose une facade
//  Prisma-like reposant sur Firestore.
// ============================================================

import {
  Firestore,
  Timestamp,
  FieldValue,
  type CollectionReference,
  type DocumentData,
  type DocumentReference,
  type DocumentSnapshot,
  type Query,
  type QuerySnapshot,
  type WhereFilterOp,
  type WriteBatch,
} from 'firebase-admin/firestore';

import { getAdminDb } from './admin';

// ============================================================
// Transaction context — exposes a subset of Firestore Transaction
// ============================================================
export interface TransactionContext {
  get: (ref: DocumentReference) => Promise<Record<string, unknown> | null>;
  set: (ref: DocumentReference, data: Record<string, unknown>) => void;
  update: (ref: DocumentReference, data: Record<string, unknown>) => void;
  delete: (ref: DocumentReference) => void;
}

// ============================================================
// Types
// ============================================================

export type FirestoreWhereOp = {
  field: string;
  op: WhereFilterOp;
  value: unknown;
};

export type FirestoreOrderBy = {
  field: string;
  direction?: 'asc' | 'desc';
};

/**
 * Prisma-compat: `where` can be either:
 *   - Array form:  [{ field: 'email', op: '==', value: 'a@b.c' }]
 *   - Object form: { email: 'a@b.c', status: 'active' }  (Prisma-style, == only)
 *   - Object form with operators: { status: { in: ['a','b'] } }
 */
export type WhereInput = FirestoreWhereOp[] | Record<string, unknown>;

/**
 * Prisma-compat: `orderBy` can be either:
 *   - Array form:  [{ field: 'createdAt', direction: 'desc' }]
 *   - Object form: { createdAt: 'desc' }
 *   - String form: 'createdAt'  (defaults to 'asc')
 */
export type OrderByInput = FirestoreOrderBy[] | Record<string, unknown> | string;

/**
 * Prisma-compat: `select` can be either:
 *   - Array form:  ['id', 'email']
 *   - Object form: { id: true, email: true }
 *   - Object form with nested relations: { id: true, executions: { select: {...}, take: 5 } }
 *     (nested relations are ignored — only top-level fields are projected)
 */
export type SelectInput = string[] | Record<string, unknown>;

/**
 * Prisma-compat: `include` is accepted but ignored (Firestore returns full docs).
 */
export type IncludeInput = Record<string, unknown>;

export interface FindOptions {
  where?: WhereInput;
  orderBy?: OrderByInput;
  limit?: number;
  offset?: number;
  select?: SelectInput;
  include?: IncludeInput;
  /** Prisma-compat alias for `limit`. */
  take?: number;
  /** Prisma-compat alias for `offset`. */
  skip?: number;
}

export interface FindUniqueOptions {
  where: { id?: string; [key: string]: unknown };
  select?: SelectInput;
  include?: IncludeInput;
}

export interface CreateOptions {
  data: Record<string, unknown>;
  select?: SelectInput;
  include?: IncludeInput;
}

export interface UpdateOptions {
  where: { id?: string; [key: string]: unknown };
  data: Record<string, unknown>;
  select?: SelectInput;
  include?: IncludeInput;
}

export interface DeleteOptions {
  where: { id?: string; [key: string]: unknown };
}

// ============================================================
// Normalizers — convert Prisma-style inputs to Firestore array form
// ============================================================

function normalizeWhere(input: WhereInput | undefined): FirestoreWhereOp[] {
  if (!input) return [];
  if (Array.isArray(input)) return input as FirestoreWhereOp[];
  const out: FirestoreWhereOp[] = [];
  for (const [field, value] of Object.entries(input)) {
    if (value === undefined) continue;
    if (value === null) {
      out.push({ field, op: '==', value: null });
      continue;
    }
    if (typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
      // Operator object: { in: [...], not: ..., gte: ..., ... }
      for (const [op, v] of Object.entries(value as Record<string, unknown>)) {
        const firestoreOp = prismaOpToFirestore(op);
        out.push({ field, op: firestoreOp, value: v });
      }
      continue;
    }
    out.push({ field, op: '==', value });
  }
  return out;
}

function prismaOpToFirestore(op: string): WhereFilterOp {
  switch (op) {
    case 'equals': return '==';
    case 'not': return '!=';
    case 'in': return 'in';
    case 'notIn': return 'not-in';
    case 'lt': return '<';
    case 'lte': return '<=';
    case 'gt': return '>';
    case 'gte': return '>=';
    case 'contains': return '=='; // approximated (Firestore doesn't have native LIKE)
    case 'startsWith': return '==';
    case 'endsWith': return '==';
    case 'has': return 'array-contains';
    case 'hasEvery': return 'array-contains';
    case 'hasSome': return 'array-contains-any';
    default: return '==';
  }
}

function normalizeOrderBy(input: OrderByInput | undefined): FirestoreOrderBy[] {
  if (!input) return [];
  if (typeof input === 'string') return [{ field: input, direction: 'asc' }];
  if (Array.isArray(input)) return input as FirestoreOrderBy[];
  return Object.entries(input).map(([field, direction]) => ({
    field,
    direction: (direction === 'desc' ? 'desc' : 'asc') as 'asc' | 'desc',
  }));
}

function normalizeSelect(input: SelectInput | undefined): string[] | undefined {
  if (!input) return undefined;
  if (Array.isArray(input)) return input;
  return Object.keys(input).filter((k) => {
    const v = (input as Record<string, unknown>)[k];
    return v === true || v === 1;
  });
}

// ============================================================
// Helpers de conversion
// ============================================================

function serialize(data: Record<string, unknown>): DocumentData {
  const out: DocumentData = {};
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue;
    if (value instanceof Date) {
      out[key] = Timestamp.fromDate(value);
    } else if (Array.isArray(value)) {
      out[key] = value.map(serializeValue);
    } else if (value && typeof value === 'object' && !(value instanceof Timestamp)) {
      out[key] = serialize(value as Record<string, unknown>);
    } else {
      out[key] = value;
    }
  }
  return out;
}

function serializeValue(value: unknown): unknown {
  if (value === undefined) return null;
  if (value instanceof Date) return Timestamp.fromDate(value);
  if (Array.isArray(value)) return value.map(serializeValue);
  if (value && typeof value === 'object' && !(value instanceof Timestamp)) {
    return serialize(value as Record<string, unknown>);
  }
  return value;
}

function deserialize(snapshot: DocumentData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(snapshot)) {
    if (value instanceof Timestamp) {
      out[key] = value.toDate();
    } else if (Array.isArray(value)) {
      out[key] = value.map((v) =>
        v instanceof Timestamp ? v.toDate() : typeof v === 'object' && v !== null ? deserialize(v) : v,
      );
    } else if (value && typeof value === 'object') {
      out[key] = deserialize(value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

function projectFields(data: Record<string, unknown>, select?: string[]): Record<string, unknown> {
  if (!select || select.length === 0) return data;
  const out: Record<string, unknown> = {};
  for (const field of select) {
    if (field in data) out[field] = data[field];
  }
  // Toujours inclure l'ID
  if ('id' in data) out.id = data.id;
  return out;
}

// ============================================================
// Generic repository (équivalent Prisma repository pattern)
// ============================================================

 

// ============================================================
// Helper — découpe un tableau en chunks de taille `size`
// (Firestore limite les batches à 500 opérations)
// ============================================================
function chunkArray<T>(arr: T[], size: number): T[][] {
  if (size <= 0) return [arr];
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

const FIRESTORE_BATCH_LIMIT = 400; // 400 < 500 pour marge de sécurité

export class FirestoreRepository<T = any> {
  constructor(private collectionName: string) {}

  private db(): Firestore {
    return getAdminDb();
  }

  private col(): CollectionReference {
    return this.db().collection(this.collectionName);
  }

  private docRef(id: string): DocumentReference {
    return this.db().doc(`${this.collectionName}/${id}`);
  }

  async findUnique(options: FindUniqueOptions): Promise<T | null> {
    // Recherche par ID
    if (options.where.id) {
      const snap = await this.docRef(options.where.id).get();
      if (!snap.exists) return null;
      const data = deserialize(snap.data()!);
      data.id = snap.id;
      return projectFields(data, normalizeSelect(options.select)) as T;
    }

    // Recherche par autre champ unique
    const entries = Object.entries(options.where).filter(([k]) => k !== 'id');
    if (entries.length === 0) return null;

    let q: Query = this.col();
    for (const [field, value] of entries) {
      q = q.where(field, '==', serializeValue(value));
    }
    q = q.limit(1);
    const snap = await q.get();
    if (snap.empty) return null;
    const d = snap.docs[0]!;
    const data = deserialize(d.data());
    data.id = d.id;
    return projectFields(data, normalizeSelect(options.select)) as T;
  }

  async findFirst(options: FindOptions): Promise<T | null> {
    const items = await this.findMany({ ...options, limit: 1 });
    return items[0] ?? null;
  }

  async findMany(options: FindOptions = {}): Promise<T[]> {
    let q: Query = this.col();
    const whereOps = normalizeWhere(options.where);
    for (const w of whereOps) {
      q = q.where(w.field, w.op, serializeValue(w.value));
    }
    const orderByOps = normalizeOrderBy(options.orderBy);
    for (const o of orderByOps) {
      q = q.orderBy(o.field, o.direction || 'asc');
    }
    const effectiveLimit = options.limit ?? options.take;
    if (effectiveLimit) q = q.limit(effectiveLimit);

    const snap = await q.get();
    let items: T[] = snap.docs.map((d) => {
      const data = deserialize(d.data());
      data.id = d.id;
      return data as T;
    });

    const selectFields = normalizeSelect(options.select);
    if (selectFields && selectFields.length > 0) {
// @ts-ignore — type narrowing pending, see refactor ticket
      items = items.map((it) => projectFields(it, selectFields) as T);
    }
    const effectiveOffset = options.offset ?? options.skip;
    if (effectiveOffset && effectiveOffset > 0) {
      items = items.slice(effectiveOffset);
    }
    return items;
  }

  async count(options: Pick<FindOptions, 'where'> = {}): Promise<number> {
    let q: Query = this.col();
    const whereOps = normalizeWhere(options.where);
    for (const w of whereOps) {
      q = q.where(w.field, w.op, serializeValue(w.value));
    }
    // Utilise count().get() (agrégation côté serveur) au lieu de charger tous les docs
    // Fallback: snap.size si l'agrégation n'est pas disponible
    try {
      const countSnap = await q.count().get();
      return countSnap.data().count;
    } catch {
      const snap = await q.get();
      return snap.size;
    }
  }

  async create(options: CreateOptions): Promise<T> {
    const data = serialize({ ...options.data, createdAt: options.data.createdAt ?? FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    const ref = await this.col().add(data);
    const snap = await ref.get();
    const result = deserialize(snap.data()!);
    result.id = ref.id;
    return result as T;
  }

  /** Crée un document avec un ID explicite (ex: uid Firebase Auth) */
  async createWithId(id: string, data: Record<string, unknown>): Promise<T> {
    const payload = serialize({ ...data, createdAt: data.createdAt ?? FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    await this.docRef(id).set(payload);
    const snap = await this.docRef(id).get();
    const result = deserialize(snap.data()!);
    result.id = id;
    return result as T;
  }

  async update(options: UpdateOptions): Promise<T> {
    const id = options.where.id;
    if (!id) {
      // Look up by other where fields, then update the first match
      const existing = await this.findUnique({ where: options.where });
      if (!existing) throw new Error('update() — no record found for where clause');
      const existingId = (existing as Record<string, unknown>).id as string;
      const payload = serialize({ ...options.data, updatedAt: FieldValue.serverTimestamp() });
      await this.docRef(existingId).update(payload);
      const snap = await this.docRef(existingId).get();
      const result = deserialize(snap.data()!);
      result.id = existingId;
      return result as T;
    }
    const payload = serialize({ ...options.data, updatedAt: FieldValue.serverTimestamp() });
    await this.docRef(id).update(payload);
    const snap = await this.docRef(id).get();
    const result = deserialize(snap.data()!);
    result.id = id;
    return result as T;
  }

  async upsert(options: {
    where: { id?: string; [key: string]: unknown };
    create: Record<string, unknown>;
    update: Record<string, unknown>;
  }): Promise<T> {
    const existing = await this.findUnique({ where: options.where });
    if (existing) {
      // Use the resolved id (from findUnique) if available, otherwise fallback
      const whereWithId = { ...options.where, id: options.where.id || (existing as Record<string, unknown>).id as string };
      return this.update({ where: whereWithId, data: options.update });
    }
    // No existing record — create with explicit id if provided, otherwise auto-id
    if (options.where.id) {
      return this.createWithId(options.where.id, options.create);
    }
    return this.create({ data: options.create });
  }

  async updateMany(options: {
    where: FindOptions['where'];
    data: Record<string, unknown>;
  }): Promise<{ count: number }> {
    const items = await this.findMany({ where: options.where });
    const payload = serialize({ ...options.data, updatedAt: FieldValue.serverTimestamp() });
    const chunks = chunkArray(items, FIRESTORE_BATCH_LIMIT);
    for (const chunk of chunks) {
      const batch: WriteBatch = this.db().batch();
      for (const item of chunk) {
        const id = (item as Record<string, unknown>).id as string;
        batch.update(this.docRef(id), payload);
      }
      await batch.commit();
    }
    return { count: items.length };
  }

  async delete(options: DeleteOptions): Promise<void> {
    if (options.where.id) {
      await this.docRef(options.where.id).delete();
      return;
    }
    // Delete by other field — normalize object form to where ops
    const whereOps = normalizeWhere(options.where as WhereInput);
    const items = await this.findMany({ where: whereOps });
    const chunks = chunkArray(items, FIRESTORE_BATCH_LIMIT);
    for (const chunk of chunks) {
      const batch: WriteBatch = this.db().batch();
      for (const item of chunk) {
        const id = (item as Record<string, unknown>).id as string;
        batch.delete(this.docRef(id));
      }
      await batch.commit();
    }
  }

  async deleteMany(options: { where: FindOptions['where'] }): Promise<{ count: number }> {
    const items = await this.findMany({ where: options.where });
    const chunks = chunkArray(items, FIRESTORE_BATCH_LIMIT);
    for (const chunk of chunks) {
      const batch: WriteBatch = this.db().batch();
      for (const item of chunk) {
        const id = (item as Record<string, unknown>).id as string;
        batch.delete(this.docRef(id));
      }
      await batch.commit();
    }
    return { count: items.length };
  }

  /** Crée plusieurs documents en boucle (remplace createMany de Prisma). */
  async createMany(options: { data: Array<Record<string, unknown>> }): Promise<{ count: number }> {
    let count = 0;
    for (const item of options.data) {
      await this.create({ data: item });
      count++;
    }
    return { count };
  }

  /** Agrégation simple en mémoire (remplace aggregate de Prisma). */
  async groupBy(options: {
    where?: FindOptions['where'];
    by?: string[];
    _sum?: string[];
    _count?: string[] | boolean | Record<string, boolean>;
    _avg?: string[];
    _min?: string[];
    _max?: string[];
    orderBy?: OrderByInput;
    take?: number;
    skip?: number;
  }): Promise<Record<string, unknown>[]> {
    let items = await this.findMany({ where: options.where });
    // Apply orderBy
    if (options.orderBy) {
      const orderByOps = normalizeOrderBy(options.orderBy);
      for (const o of orderByOps) {
        items = items.sort((a, b) => {
          const av = (a as Record<string, unknown>)[o.field];
          const bv = (b as Record<string, unknown>)[o.field];
          if (typeof av === 'number' && typeof bv === 'number') {
            return o.direction === 'desc' ? bv - av : av - bv;
          }
          return o.direction === 'desc'
            ? String(bv).localeCompare(String(av))
            : String(av).localeCompare(String(bv));
        });
      }
    }
    if (options.take) items = items.slice(0, options.take);
    if (options.skip) items = items.slice(options.skip);

    // Group in memory
    const groups: Record<string, Record<string, unknown>[]> = {};
    for (const it of items) {
      const rec = it as Record<string, unknown>;
      const key = (options.by || []).map((f) => String(rec[f])).join('__') || '_all';
      if (!groups[key]) groups[key] = [];
      groups[key].push(rec);
    }
    const out: Record<string, unknown>[] = [];
    const countFields = options._count === true
      ? (options.by || ['_all'])
      : Array.isArray(options._count)
        ? options._count
        : options._count && typeof options._count === 'object'
          ? Object.keys(options._count)
          : [];
    for (const [key, group] of Object.entries(groups)) {
      const row: Record<string, unknown> = {};
      for (const f of options.by || []) row[f] = group[0]?.[f];
      if (countFields.length > 0) {
        for (const f of countFields) row[`_count_${f}`] = group.length;
        row['_count'] = group.length;
      }
      if (options._sum) {
        for (const f of options._sum) {
          let sum = 0;
          for (const g of group) if (typeof g[f] === 'number') sum += g[f];
          row[`_sum_${f}`] = sum;
        }
      }
      out.push(row);
    }
    return out;
  }

  async aggregate(options: {
    where?: FindOptions['where'];
    _sum?: Record<string, boolean>;
    _count?: Record<string, boolean>;
    _avg?: Record<string, boolean>;
    _min?: Record<string, boolean>;
    _max?: Record<string, boolean>;
  }): Promise<{
    _sum?: Record<string, number>;
    _count?: Record<string, number>;
    _avg?: Record<string, number>;
    _min?: Record<string, number>;
    _max?: Record<string, number>;
  }> {
    const items = await this.findMany({ where: options.where });
    const result: {
      _sum?: Record<string, number>;
      _count?: Record<string, number>;
      _avg?: Record<string, number>;
      _min?: Record<string, number>;
      _max?: Record<string, number>;
    } = {};

    if (options._sum) {
      result._sum = {};
      for (const field of Object.keys(options._sum)) {
        let sum = 0;
        for (const it of items) {
          const v = (it as Record<string, unknown>)[field];
          if (typeof v === 'number') sum += v;
        }
        result._sum[field] = sum;
      }
    }
    if (options._count) {
      result._count = {};
      for (const field of Object.keys(options._count)) {
        result._count[field] = items.length;
      }
    }
    if (options._avg) {
      result._avg = {};
      for (const field of Object.keys(options._avg)) {
        let sum = 0;
        let n = 0;
        for (const it of items) {
          const v = (it as Record<string, unknown>)[field];
          if (typeof v === 'number') { sum += v; n++; }
        }
        result._avg[field] = n > 0 ? sum / n : 0;
      }
    }
    if (options._min) {
      result._min = {};
      for (const field of Object.keys(options._min)) {
        let min = Infinity;
        for (const it of items) {
          const v = (it as Record<string, unknown>)[field];
          if (typeof v === 'number' && v < min) min = v;
        }
        result._min[field] = min === Infinity ? 0 : min;
      }
    }
    if (options._max) {
      result._max = {};
      for (const field of Object.keys(options._max)) {
        let max = -Infinity;
        for (const it of items) {
          const v = (it as Record<string, unknown>)[field];
          if (typeof v === 'number' && v > max) max = v;
        }
        result._max[field] = max === -Infinity ? 0 : max;
      }
    }
    return result;
  }

  private whereFromOptions(whereObj: Record<string, unknown>): FirestoreWhereOp[] {
    return Object.entries(whereObj).map(([field, value]) => ({
      field,
      op: '==' as WhereFilterOp,
      value,
    }));
  }

  /** Alias Prisma-compat pour findMany. */
  async findManyByCursor(options: FindOptions): Promise<T[]> {
    return this.findMany(options);
  }

  /** Prisma-compat: returns the first row matching the where clause. */
  async findFirstOrThrow(options: FindOptions): Promise<T> {
    const item = await this.findFirst(options);
    if (!item) throw new Error('findFirstOrThrow: no record found');
    return item;
  }

  /** Prisma-compat: returns the unique row or throws. */
  async findUniqueOrThrow(options: FindUniqueOptions): Promise<T> {
    const item = await this.findUnique(options);
    if (!item) throw new Error('findUniqueOrThrow: no record found');
    return item;
  }

  /** Prisma-compat: alias for update. */
  async updateManyAndReturn(options: {
    where: FindOptions['where'];
    data: Record<string, unknown>;
  }): Promise<T[]> {
    await this.updateMany(options);
    return this.findMany({ where: options.where });
  }

  /** Sous-collection (ex: conversations/{id}/messages) */
  subcollection(parentId: string, subName: string): FirestoreRepository {
    const sub = new FirestoreRepository(`${this.collectionName}/${parentId}/${subName}`);
    return sub;
  }
}

// ============================================================
// Collections (équivalents des modèles Prisma)
// ============================================================

export const Collections = {
  users: 'users',
  profiles: 'users', // alias (profils utilisateurs = users)
  agents: 'agents',
  agentSuites: 'agent_suites',
  agentSuiteAgents: 'agent_suite_agents',
  agentSuiteExecutions: 'agent_suite_executions',
  agentSuiteMessages: 'agent_suite_messages',
  agentMemories: 'agent_memories',
  agentMemoryNodes: 'memory_nodes',
  agentMemoryEdges: 'memory_edges',
  agentUsage: 'agent_usage',
  agentPermissions: 'agent_permissions',
  agentExecution: 'agent_executions',
  agentInvocations: 'agent_invocations',
  agentActionLogs: 'agent_action_logs',
  agentAutomations: 'agent_automations',
  agentCheckpoints: 'agent_checkpoints',
  agentLoops: 'agent_loops',
  agentSkills: 'agent_skills',
  agentTools: 'agent_tools',
  aiLoops: 'ai_loops',
  conversations: 'conversations',
  messages: 'messages',
  credits: 'credits',
  creditTransactions: 'credit_transactions',
  subscriptions: 'subscriptions',
  invoices: 'invoices',
  apiKeys: 'api_keys',
  accessKeys: 'access_keys',
  mcpConnectors: 'mcp_connectors',
  connectorExecutions: 'connector_executions',
  tasks: 'tasks',
  scheduledTasks: 'scheduled_tasks',
  workflows: 'workflows',
  workflowBranches: 'workflow_branches',
  workflowVersions: 'workflow_versions',
  workflowTemplates: 'workflow_templates',
  workflowAuthorizations: 'workflow_authorizations',
  workflowCollaborators: 'workflow_collaborators',
  guardrails: 'guardrails',
  notifications: 'notifications',
  auditLogs: 'audit_logs',
  actionAudits: 'action_audits',
  actionTemplates: 'action_templates',
  approvalRequests: 'approval_requests',
  autonomousActions: 'autonomous_actions',
  autonomousRuns: 'autonomous_runs',
  improvementLogs: 'improvement_logs',
  supervisorLogs: 'supervisor_logs',
  aiCosts: 'ai_costs',
  monitoringEvents: 'monitoring_events',
  usageDaily: 'usage_daily',
  queryLogs: 'query_logs',
  sessions: 'sessions',
  feedback: 'feedback',
  socialAccounts: 'social_accounts',
  webhooks: 'webhooks',
  webhookConfigs: 'webhook_configs',
  webhookLogs: 'webhook_logs',
  marketplaceListings: 'marketplace_listings',
  marketplacePurchases: 'marketplace_purchases',
  marketplaceReviews: 'marketplace_reviews',
  creatorPayouts: 'creator_payouts',
  uploadedFiles: 'uploaded_files',
  // Recomandation SaaS (recommand)
  partners: 'partners',
  partnerEvents: 'partner_events',
  // Ad system
  adCampaigns: 'ad_campaigns',
  adImpressions: 'ad_impressions',
  adUserPreferences: 'ad_user_preferences',
  // Affiliate
  affiliateCodes: 'affiliate_codes',
  affiliateReferrals: 'affiliate_referrals',
  // Avatars
  avatarConfigs: 'avatar_configs',
  avatarSessions: 'avatar_sessions',
  // Browser automation
  browserAutomations: 'browser_automations',
  browserSessions: 'browser_sessions',
  // Code projects
  codeProjects: 'code_projects',
  // Connected integrations
  connectedIntegrations: 'connected_integrations',
  // Customizations
  customizations: 'customizations',
  userCustomizations: 'user_customizations',
  userPersonalizations: 'user_personalizations',
  userResources: 'user_resources',
  // Dashboards
  dashboards: 'dashboards',
  // Datasets (data-analyst)
  datasets: 'datasets',
  // Documents (RAG)
  documents: 'documents',
  documentChunks: 'document_chunks',
  // Knowledge
  knowledge: 'knowledge',
  // Image / video generation
  imageGenerations: 'image_generations',
  videoGenerations: 'video_generations',
  // Multimodal
  multimodalSessions: 'multimodal_sessions',
  // OAuth
  oAuthStates: 'oauth_states',
  // Plugins
  plugins: 'plugins',
  pluginExecutions: 'plugin_executions',
  // Relay
  relayUsage: 'relay_usage',
  // SaaS automation
  saasAccounts: 'saas_accounts',
  // Shared agents
  sharedAgents: 'shared_agents',
  // Skills
  skills: 'skills',
  // URL blocklist (admin)
  urlBlocklist: 'url_blocklist',
  // Validations
  validations: 'validations',
  // Voice
  voiceCalls: 'voice_calls',
  voiceMemories: 'voice_memories',
  voiceProfiles: 'voice_profiles',
  voiceSessions: 'voice_sessions',
  // Workspaces
  workspaces: 'workspaces',
  workspaceActivities: 'workspace_activities',
  workspaceMembers: 'workspace_members',
  // Phone auth (OTP)
  otpRequests: 'otp_requests',
  // Executions (generic alias for agent executions)
  executions: 'agent_executions',
} as const;

export type CollectionName = typeof Collections[keyof typeof Collections];

// ============================================================
// API Prisma-like (db.<model>.<method>)
// ============================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeRepo<T = any>(name: string): FirestoreRepository<T> {
  return new FirestoreRepository<T>(name);
}

export const db = {
  user: makeRepo(Collections.users),
  profile: makeRepo(Collections.users),
  agent: makeRepo(Collections.agents),
  agentSuite: makeRepo(Collections.agentSuites),
  agentSuiteAgent: makeRepo(Collections.agentSuiteAgents),
  agentSuiteExecution: makeRepo(Collections.agentSuiteExecutions),
  agentSuiteMessage: makeRepo(Collections.agentSuiteMessages),
  agentMemory: makeRepo(Collections.agentMemories),
  memoryNode: makeRepo(Collections.agentMemoryNodes),
  memoryEdge: makeRepo(Collections.agentMemoryEdges),
  agentUsage: makeRepo(Collections.agentUsage),
  agentPermission: makeRepo(Collections.agentPermissions),
  agentExecution: makeRepo(Collections.agentExecution),
  agentInvocation: makeRepo(Collections.agentInvocations),
  agentActionLog: makeRepo(Collections.agentActionLogs),
  agentAutomation: makeRepo(Collections.agentAutomations),
  agentCheckpoint: makeRepo(Collections.agentCheckpoints),
  agentLoop: makeRepo(Collections.agentLoops),
  agentSkill: makeRepo(Collections.agentSkills),
  agentTool: makeRepo(Collections.agentTools),
  aILoop: makeRepo(Collections.aiLoops),
  aiLoop: makeRepo(Collections.aiLoops),
  conversation: makeRepo(Collections.conversations),
  message: makeRepo(Collections.messages),
  credit: makeRepo(Collections.credits),
  creditTransaction: makeRepo(Collections.creditTransactions),
  subscription: makeRepo(Collections.subscriptions),
  invoice: makeRepo(Collections.invoices),
  apiKey: makeRepo(Collections.apiKeys),
  accessKey: makeRepo(Collections.accessKeys),
  mCPConnector: makeRepo(Collections.mcpConnectors),
  mcpConnector: makeRepo(Collections.mcpConnectors),
  connectorExecution: makeRepo(Collections.connectorExecutions),
  task: makeRepo(Collections.tasks),
  scheduledTask: makeRepo(Collections.scheduledTasks),
  workflow: makeRepo(Collections.workflows),
  workflowBranch: makeRepo(Collections.workflowBranches),
  workflowVersion: makeRepo(Collections.workflowVersions),
  workflowTemplate: makeRepo(Collections.workflowTemplates),
  workflowAuthorization: makeRepo(Collections.workflowAuthorizations),
  workflowCollaborator: makeRepo(Collections.workflowCollaborators),
  guardrail: makeRepo(Collections.guardrails),
  notification: makeRepo(Collections.notifications),
  auditLog: makeRepo(Collections.auditLogs),
  actionAudit: makeRepo(Collections.actionAudits),
  actionTemplate: makeRepo(Collections.actionTemplates),
  approvalRequest: makeRepo(Collections.approvalRequests),
  autonomousAction: makeRepo(Collections.autonomousActions),
  autonomousRun: makeRepo(Collections.autonomousRuns),
  improvementLog: makeRepo(Collections.improvementLogs),
  supervisorLog: makeRepo(Collections.supervisorLogs),
  aICost: makeRepo(Collections.aiCosts),
  aiCost: makeRepo(Collections.aiCosts),
  monitoringEvent: makeRepo(Collections.monitoringEvents),
  usageDaily: makeRepo(Collections.usageDaily),
  queryLog: makeRepo(Collections.queryLogs),
  session: makeRepo(Collections.sessions),
  feedback: makeRepo(Collections.feedback),
  socialAccount: makeRepo(Collections.socialAccounts),
  webhook: makeRepo(Collections.webhooks),
  webhookConfig: makeRepo(Collections.webhookConfigs),
  webhookLog: makeRepo(Collections.webhookLogs),
  marketplaceListing: makeRepo(Collections.marketplaceListings),
  marketplacePurchase: makeRepo(Collections.marketplacePurchases),
  marketplaceReview: makeRepo(Collections.marketplaceReviews),
  creatorPayout: makeRepo(Collections.creatorPayouts),
  uploadedFile: makeRepo(Collections.uploadedFiles),
  // Recomandation SaaS (recommand)
  partner: makeRepo(Collections.partners),
  partnerEvent: makeRepo(Collections.partnerEvents),
  // Ad system
  adCampaign: makeRepo(Collections.adCampaigns),
  adImpression: makeRepo(Collections.adImpressions),
  adUserPreference: makeRepo(Collections.adUserPreferences),
  // Affiliate
  affiliateCode: makeRepo(Collections.affiliateCodes),
  affiliateReferral: makeRepo(Collections.affiliateReferrals),
  // Avatars
  avatarConfig: makeRepo(Collections.avatarConfigs),
  avatarSession: makeRepo(Collections.avatarSessions),
  // Browser automation
  browserAutomation: makeRepo(Collections.browserAutomations),
  browserSession: makeRepo(Collections.browserSessions),
  // Code projects
  codeProject: makeRepo(Collections.codeProjects),
  // Connected integrations
  connectedIntegration: makeRepo(Collections.connectedIntegrations),
  // Customizations
  customization: makeRepo(Collections.customizations),
  userCustomization: makeRepo(Collections.userCustomizations),
  userPersonalization: makeRepo(Collections.userPersonalizations),
  userResource: makeRepo(Collections.userResources),
  // Dashboards
  dashboard: makeRepo(Collections.dashboards),
  // Datasets (data-analyst)
  dataset: makeRepo(Collections.datasets),
  // Documents (RAG)
  document: makeRepo(Collections.documents),
  documentChunk: makeRepo(Collections.documentChunks),
  // Knowledge
  knowledge: makeRepo(Collections.knowledge),
  // Image / video generation
  imageGeneration: makeRepo(Collections.imageGenerations),
  videoGeneration: makeRepo(Collections.videoGenerations),
  // Multimodal
  multimodalSession: makeRepo(Collections.multimodalSessions),
  // OAuth
  oAuthState: makeRepo(Collections.oAuthStates),
  // Plugins
  plugin: makeRepo(Collections.plugins),
  pluginExecution: makeRepo(Collections.pluginExecutions),
  // Relay
  relayUsage: makeRepo(Collections.relayUsage),
  // SaaS automation
  saasAccount: makeRepo(Collections.saasAccounts),
  saaSAccount: makeRepo(Collections.saasAccounts),
  // Shared agents
  sharedAgent: makeRepo(Collections.sharedAgents),
  // Skills
  skill: makeRepo(Collections.skills),
  // URL blocklist (admin)
  uRLBlocklist: makeRepo(Collections.urlBlocklist),
  urlBlocklist: makeRepo(Collections.urlBlocklist),
  // Validations
  validation: makeRepo(Collections.validations),
  // Voice
  voiceCall: makeRepo(Collections.voiceCalls),
  voiceMemory: makeRepo(Collections.voiceMemories),
  voiceProfile: makeRepo(Collections.voiceProfiles),
  voiceSession: makeRepo(Collections.voiceSessions),
  // Workspaces
  workspace: makeRepo(Collections.workspaces),
  workspaceActivity: makeRepo(Collections.workspaceActivities),
  workspaceMember: makeRepo(Collections.workspaceMembers),
  // Phone auth (OTP)
  otpRequest: makeRepo(Collections.otpRequests),
  // Generic executions alias (points to agent_executions)
  execution: makeRepo(Collections.executions),
  $transaction: async <R>(fn: (tx: TransactionContext) => Promise<R>): Promise<R> => {
    const dbInstance = getAdminDb();
    return dbInstance.runTransaction(async (tx) => {
      const ctx: TransactionContext = {
        get: async (ref: DocumentReference) => {
          const snap = await tx.get(ref);
          return snap.exists ? deserialize(snap.data()!) : null;
        },
        set: (ref: DocumentReference, data: Record<string, unknown>) => {
          tx.set(ref, serialize(data));
        },
        update: (ref: DocumentReference, data: Record<string, unknown>) => {
          tx.update(ref, serialize({ ...data, updatedAt: FieldValue.serverTimestamp() }));
        },
        delete: (ref: DocumentReference) => {
          tx.delete(ref);
        },
      };
      return fn(ctx);
    });
  },
  /** Prisma-compat: no-op disconnect. */
  $disconnect: async (): Promise<void> => {},
  /** Prisma-compat: connect no-op. */
  $connect: async (): Promise<void> => {},
  /** Prisma-compat: raw SQL — emulated as empty result (Firestore is not SQL). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  $queryRaw: async <T = any>(): Promise<T[]> => [],
  /** Prisma-compat: raw SQL — emulated as no-op (Firestore is not SQL). */
  $executeRaw: async (): Promise<number> => 0,
};

// Alias pour compat avec l'ancien import `prisma` from '@/lib/prisma'
export const prisma = db;

export default db;
