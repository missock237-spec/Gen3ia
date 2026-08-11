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
//
//  Pour préserver la compat avec les ~50 API routes existantes qui
//  appellent `db.user.findUnique(...)` etc., on expose une facade
//  Prisma-like reposant sur Firestore.
// ============================================================

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  documentId,
  endAt,
  equalTo,
  getAggregate,
  getDocs,
  getFirestore,
  limit as limitFn,
  orderBy,
  query,
  queryEqual,
  serverTimestamp,
  setDoc,
  startAfter,
  startAt,
  Timestamp,
  updateDoc,
  where,
  WhereFilterOp,
  writeBatch,
  type DocumentData,
  type QueryConstraint,
  type QuerySnapshot,
} from 'firebase-admin/firestore';

import { getAdminDb } from './admin';

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

export interface CreateOptions {
  data: Record<string, unknown>;
}

export interface UpdateOptions {
  where: { id?: string; [key: string]: unknown };
  data: Record<string, unknown>;
}

export interface DeleteOptions {
  where: { id?: string; [key: string]: unknown };
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

export class FirestoreRepository<T extends Record<string, unknown> = Record<string, unknown>> {
  constructor(private collectionName: string) {}

  private db() {
    return getAdminDb();
  }

  private col() {
    return collection(this.db(), this.collectionName);
  }

  async findUnique(options: FindUniqueOptions): Promise<T | null> {
    // Recherche par ID
    if (options.where.id) {
      const snap = await doc(this.db(), this.collectionName, options.where.id).get();
      if (!snap.exists) return null;
      const data = deserialize(snap.data()!);
      data.id = snap.id;
      return projectFields(data, options.select) as T;
    }

    // Recherche par autre champ unique
    const entries = Object.entries(options.where).filter(([k]) => k !== 'id');
    if (entries.length === 0) return null;

    const constraints: QueryConstraint[] = entries.map(([field, value]) =>
      where(field, '==', serializeValue(value)),
    );
    const snap = await getDocs(query(this.col(), ...constraints));
    if (snap.empty) return null;
    const d = snap.docs[0]!;
    const data = deserialize(d.data());
    data.id = d.id;
    return projectFields(data, options.select) as T;
  }

  async findFirst(options: FindOptions): Promise<T | null> {
    const items = await this.findMany({ ...options, limit: 1 });
    return items[0] ?? null;
  }

  async findMany(options: FindOptions = {}): Promise<T[]> {
    const constraints: QueryConstraint[] = [];

    if (options.where) {
      for (const w of options.where) {
        constraints.push(where(w.field, w.op, serializeValue(w.value)));
      }
    }
    if (options.orderBy) {
      for (const o of options.orderBy) {
        constraints.push(orderBy(o.field, o.direction || 'asc'));
      }
    }
    if (options.limit) constraints.push(limitFn(options.limit));

    const snap = await getDocs(query(this.col(), ...constraints));
    const items: T[] = snap.docs.map((d) => {
      const data = deserialize(d.data());
      data.id = d.id;
      return data as T;
    });

    if (options.select && options.select.length > 0) {
      return items.map((it) => projectFields(it, options.select) as T);
    }
    if (options.offset && options.offset > 0) {
      return items.slice(options.offset);
    }
    return items;
  }

  async count(options: Pick<FindOptions, 'where'> = {}): Promise<number> {
    const constraints: QueryConstraint[] = [];
    if (options.where) {
      for (const w of options.where) {
        constraints.push(where(w.field, w.op, serializeValue(w.value)));
      }
    }
    const snap = await getDocs(query(this.col(), ...constraints));
    return snap.size;
  }

  async create(options: CreateOptions): Promise<T> {
    const data = serialize({ ...options.data, createdAt: options.data.createdAt ?? serverTimestamp(), updatedAt: serverTimestamp() });
    const ref = await addDoc(this.col(), data);
    const snap = await ref.get();
    const result = deserialize(snap.data()!);
    result.id = ref.id;
    return result as T;
  }

  /** Crée un document avec un ID explicite (ex: uid Firebase Auth) */
  async createWithId(id: string, data: Record<string, unknown>): Promise<T> {
    const payload = serialize({ ...data, createdAt: data.createdAt ?? serverTimestamp(), updatedAt: serverTimestamp() });
    await setDoc(doc(this.db(), this.collectionName, id), payload);
    const snap = await doc(this.db(), this.collectionName, id).get();
    const result = deserialize(snap.data()!);
    result.id = id;
    return result as T;
  }

  async update(options: UpdateOptions): Promise<T> {
    const id = options.where.id;
    if (!id) throw new Error('update() requiert where.id');
    const payload = serialize({ ...options.data, updatedAt: serverTimestamp() });
    await updateDoc(doc(this.db(), this.collectionName, id), payload);
    const snap = await doc(this.db(), this.collectionName, id).get();
    const result = deserialize(snap.data()!);
    result.id = id;
    return result as T;
  }

  async upsert(options: {
    where: { id: string };
    create: Record<string, unknown>;
    update: Record<string, unknown>;
  }): Promise<T> {
    const existing = await this.findUnique({ where: options.where });
    if (existing) {
      return this.update({ where: options.where, data: options.update });
    }
    return this.createWithId(options.where.id, options.create);
  }

