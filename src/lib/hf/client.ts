import { logger } from "@/lib/observability/logger"

/**
 * Client HTTP Hugging Face — couche officielle minimale utilisée par GEN3IA.
 *
 * Endpoints RÉELS et documentés (aucun inventé) :
 *  - Hub API            : https://huggingface.co/api/... (modèles, datasets, fichiers)
 *  - Inference Providers: https://router.huggingface.co/v1/... (OpenAI-compatible)
 *  - Inference Endpoints: https://api.endpoints.huggingface.cloud/v2/... (endpoints dédiés)
 *  - Jobs               : https://huggingface.co/api/jobs/... (jobs longs HF)
 *  - Storage (Buckets)  : repos du Hub (datasets repos dédiés) via
 *    https://huggingface.co/api/datasets/{repo}/upload + /resolve/{revision}/{path}
 *
 * Authentification : header Authorization: Bearer <HF_TOKEN> (jeton
 * fine-grained — jamais exposé au frontend, voir Phase 23).
 */

const HUB = "https://huggingface.co"
const ROUTER = "https://router.huggingface.co"
const ENDPOINTS = "https://api.endpoints.huggingface.cloud"

export function hfToken(): string | undefined {
  return (
    process.env.HF_TOKEN ??
    process.env.HUGGINGFACE_API_KEY ??
    process.env.HF_API_KEY
  )?.trim() || undefined
}

export function hfOrg(): string | undefined {
  const org = process.env.HF_ORG_ID?.trim()
  return org || undefined
}

export function isHfConfigured(): boolean {
  return Boolean(hfToken())
}

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const token = hfToken()
  if (!token) throw new Error("HF_TOKEN absent — Hugging Face non configuré.")
  return { Authorization: `Bearer ${token}`, ...extra }
}

export class HfApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(`HF API ${status}: ${message.slice(0, 300)}`)
    this.status = status
    this.name = "HfApiError"
  }
}

async function hfFetch<T>(
  url: string,
  init: RequestInit = {},
  timeoutMs = 20_000
): Promise<T> {
  const res = await fetch(url, {
    ...init,
    signal: init.signal ?? AbortSignal.timeout(timeoutMs),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new HfApiError(res.status, text || res.statusText)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

// ─────────────────────────────────────────────────────────────
// 1. HF Hub — modèles & datasets (inventaire)
// ─────────────────────────────────────────────────────────────

export interface HubModelCard {
  id: string
  pipeline_tag?: string
  library_name?: string
  tags?: string[]
  likes?: number
  downloads?: number
  gated?: false | "auto" | "manual"
  private?: boolean
}

/** Modèles text-generation triés par téléchargements (découverte de modèles). */
export async function hubListTextModels(limit = 50): Promise<HubModelCard[]> {
  const params = new URLSearchParams({
    pipeline_tag: "text-generation",
    sort: "downloads",
    direction: "-1",
    limit: String(Math.min(limit, 1000)),
    full: "false",
  })
  const token = hfToken()
  const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {}
  return hfFetch<HubModelCard[]>(`${HUB}/api/models?${params}`, { headers }, 15_000)
}

/** Modèles feature-extraction (embeddings). */
export async function hubListEmbeddingModels(limit = 30): Promise<HubModelCard[]> {
  const params = new URLSearchParams({
    pipeline_tag: "feature-extraction",
    sort: "downloads",
    direction: "-1",
    limit: String(Math.min(limit, 1000)),
  })
  const token = hfToken()
  const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {}
  return hfFetch<HubModelCard[]>(`${HUB}/api/models?${params}`, { headers }, 15_000)
}

/** Carte complète d'un modèle du Hub (id « org/name »). */
export async function hubGetModel(modelId: string): Promise<HubModelCard & { config?: Record<string, unknown> }> {
  const token = hfToken()
  const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {}
  return hfFetch<HubModelCard & { config?: Record<string, unknown> }>(
    `${HUB}/api/models/${modelId}`,
    { headers }
  )
}

// ─────────────────────────────────────────────────────────────
// 2. Inference Providers (router OpenAI-compatible)
// ─────────────────────────────────────────────────────────────

export interface RouterChatResponse {
  choices: Array<{ message: { role: string; content: string } }>
  usage?: { prompt_tokens?: number; completion_tokens?: number }
}

/** Chat via HF Inference Providers (routeur). */
export async function routerChat(body: {
  model: string
  messages: Array<{ role: string; content: string }>
  temperature?: number
  max_tokens?: number
  response_format?: { type: string }
}): Promise<RouterChatResponse> {
  return hfFetch<RouterChatResponse>(`${ROUTER}/v1/chat/completions`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  }, 120_000)
}

/** Streaming SSE via HF Inference Providers. */
export async function* routerChatStream(body: {
  model: string
  messages: Array<{ role: string; content: string }>
  temperature?: number
  max_tokens?: number
}): AsyncGenerator<string> {
  const res = await fetch(`${ROUTER}/v1/chat/completions`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ ...body, stream: true }),
    signal: AbortSignal.timeout(120_000),
  })
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "")
    throw new HfApiError(res.status, text || "stream indisponible")
  }
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split("\n")
      buffer = lines.pop() ?? ""
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed.startsWith("data:")) continue
        const payload = trimmed.slice(5).trim()
        if (payload === "[DONE]") return
        try {
          const parsed = JSON.parse(payload) as {
            choices?: Array<{ delta?: { content?: string } }>
          }
          const delta = parsed.choices?.[0]?.delta?.content
          if (delta) yield delta
        } catch {
          /* fragment SSE incomplet — ignoré */
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}

