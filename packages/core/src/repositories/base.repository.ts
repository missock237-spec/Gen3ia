// ============================================================
// Gen3ia — BaseRepository (Cloud Firestore)
// ============================================================
//  Remplace le repository Prisma-based supprimé pendant la
//  migration Firebase. API volontairement Prisma-like pour
//  préserver la compat avec les services existants.
// ============================================================

import { cert, getApps, initializeApp } from 'firebase-admin/app';
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

// Initialisation idempotente du SDK Admin (si clés fournies)
function adminApp() {
  if (getApps().length > 0) return getApps()[0]!;
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY || process.env.FIREBASE_SERVICE_ACCOUNT;

  if (!projectId || !clientEmail || !privateKey) {
    // Mode émulateur / fonctionnel sans creds : application par défaut
    return initializeApp({ projectId: projectId || 'gen3ia-local' });
  }

  const credentials =
    typeof privateKey === 'string' && privateKey.trim().startsWith('{') ? JSON.parse(privateKey) : { clientEmail, privateKey: privateKey.replace(/\\n/g, '\n') };

  return initializeApp({
    credential: cert(credentials as Parameters<typeof cert>[0]),
    projectId,
  });
}

// ============================================================
// Types (Prisma-like)
// ============================================================

export interface WhereOp {
  field: string;
  op: WhereFilterOp;
  value: unknown;
}

export interface OrderByClause {
  field: string;
  direction?: 'asc' | 'desc';
}

export interface FindManyArgs {
  where?: WhereOp[];
  orderBy?: OrderByClause | OrderByClause[];
  take?: number;
  skip?: number;
  select?: string[];
}

export interface FindUniqueArgs {
  where: { id?: string; [key: string]: unknown };
  select?: string[];
}

/** Sélecteur Prisma-like : `{ credits: true }` ou `['credits']` */
export type Select = string[] | Record<string, boolean>;

// ============================================================
// Sérialisation
// ============================================================

function serialize(data: Record<string, unknown>): DocumentData {
  const out: DocumentData = {};
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue;
    if (value instanceof Date) out[key] = Timestamp.fromDate(value);
    else if (Array.isArray(value)) out[key] = value.map(serializeValue);
    else if (value && typeof value === 'object' && !(value instanceof Timestamp)) {
      out[key] = serialize(value as Record<string, unknown>);
    } else out[key] = value;
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
    if (value instanceof Timestamp) out[key] = value.toDate();
    else if (Array.isArray(value)) out[key] = value.map((v) => (v instanceof Timestamp ? v.toDate() : v));
    else if (value && typeof value === 'object') out[key] = deserialize(value);
    else out[key] = value;
  }
  return out;
}

function normalizeSelect(select?: Select): string[] | undefined {
  if (!select) return undefined;
  if (Array.isArray(select)) return select;
  return Object.entries(select)
    .filter(([, v]) => v)
    .map(([k]) => k);
}

function project<T extends Record<string, unknown>>(data: T, select?: Select): T {
  const fields = normalizeSelect(select);
  if (!fields || fields.length === 0) return data;
  const out: Record<string, unknown> = {};
  for (const f of fields) if (f in data) out[f] = data[f];
  if ('id' in data) out.id = data.id;
  return out as T;
}

// ============================================================
// BaseRepository
// ============================================================

export class BaseRepository<T extends Record<string, unknown> = Record<string, unknown>> {
  constructor(protected collectionName: string) {}

  protected db() {
    return getFirestore(adminApp());
  }

  protected col(): CollectionReference<DocumentData> {
    return this.db().collection(this.collectionName);
  }

  protected docRef(id: string): DocumentReference<DocumentData> {
    return this.db().doc(`${this.collectionName}/${id}`);
  }

  async findById(id: string, select?: Select): Promise<T | null> {
    const snap = await this.docRef(id).get();
    if (!snap.exists) return null;
    const data = deserialize(snap.data()!);
    data.id = snap.id;
    return project(data as T, select);
  }

