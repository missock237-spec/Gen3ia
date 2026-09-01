import { db } from "@/lib/db"

/**
 * RAG — découpage de documents et récupération par pertinence TF-IDF.
 * Index réel construit sur les documents de l'utilisateur : le vecteur de
 * requête est confronté aux fréquences de termes de chaque morceau via
 * similarité cosinus pondérée par IDF (technique de recherche d'information
 * standard, sans dépendance externe).
 */

export interface Chunk {
  text: string
  index: number
}

export function chunkText(text: string, size = 900, overlap = 120): Chunk[] {
  const clean = text.replace(/\r/g, "").trim()
  if (clean.length <= size) return [{ text: clean, index: 0 }]
  const chunks: Chunk[] = []
  let cursor = 0
  let index = 0
  while (cursor < clean.length) {
    let end = Math.min(cursor + size, clean.length)
    if (end < clean.length) {
      // Coupe au dernier espace pour éviter les mots tronqués.
      const lastSpace = clean.lastIndexOf(" ", end)
      if (lastSpace > cursor + size * 0.5) end = lastSpace
    }
    chunks.push({ text: clean.slice(cursor, end).trim(), index })
    index++
    cursor = end - overlap
    if (cursor < 0) cursor = 0
    if (end >= clean.length) break
  }
  return chunks.filter((c) => c.text.length > 0)
}

const STOPWORDS = new Set([
  "le","la","les","un","une","des","du","de","et","ou","en","dans","pour","par","sur","au","aux",
  "que","qui","quoi","dont","est","sont","être","avoir","a","the","of","and","to","in","is","are",
  "for","on","with","as","by","an","be","this","that","it","d","l","s","qu","ne","pas","plus",
  "ce","cet","cette","ces","son","sa","ses","leur","leurs","nous","vous","je","tu","il","elle",
])

/** Tokenisation : minuscules, suppression accents basique, mots vides retirés. */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9àâçéèêëîïôûùüÿñæœa-z0-9\s-]/gi, " ")
    .split(/[\s\-]+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t))
}

export interface ScoredChunk {
  documentId: string
  title: string
  text: string
  score: number
}

/** Recherche RAG sur la base de connaissances de l'utilisateur. */
export async function searchKnowledge(
  userId: string,
  query: string,
  topK = 4
): Promise<ScoredChunk[]> {
  const docs = await db.document.findMany({
    where: { userId },
    select: { id: true, title: true, chunks: true },
  })
  if (docs.length === 0) return []

  // Corpus : tous les morceaux de tous les documents.
  interface IndexedChunk {
    documentId: string
    title: string
    text: string
    tf: Map<string, number>
    length: number
  }
  const corpus: IndexedChunk[] = []
  for (const doc of docs) {
    let chunks: Chunk[] = []
    try {
      chunks = doc.chunks ? (JSON.parse(doc.chunks) as Chunk[]) : []
    } catch {
      chunks = []
    }
    if (chunks.length === 0 && doc.title) {
      // Document non encore découpé : indexation à la volée.
      chunks = chunkText(doc.title)
    }
    for (const chunk of chunks) {
      const tokens = tokenize(chunk.text)
      const tf = new Map<string, number>()
      for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1)
      corpus.push({
        documentId: doc.id,
        title: doc.title,
        text: chunk.text,
        tf,
        length: tokens.length || 1,
      })
    }
  }
  if (corpus.length === 0) return []

  // IDF sur le corpus.
  const df = new Map<string, number>()
  for (const c of corpus) {
    for (const term of c.tf.keys()) df.set(term, (df.get(term) ?? 0) + 1)
  }
  const N = corpus.length
  const idf = (term: string) => Math.log(1 + N / (1 + (df.get(term) ?? 0)))

  // Vecteur requête + similarité cosinus pondérée IDF.
  const queryTokens = tokenize(query)
  if (queryTokens.length === 0) return []
  const queryTf = new Map<string, number>()
  for (const t of queryTokens) queryTf.set(t, (queryTf.get(t) ?? 0) + 1)

  const scored: ScoredChunk[] = corpus.map((c) => {
    let dot = 0
    let queryNorm = 0
    let docNorm = 0
    for (const [term, qf] of queryTf) {
      const w = qf * idf(term)
      queryNorm += w * w
      const dtf = c.tf.get(term)
      if (dtf) {
        const dw = (dtf / c.length) * idf(term)
        dot += w * dw
      }
    }
    for (const [term, dtf] of c.tf) {
      const dw = (dtf / c.length) * idf(term)
      docNorm += dw * dw
    }
    const score = queryNorm > 0 && docNorm > 0 ? dot / (Math.sqrt(queryNorm) * Math.sqrt(docNorm)) : 0
    return { documentId: c.documentId, title: c.title, text: c.text, score: Math.round(score * 1000) / 1000 }
  })

  return scored
    .filter((s) => s.score > 0.02)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
}
