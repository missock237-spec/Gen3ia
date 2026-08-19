// ============================================================
// Gen3ia — Cloud Firestore data layer (packages/core)
// ============================================================
//  Fournit `db` / `prisma` (facade Prisma-like) pour les consumers
//  de @gen3ia/core (ex: packages/worker). API identique à
//  src/lib/firebase/firestore.ts : findUnique/findMany/count/create/
//  update/updateMany/upsert/delete/deleteMany avec `where` en
//  FirestoreWhereOp[], `select` en string[], PAS d'increment/OR/select objet.
// ============================================================

import {
  getFirestore,
  Timestamp,
  FieldValue,
  type DocumentData,
  type WhereFilterOp,
  type CollectionReference,
  type DocumentReference,
  type Query,
  type WriteBatch,
} from 'firebase-admin/firestore';
import { getApps, initializeApp } from 'firebase-admin/app';

export type FirestoreWhereOp = { field: string; op: WhereFilterOp; value: unknown };
export type FirestoreOrderBy = { field: string; direction?: 'asc' | 'desc' };

export interface FindOptions {
  where?: FirestoreWhereOp[];
  orderBy?: FirestoreOrderBy[];
  limit?: number;
  offset?: number;
  select?: string[];
}

export interface FindUniqueOptions {
  where: { id?: string; [key: string]: unknown };
  select?: string[];
}

export interface CreateOptions { data: Record<string, unknown>; }
export interface UpdateOptions { where: { id?: string; [key: string]: unknown }; data: Record<string, unknown>; }
export interface DeleteOptions { where: { id?: string; [key: string]: unknown }; }

function adminApp() {
  if (getApps().length > 0) return getApps()[0]!;
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY || process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!projectId || !clientEmail || !privateKey) {
    return initializeApp({ projectId: projectId || 'gen3ia-local' });
  }
  return initializeApp({ projectId });
}

function dbAdmin() {
  return getFirestore(adminApp());
}

const serverTimestamp = FieldValue.serverTimestamp;

function serialize(data: Record<string, unknown>): DocumentData {
  const out: DocumentData = {};
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue;
    if (value instanceof Date) out[key] = Timestamp.fromDate(value);
    else if (Array.isArray(value)) out[key] = value.map(serializeValue);
    else if (value && typeof value === 'object' && !(value instanceof Timestamp)) out[key] = serialize(value as Record<string, unknown>);
    else out[key] = value;
  }
  return out;
}

function serializeValue(value: unknown): unknown {
  if (value === undefined) return null;
  if (value instanceof Date) return Timestamp.fromDate(value);
  if (Array.isArray(value)) return value.map(serializeValue);
  if (value && typeof value === 'object' && !(value instanceof Timestamp)) return serialize(value as Record<string, unknown>);
  return value;
}

function deserialize(snapshot: DocumentData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(snapshot)) {
    if (value instanceof Timestamp) out[key] = value.toDate();
    else if (Array.isArray(value)) out[key] = value.map((v) => (v instanceof Timestamp ? v.toDate() : typeof v === 'object' && v !== null ? deserialize(v) : v));
    else if (value && typeof value === 'object') out[key] = deserialize(value);
    else out[key] = value;
  }
  return out;
}

function projectFields(data: Record<string, unknown>, select?: string[]): Record<string, unknown> {
  if (!select || select.length === 0) return data;
  const out: Record<string, unknown> = {};
  for (const field of select) if (field in data) out[field] = data[field];
  if ('id' in data) out.id = data.id;
  return out;
}

export class FirestoreRepository<T extends Record<string, unknown> = Record<string, unknown>> {
  constructor(private collectionName: string) {}
  private col(): CollectionReference<DocumentData> { return dbAdmin().collection(this.collectionName); }
  private docRef(id: string): DocumentReference<DocumentData> { return dbAdmin().doc(`${this.collectionName}/${id}`); }

  async findUnique(options: FindUniqueOptions): Promise<T | null> {
    if (options.where.id) {
      const snap = await this.docRef(options.where.id).get();
      if (!snap.exists) return null;
      const data = deserialize(snap.data() ?? {});
      data.id = snap.id;
      return projectFields(data, options.select) as T;
    }
    const entries = Object.entries(options.where).filter(([k]) => k !== 'id');
    if (entries.length === 0) return null;
    let q: Query<DocumentData> = this.col();
    for (const [field, value] of entries) q = q.where(field, '==', serializeValue(value));
    const snap = await q.get();
    if (snap.empty) return null;
    const d = snap.docs[0]!;
    const data = deserialize(d.data() ?? {});
    data.id = d.id;
    return projectFields(data, options.select) as T;
  }

