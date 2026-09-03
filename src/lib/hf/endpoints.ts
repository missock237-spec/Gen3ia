import { db } from "@/lib/db"
import { logger } from "@/lib/observability/logger"
import { endpointsList, endpointCreate, endpointGet, endpointScale, endpointDelete, isHfConfigured } from "./client"

/**
 * Inference Endpoints Manager (v4.0 — Phase 4/12).
 *
 * Gère les endpoints DÉDIÉS Hugging Face (compute garanti) :
 *  - synchronisation de l'état réel → table InferenceEndpoint ;
 *  - création contrôlée (déploiement payant — usage explicite) ;
 *  - scale-to-zero / réveil (économies de compute) ;
 *  - résolution d'une URL d'inférence pour un modèle (utilisée par le
 *    HuggingFaceProvider quand le registre marque endpointType=DEDICATED).
 */

const log = logger.child({ component: "hf-endpoints" })

export interface EndpointView {
  id: string
  name: string
  modelId: string
  status: string
  hardware: string
  accelerator: string | null
  vendor: string | null
  region: string | null
  minReplicas: number
  maxReplicas: number
  currentReplicas: number
  url: string | null
  type: string
  lastSync: Date
  error: string | null
}

/** Synchronise l'état des endpoints HF réels dans la table. */
export async function syncEndpoints(): Promise<{ synced: number; created: number }> {
  if (!isHfConfigured()) return { synced: 0, created: 0 }
  const remote = await endpointsList().catch((err) => {
    log.warn("hf-endpoints: sync impossible", { error: String(err) })
    return []
  })
  let created = 0
  for (const ep of remote) {
    const state = ep.status?.state ?? "UNKNOWN"
    const existing = await db.inferenceEndpoint.findFirst({ where: { name: ep.name } })
    const data = {
      modelId: ep.model?.repository ?? "?",
      status: state.toUpperCase(),
      hardware: `${ep.compute?.instanceSize ?? ""}-${ep.compute?.instanceType ?? ""}`.replace(/^-/, "") || "cpu-basic",
      accelerator: ep.compute?.accelerator ?? null,
      vendor: ep.compute?.vendor ?? null,
      region: ep.compute?.region ?? null,
      minReplicas: ep.compute?.scaling?.minReplica ?? 0,
      maxReplicas: ep.compute?.scaling?.maxReplica ?? 1,
      currentReplicas: ep.compute?.scaling?.currentReplica ?? 0,
      url: ep.status?.url ?? null,
      type: ep.type ?? "protected",
      lastSync: new Date(),
    }
    if (existing) {
      await db.inferenceEndpoint.update({ where: { id: existing.id }, data })
    } else {
      await db.inferenceEndpoint.create({ data: { name: ep.name, ...data } })
      created++
    }
  }
  return { synced: remote.length, created }
}

/** Crée un endpoint dédié (opération payante — réservée admin). */
export async function createEndpoint(input: {
  name: string
  repository: string
  framework?: string
  accelerator?: "cpu" | "gpu"
  instanceType?: string
  instanceSize?: string
  minReplicas?: number
  maxReplicas?: number
}): Promise<EndpointView> {
  if (!isHfConfigured()) throw new Error("HF_TOKEN absent.")
  const remote = await endpointCreate({
    name: input.name,
    repository: input.repository,
    framework: input.framework ?? "pytorch",
    accelerator: input.accelerator ?? "cpu",
    instanceType: input.instanceType ?? "basic",
    instanceSize: input.instanceSize ?? "small",
    scaling: { minReplica: input.minReplicas ?? 0, maxReplica: input.maxReplicas ?? 1 },
    type: "protected",
  })
  const created = await db.inferenceEndpoint.create({
    data: {
      name: remote.name,
      modelId: remote.model?.repository ?? input.repository,
      status: (remote.status?.state ?? "PENDING").toUpperCase(),
      hardware: `${remote.compute?.instanceSize ?? ""}-${remote.compute?.instanceType ?? ""}`.replace(/^-/, "") || "cpu-basic",
      accelerator: remote.compute?.accelerator ?? null,
      vendor: remote.compute?.vendor ?? null,
      region: remote.compute?.region ?? null,
      minReplicas: remote.compute?.scaling?.minReplica ?? 0,
      maxReplicas: remote.compute?.scaling?.maxReplica ?? 1,
      currentReplicas: remote.compute?.scaling?.currentReplica ?? 0,
      url: remote.status?.url ?? null,
      type: remote.type ?? "protected",
      lastSync: new Date(),
    },
  })
  return toView(created)
}

