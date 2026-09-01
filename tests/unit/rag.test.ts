import { describe, test, expect } from "bun:test"
import { chunkText, tokenize } from "@/lib/rag/text-utils"
import { localEmbedForTest } from "./test-utils"

/** RAG : découpage, tokenisation, embeddings locaux, similarité. */
describe("RAG — utilitaires textuels", () => {
  test("chunkText : texte court = un seul morceau", () => {
    const chunks = chunkText("Petit texte.")
    expect(chunks).toHaveLength(1)
    expect(chunks[0].index).toBe(0)
  })

  test("chunkText : découpage avec chevauchement", () => {
    const text = "mot ".repeat(400) // ~2000 caractères
    const chunks = chunkText(text, 900, 120)
    expect(chunks.length).toBeGreaterThan(1)
    for (let i = 1; i < chunks.length; i++) {
      expect(chunks[i].index).toBe(i)
    }
    // Aucun morceau vide.
    for (const c of chunks) expect(c.text.length).toBeGreaterThan(0)
  })

  test("chunkText : coupe aux espaces (pas de mots tronqués)", () => {
    const text = "abcdefghij ".repeat(200)
    const chunks = chunkText(text, 900, 120)
    for (const c of chunks) {
      expect(c.text.endsWith(" ") || c.text.endsWith("ij")).toBe(true)
    }
  })

  test("tokenize : minuscules, accents retirés, mots vides filtrés", () => {
    const tokens = tokenize("Le Chat Écoute la Sorcière")
    expect(tokens).toContain("chat")
    expect(tokens).toContain("ecoute")
    expect(tokens).toContain("sorciere")
    expect(tokens).not.toContain("le")
    expect(tokens).not.toContain("la")
  })
})

describe("RAG — embeddings locaux (hachage n-grammes)", () => {
  test("déterministe entre deux appels", () => {
    const a = localEmbedForTest("analyse financière du marché")
    const b = localEmbedForTest("analyse financière du marché")
    expect(a.vector).toEqual(b.vector)
    expect(a.model).toBe("local/hash-256")
    expect(a.dim).toBe(256)
  })

  test("norme L2 = 1 (cosinus = produit scalaire)", () => {
    const v = localEmbedForTest("texte quelconque")
    expect(v.norm).toBeCloseTo(1, 5)
  })

  test("textes similaires plus proches que textes disjoints", () => {
    const q = localEmbedForTest("stratégie marketing digitale")
    const near = localEmbedForTest("stratégie marketing digitale 2024")
    const far = localEmbedForTest("recette de gâteau au chocolat")
    const dot = (a: number[], b: number[]) => a.reduce((acc, x, i) => acc + x * b[i], 0)
    expect(dot(q.vector, near.vector)).toBeGreaterThan(dot(q.vector, far.vector))
  })

  test("texte vide : vecteur nul, norme 0", () => {
    const v = localEmbedForTest("")
    expect(v.norm).toBe(0)
  })
})