  async findByIdOrThrow(id: string, select?: Select): Promise<T> {
    const found = await this.findById(id, select);
    if (!found) throw new Error(`${this.collectionName} introuvable: ${id}`);
    return found;
  }

  async findUnique(args: FindUniqueArgs): Promise<T | null> {
    if (args.where.id) return this.findById(args.where.id, args.select);
    const entries = Object.entries(args.where).filter(([k]) => k !== 'id');
    if (entries.length === 0) return null;
    let q: Query<DocumentData> = this.col();
    for (const [field, value] of entries) q = q.where(field, '==', serializeValue(value));
    const snap = await q.get();
    if (snap.empty) return null;
    const d = snap.docs[0]!;
    const data = deserialize(d.data() ?? {});
    data.id = d.id;
    return project(data as T, args.select);
  }

  async findFirst(args: FindManyArgs = {}): Promise<T | null> {
    const items = await this.findMany({ ...args, take: 1 });
    return items[0] ?? null;
  }

  async findMany(args: FindManyArgs = {}): Promise<T[]> {
    let q: Query<DocumentData> = this.col();
    if (args.where) for (const w of args.where) q = q.where(w.field, w.op, serializeValue(w.value));
    const order = args.orderBy ? (Array.isArray(args.orderBy) ? args.orderBy : [args.orderBy]) : [];
    for (const o of order) q = q.orderBy(o.field, o.direction || 'asc');
    if (args.take) q = q.limit(args.take);

    const snap = await q.get();
    let items = snap.docs.map((d) => {
      const data = deserialize(d.data() ?? {});
      data.id = d.id;
      return data as T;
    });
    if (args.skip && args.skip > 0) items = items.slice(args.skip);
    if (args.select && args.select.length > 0) items = items.map((it) => project(it, args.select) as T);
    return items;
  }

  async count(where?: WhereOp[]): Promise<number> {
    let q: Query<DocumentData> = this.col();
    if (where) for (const w of where) q = q.where(w.field, w.op, serializeValue(w.value));
    const snap = await q.get();
    return snap.size;
  }

  async create(data: Record<string, unknown>): Promise<T> {
    const payload = serialize({ ...data, createdAt: data.createdAt ?? FieldValue.serverTimestamp(), updatedAt: data.updatedAt ?? FieldValue.serverTimestamp() });
    const ref = await this.col().add(payload);
    const snap = await ref.get();
    const result = deserialize(snap.data() ?? {});
    result.id = ref.id;
    return result as T;
  }

  async createWithId(id: string, data: Record<string, unknown>): Promise<T> {
    const payload = serialize({ ...data, createdAt: data.createdAt ?? FieldValue.serverTimestamp(), updatedAt: data.updatedAt ?? FieldValue.serverTimestamp() });
    const ref = this.docRef(id);
    await ref.set(payload);
    const snap = await ref.get();
    const result = deserialize(snap.data() ?? {});
    result.id = id;
    return result as T;
  }

  async update(id: string, data: Record<string, unknown>): Promise<T> {
    const ref = this.docRef(id);
    const payload = serialize({ ...data, updatedAt: FieldValue.serverTimestamp() });
    await ref.update(payload);
    const snap = await ref.get();
    const result = deserialize(snap.data() ?? {});
    result.id = id;
    return result as T;
  }

  async delete(id: string): Promise<void> {
    await this.docRef(id).delete();
  }

  async updateMany(where: WhereOp[], data: Record<string, unknown>): Promise<{ count: number }> {
    const items = await this.findMany({ where });
    const batch: WriteBatch = this.db().batch();
    const payload = serialize({ ...data, updatedAt: FieldValue.serverTimestamp() });
    for (const item of items) batch.update(this.docRef((item as Record<string, unknown>).id as string), payload);
    await batch.commit();
    return { count: items.length };
  }

  protected subcollection(parentId: string, subName: string): BaseRepository {
    return new BaseRepository(`${this.collectionName}/${parentId}/${subName}`);
  }
}
