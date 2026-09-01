/**
 * Utilitaires textuels du RAG (découpage, tokenisation).
 * Module sans dépendance — partagé par retriever.ts et vector-store.ts.
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
