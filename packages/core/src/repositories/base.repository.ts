// ============================================================
// Gen3ia — BaseRepository (Cloud Firestore)
// ============================================================
//  Remplace le repository Prisma-based supprimé pendant la
//  migration Firebase. API volontairement Prisma-like pour
//  préserver la compat avec les services existants.
// ============================================================

import { cert, getApps, initializeApp } from 'firebase-admin/app';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  getFirestore,
  limit as limitFn,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
  type QueryConstraint,
  type WhereFilterOp,
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

function project(data: Record<string, unknown>, select?: string[]): Record<string, unknown> {
  if (!select || select.length === 0) return data;
  const out: Record<string, unknown> = {};
  for (const f of select) if (f in data) out[f] = data[f];
  if ('id' in data) out.id = data.id;
  return out;
}

// ============================================================
// BaseRepository
// ============================================================

export class BaseRepository<T extends Record<string, unknown> = Record<string, unknown>> {
  constructor(protected collectionName: string) {}

  protected db() {
    return getFirestore(adminApp());
  }

  protected col() {
    return collection(this.db(), this.collectionName);
  }

  async findById(id: string, select?: string[]): Promise<T | null> {
    const snap = await doc(this.db(), this.collectionName, id).get();
    if (!snap.exists) return null;
    const data = deserialize(snap.data()!);
    data.id = snap.id;
    return project(data, select) as T;
  }

  async findByIdOrThrow(id: string, select?: string[]): Promise<T> {
    const found = await this.findById(id, select);
    if (!found) throw new Error(`${this.collectionName} introuvable: ${id}`);
    return found;
  }

  async findUnique(args: FindUniqueArgs): Promise<T | null> {
    if (args.where.id) return this.findById(args.where.id, args.select);
    const entries = Object.entries(args.where).filter(([k]) => k !== 'id');
    if (entries.length === 0) return null;
    const constraints: QueryConstraint[] = entries.map(([field, value]) => where(field, '==', serializeValue(value)));
    const snap = await getDocs(query(this.col(), ...constraints));
    if (snap.empty) return null;
    const d = snap.docs[0]!;
    const data = deserialize(d.data());
    data.id = d.id;
    return project(data, args.select) as T;
  }

  async findFirst(args: FindManyArgs = {}): Promise<T | null> {
    const items = await this.findMany({ ...args, take: 1 });
    return items[0] ?? null;
  }

  async findMany(args: FindManyArgs = {}): Promise<T[]> {
    const constraints: QueryConstraint[] = [];
    if (args.where) for (const w of args.where) constraints.push(where(w.field, w.op, serializeValue(w.value)));
    const order = args.orderBy ? (Array.isArray(args.orderBy) ? args.orderBy : [args.orderBy]) : [];
    for (const o of order) constraints.push(orderBy(o.field, o.direction || 'asc'));
    if (args.take) constraints.push(limitFn(args.take));

    const snap = await getDocs(query(this.col(), ...constraints));
    let items = snap.docs.map((d) => {
      const data = deserialize(d.data());
      data.id = d.id;
      return data as T;
    });
    if (args.skip && args.skip > 0) items = items.slice(args.skip);
    if (args.select && args.select.length > 0) items = items.map((it) => project(it as Record<string, unknown>, args.select) as T);
    return items;
  }

  async count(where?: WhereOp[]): Promise<number> {
    const constraints: QueryConstraint[] = [];
    if (where) for (const w of where) constraints.push(where(w.field, w.op, serializeValue(w.value)));
    const snap = await getDocs(query(this.col(), ...constraints));
    return snap.size;
  }

  async create(data: Record<string, unknown>): Promise<T> {
    const payload = serialize({ ...data, createdAt: data.createdAt ?? serverTimestamp(), updatedAt: data.updatedAt ?? serverTimestamp() });
    const ref = await addDoc(this.col(), payload);
    const snap = await ref.get();
    const result = deserialize(snap.data()!);
    result.id = ref.id;
    return result as T;
  }

  async createWithId(id: string, data: Record<string, unknown>): Promise<T> {
    const payload = serialize({ ...data, createdAt: data.createdAt ?? serverTimestamp(), updatedAt: data.updatedAt ?? serverTimestamp() });
    await setDoc(doc(this.db(), this.collectionName, id), payload);
    const snap = await doc(this.db(), this.collectionName, id).get();
    const result = deserialize(snap.data()!);
    result.id = id;
    return result as T;
  }

  async update(id: string, data: Record<string, unknown>): Promise<T> {
    const payload = serialize({ ...data, updatedAt: serverTimestamp() });
    await updateDoc(doc(this.db(), this.collectionName, id), payload);
    const snap = await doc(this.db(), this.collectionName, id).get();
    const result = deserialize(snap.data()!);
    result.id = id;
    return result as T;
  }

  async delete(id: string): Promise<void> {
    await deleteDoc(doc(this.db(), this.collectionName, id));
  }

  async updateMany(where: WhereOp[], data: Record<string, unknown>): Promise<{ count: number }> {
    const items = await this.findMany({ where });
    const batch = writeBatch(this.db());
    const payload = serialize({ ...data, updatedAt: serverTimestamp() });
    for (const item of items) batch.update(doc(this.db(), this.collectionName, (item as Record<string, unknown>).id as string), payload);
    await batch.commit();
    return { count: items.length };
  }

  protected subcollection(parentId: string, subName: string): BaseRepository {
    return new BaseRepository(`${this.collectionName}/${parentId}/${subName}`);
  }
}
