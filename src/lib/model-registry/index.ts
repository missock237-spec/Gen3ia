// ============================================================
// MODEL REGISTRY — Catalogue de modèles IA
// ------------------------------------------------------------
//  Permet à Gen3ia de rivaliser avec le NGC (NVIDIA GPU Cloud)
//  Registry: un catalogue centralisé de tous les modèles utilisés
//  par la plateforme (LLM, image, audio, vidéo, embedding).
//
//  Persistance: Firestore (collection "model_registry_entries").
//  Lecture publique: tout utilisateur authentifié.
//  Écriture: admins seulement (ou seed automatique au démarrage).
// ============================================================

import { db } from '@/lib/db';
import { createLogger } from '@/lib/logger';

const log = createLogger('model-registry');
const COLLECTION = 'model_registry_entries';

// ─── Types ────────────────────────────────────────────────────────────────

export type ModelType =
  | 'llm'
  | 'vision-llm'
  | 'image-generation'
  | 'audio-tts'
  | 'audio-stt'
  | 'video-generation'
  | 'embedding'
  | 'reranker'
  | 'classification';

export type ModelProvider =
  | 'openai'
  | 'anthropic'
  | 'groq'
  | 'huggingface'
  | 'openrouter'
  | 'stability'
  | 'black-forest-labs'
  | 'suno'
  | 'meta'
  | 'mistral'
  | 'google'
  | 'nvidia'
  | 'custom';

export type ModelCapability =
  | 'chat'
  | 'completion'
  | 'function-calling'
  | 'vision'
  | 'audio-input'
  | 'audio-output'
  | 'image-output'
  | 'video-output'
  | 'embeddings'
  | 'rerank'
  | 'reasoning'
  | 'code-generation'
  | 'multi-lingual'
  | 'long-context';

export type LicenseType =
  | 'open-source'
  | 'research'
  | 'commercial'
  | 'proprietary';

export interface ModelPricing {
  /** Prix par 1M tokens d'entrée (USD) */
  inputPerMillionTokens?: number;
  /** Prix par 1M tokens de sortie (USD) */
  outputPerMillionTokens?: number;
  /** Prix par image générée (USD) */
  perImage?: number;
  /** Prix par minute audio générée (USD) */
  perAudioMinute?: number;
  /** Prix par 1M caractères (TTS) */
  perMillionChars?: number;
  /** True si entièrement gratuit (HuggingFace Inference free tier) */
  isFree?: boolean;
}

