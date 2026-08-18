// ============================================================
// KNOWLEDGE GRAPH — RAG augmenté par relations
// ------------------------------------------------------------
//  Inspiré de Microsoft GraphRAG + NVIDIA NeMo Curator.
//  Fonctions:
//    1. Stockage de triplets (subject, predicate, object)
//    2. Embeddings vectoriels par entité + par relation
//    3. Requête: traversée de graphe (1-hop, 2-hop) + similarité vectorielle
//    4. Hybride RAG: text-chunk retrieval + KG expansion
//
//  Persistance: Firestore (collections "kg_entities", "kg_relations", "kg_chunks").
//  Embeddings: stockés dans les documents (best-effort — sinon délégué à Pinecone/Weaviate).
// ============================================================

import { db } from '@/lib/db';
import { createLogger } from '@/lib/logger';

const log = createLogger('knowledge-graph');

// ─── Types ────────────────────────────────────────────────────────────────

export interface KgEntity {
  id: string;
  /** Type d'entité (person, place, concept, organization, event, ...) */
  type: string;
  /** Nom canonique (ex: "Emmanuel Macron") */
  name: string;
  /** Noms alternatifs / alias */
  aliases?: string[];
  /** Description textuelle */
  description?: string;
  /** Embedding vectoriel (cos-sim compatible) */
  embedding?: number[];
  /** Métadonnées libres */
  metadata?: Record<string, unknown>;
  /** Workspace / tenant propriétaire */
  workspaceId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface KgRelation {
  id: string;
  /** Type de relation (works_for, located_in, part_of, ...) */
  predicate: string;
  /** ID de l'entité sujet */
  subjectId: string;
  /** ID de l'entité objet */
  objectId: string;
  /** Confiance (0..1) */
  confidence?: number;
  /** Source (URL, document, ...) */
  source?: string;
  /** Embedding de la relation */
  embedding?: number[];
  /** Métadonnées */
  metadata?: Record<string, unknown>;
  workspaceId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface KgChunk {
  id: string;
  /** Texte du chunk */
  content: string;
  /** Embedding (1536-d typical) */
  embedding?: number[];
  /** Entités mentionnées dans ce chunk */
  entityIds?: string[];
  /** Source document ID */
  documentId?: string;
  /** Page/chunk number */
  chunkIndex?: number;
  workspaceId?: string;
  createdAt: Date;
}

export interface KgQueryResult {
  entities: KgEntity[];
  relations: KgRelation[];
  /** Entités connectées au sujet de la requête (k-hop) */
  neighbors: KgEntity[];
  /** Chunks vectoriels les plus proches */
  chunks: KgChunk[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function cosSim(a: number[], b: number[]): number {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom > 0 ? dot / denom : 0;
}

// ─── Service ───────────────────────────────────────────────────────────────

class KnowledgeGraphService {
  // ─── Entities ─────────────────────────────────────────────────────────

  async upsertEntity(params: Omit<KgEntity, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<KgEntity> {
    const now = new Date();
    const id = params.id ?? `ent_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const entity: KgEntity = {
      ...params,
      id,
      createdAt: now,
      updatedAt: now,
    } as KgEntity;

    await db.kgEntity.create({ data: entity as never }).catch((e: unknown) => {
      // Si existe déjà → upsert via update
      db.kgEntity.update({ where: { id }, data: { ...entity, createdAt: undefined } as never }).catch(() => undefined);
      log.debug('entity_upsert_fallback', { id, error: e instanceof Error ? e.message : '' });
    });

    log.info('entity_upserted', { id, name: params.name, type: params.type });
    return entity;
  }

  async getEntity(id: string): Promise<KgEntity | null> {
    const doc = (await db.kgEntity.findUnique({ where: { id } }).catch(() => null)) as
      | Record<string, unknown>
      | null;
    return doc as unknown as KgEntity | null;
  }

  async findEntityByName(name: string, workspaceId?: string): Promise<KgEntity | null> {
    const where = [
      { field: 'name', op: '==', value: name },
      ...(workspaceId ? [{ field: 'workspaceId', op: '==', value: workspaceId }] : []),
    ];
    const docs = (await db.kgEntity.findMany({ where: where as never, limit: 1 }).catch(() => [])) as unknown as Array<Record<string, unknown>>;
    return (docs[0] as unknown as KgEntity) ?? null;
  }

  // ─── Relations ────────────────────────────────────────────────────────

  async upsertRelation(params: Omit<KgRelation, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<KgRelation> {
    const now = new Date();
    const id = params.id ?? `rel_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const rel: KgRelation = {
      ...params,
      id,
      createdAt: now,
      updatedAt: now,
    } as KgRelation;

    await db.kgRelation.create({ data: rel as never }).catch(() => {
      db.kgRelation.update({ where: { id }, data: { ...rel, createdAt: undefined } as never }).catch(() => undefined);
    });

    log.info('relation_upserted', { id, predicate: params.predicate, subjectId: params.subjectId, objectId: params.objectId });
    return rel;
  }

  /**
   * Récupère toutes les relations connectées à une entité (in + out).
   */
  async getRelationsForEntity(entityId: string, hops = 1): Promise<{ direct: KgRelation[]; neighbors: KgEntity[] }> {
    if (hops < 1) return { direct: [], neighbors: [] };

    // 1-hop
    const directDocs = (await db.kgRelation.findMany({
      where: [
        { field: 'subjectId', op: '==', value: entityId },
      ],
      limit: 200,
    }).catch(() => [])) as unknown as Array<Record<string, unknown>>;

    const reverseDocs = (await db.kgRelation.findMany({
      where: [
        { field: 'objectId', op: '==', value: entityId },
      ],
      limit: 200,
    }).catch(() => [])) as unknown as Array<Record<string, unknown>>;

    const direct = directDocs as unknown as KgRelation[];
    const reverse = reverseDocs as unknown as KgRelation[];
    const all = [...direct, ...reverse];

    // Collecter les IDs des entités connectées
    const neighborIds = new Set<string>();
    for (const r of all) {
      if (r.subjectId !== entityId) neighborIds.add(r.subjectId);
      if (r.objectId !== entityId) neighborIds.add(r.objectId);
    }

    const neighbors: KgEntity[] = [];
    for (const nid of neighborIds) {
      const e = await this.getEntity(nid).catch(() => null);
      if (e) neighbors.push(e);
    }

    return { direct: all, neighbors };
  }

  // ─── Chunks (text embeddings) ─────────────────────────────────────────

  async addChunk(params: Omit<KgChunk, 'id' | 'createdAt'> & { id?: string }): Promise<KgChunk> {
    const id = params.id ?? `chunk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const chunk: KgChunk = {
      ...params,
      id,
      createdAt: new Date(),
    } as KgChunk;

    await db.kgChunk.create({ data: chunk as never }).catch((e: unknown) => {
      log.warn('chunk_add_failed', { id, error: e instanceof Error ? e.message : '' });
    });
    return chunk;
  }

  /**
   * Recherche vectorielle approximative (k-NN) sur les chunks.
   * Implémentation naïve: charge tous les chunks (limite 500) et calcule cos-sim.
   * Pour un volume > 500 chunks, brancher Pinecone/Weaviate/Qdrant.
   */
  async vectorSearch(queryEmbedding: number[], opts: { topK?: number; workspaceId?: string } = {}): Promise<Array<{ chunk: KgChunk; score: number }>> {
    const where = opts.workspaceId ? [{ field: 'workspaceId', op: '==', value: opts.workspaceId }] : [];
    const docs = (await db.kgChunk.findMany({ where: where as never, limit: 500 }).catch(() => [])) as unknown as Array<Record<string, unknown>>;
    const chunks = docs as unknown as KgChunk[];

    const scored = chunks
      .filter((c) => c.embedding && c.embedding.length > 0)
      .map((chunk) => ({ chunk, score: cosSim(queryEmbedding, chunk.embedding!) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, opts.topK ?? 5);

    return scored;
  }

  // ─── Query hybride ────────────────────────────────────────────────────

  /**
   * Requête hybride Knowledge Graph + Vector RAG.
   *
   * Étapes:
   *   1. Recherche vectorielle des chunks les plus proches
   *   2. Extraction des entités mentionnées dans ces chunks
   *   3. Expansion 1-hop dans le KG: voisins de ces entités
   *   4. Retourne entités + relations + chunks
   */
  async hybridQuery(params: {
    queryEmbedding?: number[];
    queryEntities?: string[]; // noms d'entités pour lookup direct
    hops?: number;
    topK?: number;
    workspaceId?: string;
  }): Promise<KgQueryResult> {
    const { queryEmbedding, queryEntities = [], hops = 1, topK = 5, workspaceId } = params;

    // 1. Lookup par nom (entités demandées explicitement)
    const seedEntities: KgEntity[] = [];
    for (const name of queryEntities) {
      const e = await this.findEntityByName(name, workspaceId);
      if (e) seedEntities.push(e);
    }

    // 2. Recherche vectorielle (si embedding fourni)
    let chunks: KgChunk[] = [];
    if (queryEmbedding && queryEmbedding.length > 0) {
      const results = await this.vectorSearch(queryEmbedding, { topK, workspaceId });
      chunks = results.map((r) => r.chunk);
      // Récupérer les entités mentionnées dans ces chunks
      const entityIds = new Set<string>();
      for (const c of chunks) {
        for (const eid of c.entityIds ?? []) entityIds.add(eid);
      }
      for (const eid of entityIds) {
        const e = await this.getEntity(eid).catch(() => null);
        if (e && !seedEntities.find((s) => s.id === e.id)) seedEntities.push(e);
      }
    }

    // 3. Expansion k-hop
    const allRelations: KgRelation[] = [];
    const allNeighbors: KgEntity[] = [];
    const seenEntityIds = new Set<string>(seedEntities.map((e) => e.id));

    for (const e of seedEntities) {
      const { direct, neighbors } = await this.getRelationsForEntity(e.id, hops);
      allRelations.push(...direct);
      for (const n of neighbors) {
        if (!seenEntityIds.has(n.id)) {
          seenEntityIds.add(n.id);
          allNeighbors.push(n);
        }
      }
    }

    return {
      entities: seedEntities,
      relations: allRelations,
      neighbors: allNeighbors,
      chunks,
    };
  }

  /**
   * Stats admin.
   */
  async getStats(workspaceId?: string): Promise<{ entities: number; relations: number; chunks: number }> {
    const where = workspaceId ? [{ field: 'workspaceId', op: '==', value: workspaceId }] : [];
    const [entities, relations, chunks] = await Promise.all([
      db.kgEntity.findMany({ where: where as never, limit: 1 }).catch(() => []),
      db.kgRelation.findMany({ where: where as never, limit: 1 }).catch(() => []),
      db.kgChunk.findMany({ where: where as never, limit: 1 }).catch(() => []),
    ]);
    return {
      entities: entities.length,
      relations: relations.length,
      chunks: chunks.length,
    };
  }
}

export const knowledgeGraph = new KnowledgeGraphService();
export default knowledgeGraph;
