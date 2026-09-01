import { getBreaker } from "@/lib/reliability/breaker"
import { logger } from "@/lib/observability/logger"

/**
 * Embeddings (amélioration « Remplacer TF-IDF par un Vecteur DB »).
 *
 * Deux fournisseurs réels, choisis automatiquement :
 *  - « openai » : API compatible OpenAI /v1/embeddings (text-embedding-3-small,
 *    dimension réduite 512) — sémantique vraie, activé si OPENAI_API_KEY
 *    (ou EMBEDDING_API_KEY) est présent ;
 *  - « local »  : hachage de n-grammes (unigrammes + bigrammes) en 256
 *    dimensions, L2-normalisé — déterministe, sans clé, sans réseau.
 *    Capturte l'overlap lexical fin (mieux que TF-IDF brut en raison des
 *    bigrammes) mais PAS la sémantique profonde : la recherche reste
 *    hybride (vecteur + TF-IDF) et le catalogue d'outils/documentations
 *    explique la graduation.
 *
 * Le fournisseur est protégé par un circuit breaker : en cas de panne,
 * repli automatique sur « local » pour ne jamais bloquer la recherche.
 */

export interface EmbeddingVector {
  vector: number[]
  model: string
  dim: number
  norm: number
}

export interface EmbeddingProviderInfo {
  provider: "openai" | "local"
  model: string
  dim: number
}

export function embeddingProvider(): EmbeddingProviderInfo {
  const forced = (process.env.EMBEDDINGS_PROVIDER ?? "auto").toLowerCase()
  const apiKey = process.env.EMBEDDING_API_KEY ?? process.env.OPENAI_API_KEY
  if ((forced === "openai" || (forced === "auto" && apiKey)) && apiKey) {
    return {
      provider: "openai",
      model: process.env.EMBEDDINGS_MODEL ?? "text-embedding-3-small",
      dim: Number(process.env.EMBEDDINGS_DIM ?? 512),
    }
  }
  return { provider: "local", model: "local/hash-256", dim: 256 }
}

// ---------- Fournisseur local : hachage de n-grammes ----------

const LOCAL_DIM = 256

function hashToken(token: string, seed: number): number {
  // FNV-1a varié par graine — stable entre les processus.
  let h = 2166136261 ^ seed
  for (let i = 0; i < token.length; i++) {
    h ^= token.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return Math.abs(h) % LOCAL_DIM
}

function normalizeL2(vec: number[]): { vector: number[]; norm: number } {
  let sum = 0
  for (const v of vec) sum += v * v
  const originalNorm = Math.sqrt(sum)
  if (originalNorm === 0) return { vector: vec, norm: 0 }
  // Le vecteur retourné est normalisé : sa norme (celle utilisée par le
  // cosinus) vaut 1. On retourne donc 1 — pas la norme d'origine.
  return { vector: vec.map((v) => v / originalNorm), norm: 1 }
}

/** Tokenisation légère partagée avec le retrieveur. */
function lightTokens(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/[\s\-]+/)
    .filter((t) => t.length > 1)
}

/** Embedding local (hachage de n-grammes) — exporté pour les tests et le repli. */
export function localEmbed(text: string): EmbeddingVector {
  const tokens = lightTokens(text).slice(0, 600)
  const vec = new Array<number>(LOCAL_DIM).fill(0)
  for (let i = 0; i < tokens.length; i++) {
    vec[hashToken(tokens[i], 1)] += 1 // unigrammes
    if (i + 1 < tokens.length) {
      vec[hashToken(`${tokens[i]}_${tokens[i + 1]}`, 2)] += 0.8 // bigrammes
    }
  }
  const { vector, norm } = normalizeL2(vec)
  return { vector, model: "local/hash-256", dim: LOCAL_DIM, norm }
}

// ---------- Fournisseur OpenAI-compatible ----------

interface OpenAIEmbeddingResponse {
  data: Array<{ embedding: number[] }>
  usage?: { prompt_tokens: number; total_tokens: number }
}

async function openAIEmbed(texts: string[], info: EmbeddingProviderInfo): Promise<number[][]> {
  const apiKey = process.env.EMBEDDING_API_KEY ?? process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error("Clé d'embedding absente.")
  const baseUrl = (process.env.EMBEDDINGS_BASE_URL ?? "https://api.openai.com/v1").replace(/\/$/, "")
  const res = await fetch(`${baseUrl}/embeddings`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: info.model, input: texts, dimensions: info.dim }),
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) {
    throw new Error(`Embeddings HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`)
  }
  const body = (await res.json()) as OpenAIEmbeddingResponse
  if (!body.data || body.data.length !== texts.length) {
    throw new Error("Réponse d'embedding incohérente.")
  }
  return body.data.map((d) => d.embedding)
}

// ---------- API publique ----------

/** Embedding d'un texte unique (avec repli local sur panne). */
export async function embedText(text: string): Promise<EmbeddingVector> {
  const info = embeddingProvider()
  if (info.provider === "local") return localEmbed(text)
  try {
    const vectors = await getBreaker("embeddings:openai").run(() => openAIEmbed([text], info))
    const { vector, norm } = normalizeL2(vectors[0])
    return { vector, model: info.model, dim: vector.length, norm }
  } catch (err) {
    logger.warn("embeddings: repli local après échec fournisseur", {
      error: err instanceof Error ? err.message : String(err),
    })
    return localEmbed(text)
  }
}

/** Embedding par lot (indexation de documents). */
export async function embedTexts(texts: string[]): Promise<EmbeddingVector[]> {
  if (texts.length === 0) return []
  const info = embeddingProvider()
  if (info.provider === "local") return texts.map((t) => localEmbed(t))
  const out: EmbeddingVector[] = []
  try {
    // Lots de 64 max (limite API usuelle).
    for (let i = 0; i < texts.length; i += 64) {
      const batch = texts.slice(i, i + 64)
      const vectors = await getBreaker("embeddings:openai").run(() => openAIEmbed(batch, info))
      for (const v of vectors) {
        const { vector, norm } = normalizeL2(v)
        out.push({ vector, model: info.model, dim: vector.length, norm })
      }
    }
    return out
  } catch (err) {
    logger.warn("embeddings: repli local par lot après échec", {
      error: err instanceof Error ? err.message : String(err),
    })
    return texts.map((t) => localEmbed(t))
  }
}

/** Similarité cosinus entre un vecteur requête et un vecteur stocké (norme précalculée). */
export function cosineSimilarity(
  queryVector: number[],
  queryNorm: number,
  storedVector: number[],
  storedNorm: number
): number {
  if (queryNorm === 0 || storedNorm === 0) return 0
  let dot = 0
  const len = Math.min(queryVector.length, storedVector.length)
  for (let i = 0; i < len; i++) dot += queryVector[i] * storedVector[i]
  return dot / (queryNorm * storedNorm)
}