/** Embeddings via HF Inference Providers (feature-extraction). */
export async function routerEmbed(body: {
  model: string
  input: string[]
}): Promise<{ data: Array<{ embedding: number[] }> }> {
  return hfFetch<{ data: Array<{ embedding: number[] }> }>(`${ROUTER}/v1/embeddings`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  }, 30_000)
}

// ─────────────────────────────────────────────────────────────
// 3. Inference Endpoints (endpoints dédiés managés)
// ─────────────────────────────────────────────────────────────

export interface HfEndpoint {
  _id: string
  name: string
  model: { repository: string; revision?: string; framework?: string }
  status: { ready: boolean; state: string; url?: string; message?: string }
  compute: {
    accelerator: string
    instanceType: string
    instanceSize: string
    scaling: { minReplica: number; maxReplica: number; currentReplica?: number }
    vendor?: string
    region?: string
  }
  type: string
  createdAt?: number
}

/** Liste les endpoints dédiés du compte/org. */
export async function endpointsList(): Promise<HfEndpoint[]> {
  return hfFetch<HfEndpoint[]>(`${ENDPOINTS}/v2/endpoint`, {
    headers: authHeaders(),
  }, 15_000)
}

/** Crée un endpoint dédié (déploiement payant — contrôle explicite admin). */
export async function endpointCreate(payload: {
  name: string
  repository: string
  revision?: string
  framework: string
  accelerator: "cpu" | "gpu"
  instanceType: string
  instanceSize: string
  scaling: { minReplica: number; maxReplica: number }
  type?: "public" | "protected" | "private"
}): Promise<HfEndpoint> {
  return hfFetch<HfEndpoint>(`${ENDPOINTS}/v2/endpoint`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      name: payload.name,
      type: payload.type ?? "protected",
      model: {
        repository: payload.repository,
        revision: payload.revision ?? "main",
        framework: payload.framework,
      },
      compute: {
        accelerator: payload.accelerator,
        instanceType: payload.instanceType,
        instanceSize: payload.instanceSize,
        scaling: payload.scaling,
      },
    }),
  }, 30_000)
}