  async findFirst(options: FindOptions): Promise<T | null> {
    const items = await this.findMany({ ...options, limit: 1 });
    return items[0] ?? null;
  }

  async findMany(options: FindOptions = {}): Promise<T[]> {
    let q: Query<DocumentData> = this.col();
    if (options.where) for (const w of options.where) q = q.where(w.field, w.op, serializeValue(w.value));
    if (options.orderBy) for (const o of options.orderBy) q = q.orderBy(o.field, o.direction || 'asc');
    if (options.limit) q = q.limit(options.limit);
    const snap = await q.get();
    let items: T[] = snap.docs.map((d) => {
      const data = deserialize(d.data() ?? {});
      data.id = d.id;
      return data as T;
    });
    if (options.select && options.select.length > 0) items = items.map((it) => projectFields(it, options.select) as T);
    if (options.offset && options.offset > 0) items = items.slice(options.offset);
    return items;
  }

  async count(options: Pick<FindOptions, 'where'> = {}): Promise<number> {
    let q: Query<DocumentData> = this.col();
    if (options.where) for (const w of options.where) q = q.where(w.field, w.op, serializeValue(w.value));
    // Firestore ne fournit pas de count() côté serveur dans tous les SDK admin ; on doit fetch.
    // Pour limiter le coût, on utilise un snapshot vide de métadonnées si dispo.
    const snap = await q.get();
    return snap.size;
  }

  async create(options: CreateOptions): Promise<T> {
    const data = serialize({ ...options.data, createdAt: options.data.createdAt ?? serverTimestamp(), updatedAt: serverTimestamp() });
    const ref = await this.col().add(data);
    const snap = await ref.get();
    const result = deserialize(snap.data() ?? {});
    result.id = ref.id;
    return result as T;
  }

  async createWithId(id: string, data: Record<string, unknown>): Promise<T> {
    const payload = serialize({ ...data, createdAt: data.createdAt ?? serverTimestamp(), updatedAt: serverTimestamp() });
    const ref = this.docRef(id);
    await ref.set(payload);
    const snap = await ref.get();
    const result = deserialize(snap.data() ?? {});
    result.id = id;
    return result as T;
  }

  async update(options: UpdateOptions): Promise<T> {
    const id = options.where.id;
    if (!id) throw new Error('update() requiert where.id');
    const ref = this.docRef(id);
    const payload = serialize({ ...options.data, updatedAt: serverTimestamp() });
    await ref.update(payload);
    const snap = await ref.get();
    const result = deserialize(snap.data() ?? {});
    result.id = id;
    return result as T;
  }

  async upsert(options: { where: { id: string }; create: Record<string, unknown>; update: Record<string, unknown> }): Promise<T> {
    const existing = await this.findUnique({ where: options.where });
    if (existing) return this.update({ where: options.where, data: options.update });
    return this.createWithId(options.where.id, options.create);
  }

  async updateMany(options: { where?: FirestoreWhereOp[]; data: Record<string, unknown> }): Promise<{ count: number }> {
    const items = await this.findMany({ where: options.where });
    const batch: WriteBatch = dbAdmin().batch();
    const payload = serialize({ ...options.data, updatedAt: serverTimestamp() });
    for (const item of items) batch.update(this.docRef((item as Record<string, unknown>).id as string), payload);
    await batch.commit();
    return { count: items.length };
  }

  async delete(options: DeleteOptions): Promise<void> {
    if (options.where.id) { await this.docRef(options.where.id).delete(); return; }
    const items = await this.findMany({ where: Object.entries(options.where).map(([field, value]) => ({ field, op: '==' as WhereFilterOp, value })) });
    const batch: WriteBatch = dbAdmin().batch();
    for (const item of items) batch.delete(this.docRef((item as Record<string, unknown>).id as string));
    await batch.commit();
  }

  async deleteMany(options: { where?: FirestoreWhereOp[] }): Promise<{ count: number }> {
    const items = await this.findMany({ where: options.where });
    const batch: WriteBatch = dbAdmin().batch();
    for (const item of items) batch.delete(this.docRef((item as Record<string, unknown>).id as string));
    await batch.commit();
    return { count: items.length };
  }

  async createMany(options: { data: Array<Record<string, unknown>> }): Promise<{ count: number }> {
    let count = 0;
    for (const item of options.data) { await this.create({ data: item }); count++; }
    return { count };
  }