  async updateMany(options: {
    where: FindOptions['where'];
    data: Record<string, unknown>;
  }): Promise<{ count: number }> {
    const items = await this.findMany({ where: options.where });
    const batch = writeBatch(this.db());
    const payload = serialize({ ...options.data, updatedAt: serverTimestamp() });
    for (const item of items) {
      const id = (item as Record<string, unknown>).id as string;
      batch.update(doc(this.db(), this.collectionName, id), payload);
    }
    await batch.commit();
    return { count: items.length };
  }

  async delete(options: DeleteOptions): Promise<void> {
    if (options.where.id) {
      await deleteDoc(doc(this.db(), this.collectionName, options.where.id));
      return;
    }
    // Delete by other field
    const items = await this.findMany({ where: this.whereFromOptions(options.where) });
    const batch = writeBatch(this.db());
    for (const item of items) {
      const id = (item as Record<string, unknown>).id as string;
      batch.delete(doc(this.db(), this.collectionName, id));
    }
    await batch.commit();
  }

  async deleteMany(options: { where: FindOptions['where'] }): Promise<{ count: number }> {
    const items = await this.findMany({ where: options.where });
    const batch = writeBatch(this.db());
    for (const item of items) {
      const id = (item as Record<string, unknown>).id as string;
      batch.delete(doc(this.db(), this.collectionName, id));
    }
    await batch.commit();
    return { count: items.length };
  }

  private whereFromOptions(whereObj: Record<string, unknown>): FirestoreWhereOp[] {
    return Object.entries(whereObj).map(([field, value]) => ({
      field,
      op: '==' as WhereFilterOp,
      value,
    }));
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
  agentMemories: 'agent_memories',
  agentUsage: 'agent_usage',
  conversations: 'conversations',
  messages: 'messages',
  credits: 'credits',
  subscriptions: 'subscriptions',
  invoices: 'invoices',
  apiKeys: 'api_keys',
  tasks: 'tasks',
  workflows: 'workflows',
  workflowTemplates: 'workflow_templates',
  guardrails: 'guardrails',
  notifications: 'notifications',
  auditLogs: 'audit_logs',
  improvementLogs: 'improvement_logs',
  aiCosts: 'ai_costs',
  monitoringEvents: 'monitoring_events',
  usageDaily: 'usage_daily',
  sessions: 'sessions',
  feedback: 'feedback',
  socialAccounts: 'social_accounts',
  webhooks: 'webhooks',
  marketplaceListings: 'marketplace_listings',
  marketplacePurchases: 'marketplace_purchases',
  marketplaceReviews: 'marketplace_reviews',
  uploadedFiles: 'uploaded_files',
} as const;

export type CollectionName = typeof Collections[keyof typeof Collections];

// ============================================================
// API Prisma-like (db.<model>.<method>)
// ============================================================

function makeRepo<T extends Record<string, unknown> = Record<string, unknown>>(name: string): FirestoreRepository<T> {
  return new FirestoreRepository<T>(name);
}

export const db = {
  user: makeRepo<Record<string, unknown>>(Collections.users),
  profile: makeRepo<Record<string, unknown>>(Collections.users),
  agent: makeRepo<Record<string, unknown>>(Collections.agents),
  agentSuite: makeRepo<Record<string, unknown>>(Collections.agentSuites),
  agentMemory: makeRepo<Record<string, unknown>>(Collections.agentMemories),
  agentUsage: makeRepo<Record<string, unknown>>(Collections.agentUsage),
  conversation: makeRepo<Record<string, unknown>>(Collections.conversations),
  message: makeRepo<Record<string, unknown>>(Collections.messages),
  credit: makeRepo<Record<string, unknown>>(Collections.credits),
  subscription: makeRepo<Record<string, unknown>>(Collections.subscriptions),
  invoice: makeRepo<Record<string, unknown>>(Collections.invoices),
  apiKey: makeRepo<Record<string, unknown>>(Collections.apiKeys),
  task: makeRepo<Record<string, unknown>>(Collections.tasks),
  workflow: makeRepo<Record<string, unknown>>(Collections.workflows),
  workflowTemplate: makeRepo<Record<string, unknown>>(Collections.workflowTemplates),
  guardrail: makeRepo<Record<string, unknown>>(Collections.guardrails),
  notification: makeRepo<Record<string, unknown>>(Collections.notifications),
  auditLog: makeRepo<Record<string, unknown>>(Collections.auditLogs),
  improvementLog: makeRepo<Record<string, unknown>>(Collections.improvementLogs),
  aICost: makeRepo<Record<string, unknown>>(Collections.aiCosts),
  monitoringEvent: makeRepo<Record<string, unknown>>(Collections.monitoringEvents),
  usageDaily: makeRepo<Record<string, unknown>>(Collections.usageDaily),
  feedback: makeRepo<Record<string, unknown>>(Collections.feedback),
  socialAccount: makeRepo<Record<string, unknown>>(Collections.socialAccounts),
  webhook: makeRepo<Record<string, unknown>>(Collections.webhooks),
  marketplaceListing: makeRepo<Record<string, unknown>>(Collections.marketplaceListings),
  marketplacePurchase: makeRepo<Record<string, unknown>>(Collections.marketplacePurchases),
  marketplaceReview: makeRepo<Record<string, unknown>>(Collections.marketplaceReviews),
  uploadedFile: makeRepo<Record<string, unknown>>(Collections.uploadedFiles),
  $transaction: async <R>(fn: () => Promise<R>): Promise<R> => fn(),
};

// Alias pour compat avec l'ancien import `prisma` from '@/lib/prisma'
export const prisma = db;

export default db;