/** État d'un endpoint dédié. */
export async function endpointGet(name: string): Promise<HfEndpoint> {
  return hfFetch<HfEndpoint>(`${ENDPOINTS}/v2/endpoint/${name}`, {
    headers: authHeaders(),
  }, 15_000)
}

/** Met à jour la scalabilité d'un endpoint (scale to zero → réveil). */
export async function endpointScale(
  name: string,
  scaling: { minReplica: number; maxReplica: number }
): Promise<HfEndpoint> {
  return hfFetch<HfEndpoint>(`${ENDPOINTS}/v2/endpoint/${name}/compute`, {
    method: "PATCH",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ scaling }),
  }, 15_000)
}

/** Supprime un endpoint dédié. */
export async function endpointDelete(name: string): Promise<void> {
  await hfFetch<unknown>(`${ENDPOINTS}/v2/endpoint/${name}`, {
    method: "DELETE",
    headers: authHeaders(),
  }, 15_000)
}

/** Inférence sur un endpoint dédié (chat — format serveur vLLM/TGI). */
export async function endpointChat(
  endpointUrl: string,
  body: {
    messages: Array<{ role: string; content: string }>
    max_tokens?: number
    temperature?: number
  }
): Promise<RouterChatResponse> {
  const url = endpointUrl.replace(/\/$/, "") + "/v1/chat/completions"
  return hfFetch<RouterChatResponse>(url, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  }, 120_000)
}

// ─────────────────────────────────────────────────────────────
// 4. HF Jobs (tâches longues)
// ─────────────────────────────────────────────────────────────

export interface HfJob {
  id: string
  status: string
  kind?: string
  createdAt?: string
  updatedAt?: string
  endpoint?: string
  input?: { repo?: string; path?: string }
  output?: { repo?: string
    path?: string }
  error?: string
  meta?: Record<string, unknown>
}

/**
 * Jobs longs HF — API officielle https://huggingface.co/api/jobs.
 * NOTE (limite documentée) : le produit « Jobs » de HF couvre nativement
 * les exécutions liées aux datasets/training. Les kinds GEN3IA
 * (embeddings-batch, batch-inference…) qui n'ont pas d'équivalent natif
 * sont exécutés par le worker GEN3IA (BullMQ) en s'appuyant sur le même
 * contrat de statut/checkpoint — voir lib/hf/jobs.ts.
 */
export async function jobsList(kind?: string): Promise<HfJob[]> {
  const params = kind ? `?kind=${encodeURIComponent(kind)}` : ""
  return hfFetch<HfJob[]>(`${HUB}/api/jobs${params}`, {
    headers: authHeaders(),
  }, 15_000)
}

export async function jobGet(jobId: string): Promise<HfJob> {
  return hfFetch<HfJob>(`${HUB}/api/jobs/${jobId}`, {
    headers: authHeaders(),
  }, 15_000)
}

/** Soumet un job HF natif (training job sur repo de training). */
export async function jobSubmit(payload: {
  kind: string
  input?: { repo: string; path?: string }
  config?: Record<string, unknown>
}): Promise<HfJob> {
  return hfFetch<HfJob>(`${HUB}/api/jobs`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(payload),
  }, 30_000)
}

export async function jobCancel(jobId: string): Promise<void> {
  await hfFetch<unknown>(`${HUB}/api/jobs/${jobId}/cancel`, {
    method: "POST",
    headers: authHeaders(),
  }, 15_000)
}

// ─────────────────────────────────────────────────────────────
// 5. Storage Buckets (repos Hub dédiés par bucket logique)
// ─────────────────────────────────────────────────────────────

export interface RepoInfo {
  id: string
  private: boolean
  likes?: number
  tags?: string[]
}