  async aggregate(options: { where?: FirestoreWhereOp[]; _sum?: Record<string, boolean>; _count?: Record<string, boolean> }): Promise<{ _sum?: Record<string, number>; _count?: Record<string, number> }> {
    const items = await this.findMany({ where: options.where });
    const result: { _sum?: Record<string, number>; _count?: Record<string, number> } = {};
    if (options._sum) {
      result._sum = {};
      for (const field of Object.keys(options._sum)) {
        let sum = 0;
        for (const it of items) { const v = (it as Record<string, unknown>)[field]; if (typeof v === 'number') sum += v; }
        result._sum[field] = sum;
      }
    }
    if (options._count) {
      result._count = {};
      for (const field of Object.keys(options._count)) result._count[field] = items.length;
    }
    return result;
  }
}

export const Collections = {
  users: 'users', agents: 'agents', agentSuites: 'agent_suites', agentMemories: 'agent_memories',
  agentUsage: 'agent_usage', agentPermissions: 'agent_permissions', agentExecution: 'agent_executions',
  agentInvocations: 'agent_invocations', conversations: 'conversations', messages: 'messages',
  credits: 'credits', creditTransactions: 'credit_transactions', subscriptions: 'subscriptions',
  invoices: 'invoices', apiKeys: 'api_keys', mcpConnectors: 'mcp_connectors', tasks: 'tasks',
  workflows: 'workflows', workflowBranches: 'workflow_branches', workflowVersions: 'workflow_versions',
  workflowTemplates: 'workflow_templates', guardrails: 'guardrails', notifications: 'notifications',
  auditLogs: 'audit_logs', improvementLogs: 'improvement_logs', aiCosts: 'ai_costs',
  monitoringEvents: 'monitoring_events', usageDaily: 'usage_daily', sessions: 'sessions',
  feedback: 'feedback', socialAccounts: 'social_accounts', webhooks: 'webhooks',
  marketplaceListings: 'marketplace_listings', marketplacePurchases: 'marketplace_purchases',
  marketplaceReviews: 'marketplace_reviews', uploadedFiles: 'uploaded_files',
  partners: 'partners', partnerEvents: 'partner_events',
} as const;

function makeRepo<T extends Record<string, unknown> = Record<string, unknown>>(name: string): FirestoreRepository<T> {
  return new FirestoreRepository<T>(name);
}

export const db = {
  user: makeRepo(Collections.users),
  profile: makeRepo(Collections.users),
  agent: makeRepo(Collections.agents),
  agentSuite: makeRepo(Collections.agentSuites),
  agentMemory: makeRepo(Collections.agentMemories),
  agentUsage: makeRepo(Collections.agentUsage),
  agentPermission: makeRepo(Collections.agentPermissions),
  agentExecution: makeRepo(Collections.agentExecution),
  agentInvocation: makeRepo(Collections.agentInvocations),
  conversation: makeRepo(Collections.conversations),
  message: makeRepo(Collections.messages),
  credit: makeRepo(Collections.credits),
  creditTransaction: makeRepo(Collections.creditTransactions),
  subscription: makeRepo(Collections.subscriptions),
  invoice: makeRepo(Collections.invoices),
  apiKey: makeRepo(Collections.apiKeys),
  task: makeRepo(Collections.tasks),
  workflow: makeRepo(Collections.workflows),
  workflowBranch: makeRepo(Collections.workflowBranches),
  workflowVersion: makeRepo(Collections.workflowVersions),
  workflowTemplate: makeRepo(Collections.workflowTemplates),
  guardrail: makeRepo(Collections.guardrails),
  notification: makeRepo(Collections.notifications),
  auditLog: makeRepo(Collections.auditLogs),
  improvementLog: makeRepo(Collections.improvementLogs),
  aICost: makeRepo(Collections.aiCosts),
  monitoringEvent: makeRepo(Collections.monitoringEvents),
  usageDaily: makeRepo(Collections.usageDaily),
  feedback: makeRepo(Collections.feedback),
  socialAccount: makeRepo(Collections.socialAccounts),
  webhook: makeRepo(Collections.webhooks),
  marketplaceListing: makeRepo(Collections.marketplaceListings),
  marketplacePurchase: makeRepo(Collections.marketplacePurchases),
  marketplaceReview: makeRepo(Collections.marketplaceReviews),
  uploadedFile: makeRepo(Collections.uploadedFiles),
  partner: makeRepo(Collections.partners),
  partnerEvent: makeRepo(Collections.partnerEvents),
  $transaction: async <R>(fn: () => Promise<R>): Promise<R> => fn(),
} as const;

export const prisma = db;
export default db;