/** Réveille un endpoint (minReplica ≥ 1) ou le met en veille (scale to zero). */
export async function setEndpointScale(name: string, minReplicas: number): Promise<EndpointView> {
  const row = await db.inferenceEndpoint.findUniqueOrThrow({ where: { name } })
  if (!isHfConfigured()) throw new Error("HF_TOKEN absent.")
  const remote = await endpointScale(name, { minReplica: minReplicas, maxReplica: row.maxReplicas })
  const updated = await db.inferenceEndpoint.update({
    where: { id: row.id },
    data: {
      minReplicas,
      currentReplicas: remote.compute?.scaling?.currentReplica ?? minReplicas,
      status: (remote.status?.state ?? row.status).toUpperCase(),
      url: remote.status?.url ?? row.url,
      lastSync: new Date(),
    },
  })
  return toView(updated)
}

/** État temps réel d'un endpoint (appel direct HF). */
export async function endpointStatus(name: string): Promise<{ state: string; url: string | null; ready: boolean }> {
  const ep = await endpointGet(name)
  return {
    state: ep.status?.state ?? "UNKNOWN",
    url: ep.status?.url ?? null,
    ready: Boolean(ep.status?.ready),
  }
}

/** Supprime un endpoint (arrête la facturation compute). */
export async function destroyEndpoint(name: string): Promise<{ deleted: boolean }> {
  if (!isHfConfigured()) throw new Error("HF_TOKEN absent.")
  await endpointDelete(name)
  const row = await db.inferenceEndpoint.findUnique({ where: { name } })
  if (row) {
    await db.inferenceEndpoint.update({ where: { id: row.id }, data: { status: "DELETED", url: null } })
  }
  return { deleted: true }
}

/** Liste (table admin). */
export async function listEndpoints(): Promise<EndpointView[]> {
  const rows = await db.inferenceEndpoint.findMany({ orderBy: { createdAt: "desc" }, take: 100 })
  return rows.map(toView)
}

/**
 * Résout l'URL d'inférence d'un modèle : endpoint DÉDIÉ si le registre en
 * référencé un (AIModel.endpointUrl), sinon null → routeur HF standard.
 */
export async function resolveModelEndpoint(provider: string, modelId: string): Promise<string | null> {
  if (provider !== "huggingface") return null
  const modelRow = await db.aIModel.findFirst({
    where: { provider, modelId },
    select: { endpointType: true, endpointUrl: true },
  })
  if (modelRow?.endpointType === "DEDICATED" && modelRow.endpointUrl) {
    return modelRow.endpointUrl
  }
  return null
}

function toView(row: {
  id: string; name: string; modelId: string; status: string; hardware: string
  accelerator: string | null; vendor: string | null; region: string | null
  minReplicas: number; maxReplicas: number; currentReplicas: number
  url: string | null; type: string; lastSync: Date; error: string | null
}): EndpointView {
  return {
    id: row.id, name: row.name, modelId: row.modelId, status: row.status,
    hardware: row.hardware, accelerator: row.accelerator, vendor: row.vendor,
    region: row.region, minReplicas: row.minReplicas, maxReplicas: row.maxReplicas,
    currentReplicas: row.currentReplicas, url: row.url, type: row.type,
    lastSync: row.lastSync, error: row.error,
  }
}