/** Vérifie/crée le repo dataset servant de bucket (id: org/name ou user/name). */
export async function ensureBucketRepo(repoId: string): Promise<RepoInfo> {
  const headers = authHeaders({ "Content-Type": "application/json" })
  try {
    return await hfFetch<RepoInfo>(`${HUB}/api/datasets/${repoId}`, { headers }, 10_000)
  } catch (err) {
    if (err instanceof HfApiError && err.status === 404) {
      return hfFetch<RepoInfo>(`${HUB}/api/repos/create`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          type: "dataset",
          name: repoId.split("/").pop(),
          organization: hfOrg() ?? undefined,
          private: true,
        }),
      }, 15_000)
    }
    throw err
  }
}

/** Upload d'un fichier octets dans un repo bucket (API upload officielle). */
export async function bucketUpload(
  repoId: string,
  path: string,
  bytes: ArrayBuffer | Uint8Array,
  contentType?: string
): Promise<{ ok: boolean; oid?: string; size?: number }> {
  const token = hfToken()
  if (!token) throw new Error("HF_TOKEN absent.")
  const url = `${HUB}/api/datasets/${repoId}/upload/main/${path
    .split("/")
    .map((p) => encodeURIComponent(p))
    .join("/")}`
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(contentType ? { "Content-Type": contentType } : {}),
    },
    body: bytes instanceof Uint8Array ? new Blob([bytes as unknown as BlobPart]) : new Blob([new Uint8Array(bytes)]),
    signal: AbortSignal.timeout(300_000),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new HfApiError(res.status, text || "upload échoué")
  }
  return (await res.json().catch(() => ({ ok: true }))) as { ok: boolean; oid?: string; size?: number }
}

/** Téléchargement d'un fichier bucket (octets bruts). */
export async function bucketDownload(repoId: string, path: string): Promise<Uint8Array> {
  const token = hfToken()
  const res = await fetch(`${HUB}/datasets/${repoId}/resolve/main/${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    signal: AbortSignal.timeout(300_000),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new HfApiError(res.status, text || "téléchargement échoué")
  }
  return new Uint8Array(await res.arrayBuffer())
}

/** Liste des fichiers d'un repo bucket (arborescence). */
export interface RepoTreeItem {
  type: "file" | "directory"
  path: string
  size?: number
  oid?: string
  lastCommit?: { date?: string }
}

export async function bucketList(repoId: string, folder = ""): Promise<RepoTreeItem[]> {
  const token = hfToken()
  const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {}
  const clean = folder.replace(/^\/+|\/+$/g, "")
  const url = `${HUB}/api/datasets/${repoId}/tree/main${clean ? `/${clean}` : ""}`
  return hfFetch<RepoTreeItem[]>(url, { headers }, 15_000)
}

/** Suppression d'un fichier bucket (API commit officielle delete). */
export async function bucketDelete(repoId: string, path: string): Promise<void> {
  await hfFetch<unknown>(
    `${HUB}/api/datasets/${repoId}/commit/main`,
    {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ deletions: [{ path }] }),
    },
    30_000
  )
}

/** Point de résolution d'un objet (accès contrôlé par le token HF). */
export function bucketResolveUrl(repoId: string, path: string): string {
  return `${HUB}/datasets/${repoId}/resolve/main/${path}`
}

/** Qui suis-je sur le Hub (vérifie le token et l'org). */
export interface WhoAmI {
  name: string
  type: "user" | "org"
  orgs?: Array<{ name: string }>
}

export async function whoAmI(): Promise<WhoAmI> {
  return hfFetch<WhoAmI>(`${HUB}/api/whoami-v2`, { headers: authHeaders() }, 10_000)
}

/** Health check HF (route publique, sans génération payante). */
export async function hubHealth(): Promise<{ ok: boolean; latencyMs: number; detail?: string }> {
  const started = Date.now()
  try {
    await hfFetch<unknown>(`${HUB}/api/models?limit=1`, {}, 8000)
    return { ok: true, latencyMs: Date.now() - started }
  } catch (err) {
    return {
      ok: false,
      latencyMs: Date.now() - started,
      detail: err instanceof Error ? err.message : String(err),
    }
  }
}

export const hfLog = logger.child({ component: "hf-client" })