export interface ModelRegistryEntry {
  id: string;
  /** Nom canonique du modèle (ex: "llama-3.3-70b-versatile") */
  name: string;
  /** Identifiant de modèle pour le provider (ex: "meta-llama/Llama-3.3-70B") */
  providerModelId: string;
  /** Provider */
  provider: ModelProvider;
  /** Type de modèle */
  type: ModelType;
  /** Capacités supportées */
  capabilities: ModelCapability[];
  /** Taille du contexte (tokens) — null si non applicable */
  contextWindow?: number | null;
  /** Prix (USD) */
  pricing: ModelPricing;
  /** Licence */
  license: LicenseType;
  /** Langues supportées (codes ISO 639-1) */
  languages?: string[];
  /** Architecture (transformer, mamba, rwkv, ...) */
  architecture?: string;
  /** Nombre de paramètres (en milliards, ex: 70 pour 70B) */
  parametersB?: number;
  /** Description humaine */
  description?: string;
  /** Tags libres */
  tags?: string[];
  /** Statut: active | deprecated | preview */
  status: 'active' | 'deprecated' | 'preview';
  /** Métriques d'usage (mises à jour périodiquement) */
  usageStats?: {
    totalInvocations: number;
    lastInvokedAt?: string;
    averageLatencyMs?: number;
    successRate?: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

// ─── Model Registry Service ───────────────────────────────────────────────

class ModelRegistryService {
  /**
   * Liste tous les modèles du catalogue, filtrés par type/provider.
   */
  async list(filter: {
    type?: ModelType;
    provider?: ModelProvider;
    capability?: ModelCapability;
    status?: 'active' | 'deprecated' | 'preview';
    license?: LicenseType;
    freeOnly?: boolean;
    limit?: number;
    offset?: number;
  } = {}): Promise<ModelRegistryEntry[]> {
    const whereOps: Array<{ field: string; op: '==' | 'in'; value: unknown }> = [];
    if (filter.type) whereOps.push({ field: 'type', op: '==', value: filter.type });
    if (filter.provider) whereOps.push({ field: 'provider', op: '==', value: filter.provider });
    if (filter.status) whereOps.push({ field: 'status', op: '==', value: filter.status });
    if (filter.license) whereOps.push({ field: 'license', op: '==', value: filter.license });

    const docs = (await db.modelRegistryEntry.findMany({
      where: whereOps as never,
      limit: filter.limit ?? 200,
    }).catch(() => [])) as unknown as Array<Record<string, unknown>>;

    let filtered = docs as unknown as ModelRegistryEntry[];

    if (filter.capability) {
      filtered = filtered.filter((m) => (m.capabilities ?? []).includes(filter.capability!));
    }
    if (filter.freeOnly) {
      filtered = filtered.filter((m) => m.pricing?.isFree === true);
    }

    // Pagination after capability filter
    const start = filter.offset ?? 0;
    return filtered.slice(start, start + (filter.limit ?? 200));
  }

  /**
   * Récupère un modèle par ID.
   */
  async get(id: string): Promise<ModelRegistryEntry | null> {
    const doc = (await db.modelRegistryEntry.findUnique({ where: { id } }).catch(() => null)) as
      | Record<string, unknown>
      | null;
    return doc as unknown as ModelRegistryEntry | null;
  }

  /**
   * Récupère un modèle par nom canonique.
   */
  async getByName(name: string): Promise<ModelRegistryEntry | null> {
    const docs = (await db.modelRegistryEntry.findMany({
      where: [{ field: 'name', op: '==', value: name }],
      limit: 1,
    }).catch(() => [])) as unknown as Array<Record<string, unknown>>;
    return (docs[0] as unknown as ModelRegistryEntry) ?? null;
  }

  /**
   * Crée ou met à jour un modèle.
   */
  async upsert(entry: Omit<ModelRegistryEntry, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<ModelRegistryEntry> {
    const now = new Date();
    const id = entry.id ?? `model_${entry.provider}_${entry.name}`.toLowerCase().replace(/[^a-z0-9_]/g, '_');

    const existing = await this.get(id).catch(() => null);
    const final: ModelRegistryEntry = {
      ...entry,
      id,
      createdAt: (existing as ModelRegistryEntry | null)?.createdAt ?? now,
      updatedAt: now,
    } as ModelRegistryEntry;

    await db.modelRegistryEntry.upsert({
      where: { id },
      create: final as never,
      update: final as never,
    }).catch((e: unknown) => {
      log.warn('model_upsert_failed', { id, error: e instanceof Error ? e.message : '' });
    });

    log.info('model_registered', { id, name: entry.name, type: entry.type });
    return final;
  }

  /**
   * Marque un modèle comme déprécié.
   */
  async deprecate(id: string): Promise<void> {
    await db.modelRegistryEntry.update({
      where: { id },
      data: { status: 'deprecated', updatedAt: new Date() } as never,
    }).catch(() => undefined);
    log.info('model_deprecated', { id });
  }

  /**
   * Met à jour les stats d'usage d'un modèle (appelée après chaque invocation).
   */
  async updateUsageStats(id: string, latencyMs: number, success: boolean): Promise<void> {
    const existing = await this.get(id).catch(() => null);
    if (!existing) return;

    const stats = existing.usageStats ?? {
      totalInvocations: 0,
    };
    const newTotal = (stats.totalInvocations ?? 0) + 1;
    const newAvg = stats.averageLatencyMs
      ? Math.round((stats.averageLatencyMs * (newTotal - 1) + latencyMs) / newTotal)
      : latencyMs;
    const prevSuccess = stats.successRate ?? 1;
    const newSuccessRate = (prevSuccess * (newTotal - 1) + (success ? 1 : 0)) / newTotal;

    await db.modelRegistryEntry.update({
      where: { id },
      data: {
        usageStats: {
          totalInvocations: newTotal,
          lastInvokedAt: new Date().toISOString(),
          averageLatencyMs: newAvg,
          successRate: newSuccessRate,
        },
        updatedAt: new Date(),
      } as never,
    }).catch(() => undefined);
  }

  /**
   * Stats d'usage du catalogue (dashboard admin).
   */
  async getCatalogStats(): Promise<{
    total: number;
    byType: Record<string, number>;
    byProvider: Record<string, number>;
    freeCount: number;
    commercialCount: number;
  }> {
    const all = await this.list({ limit: 1000 });
    const byType: Record<string, number> = {};
    const byProvider: Record<string, number> = {};
    let freeCount = 0;
    let commercialCount = 0;

    for (const m of all) {
      byType[m.type] = (byType[m.type] ?? 0) + 1;
      byProvider[m.provider] = (byProvider[m.provider] ?? 0) + 1;
      if (m.pricing?.isFree) freeCount++;
      if (m.license === 'commercial' || m.license === 'proprietary') commercialCount++;
    }

    return {
      total: all.length,
      byType,
      byProvider,
      freeCount,
      commercialCount,
    };
  }
}

export const modelRegistry = new ModelRegistryService();
export default modelRegistry;
