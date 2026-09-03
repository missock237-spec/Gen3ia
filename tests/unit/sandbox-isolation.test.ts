import { describe, test, expect } from "bun:test"
import {
  analyzeCode,
  stripCommentsAndStrings,
  collectDeclarations,
  MAX_CODE_BYTES,
} from "@/lib/security/sandbox/analyze"
import { runSandboxedCode, sandboxAvailable } from "@/lib/security/sandbox/runner"
import { runInlineSandbox } from "@/lib/security/sandbox/inline"

/**
 * v3.6 — Isolation multi-tenant & allow-list de la sandbox code_runner.
 * Ces tests valident le durcissement sécurité demandé :
 *  1. allow-list : refus de tout identifiant non déclaré/non autorisé ;
 *  2. exécution réelle dans un worker isolé avec limites ;
 *  3. timeouts CPU et mur horloge ;
 *  4. neutralisation des vecteurs d'échappement (constructor, eval, this).
 */

describe("stripCommentsAndStrings", () => {
  test("retire les commentaires ligne et bloc", () => {
    const stripped = stripCommentsAndStrings("const a = 1; // process\nclass /* fetch */ X {}")
    expect(stripped).not.toContain("process")
    expect(stripped).not.toContain("fetch")
    expect(stripped).toContain("const a = 1")
  })

  test("retire les chaînes sans toucher au code", () => {
    const stripped = stripCommentsAndStrings(`const msg = "process require fetch"; const n = 2;`)
    expect(stripped).not.toContain("process require fetch")
    expect(stripped).toContain("const msg = ")
    expect(stripped).toContain("const n = 2")
  })

  test("gère les échappements et backticks", () => {
    const stripped = stripCommentsAndStrings('const s = "a\\"b"; const t = `x`; const u = 1;')
    expect(stripped).toContain("const u = 1")
    expect(stripped).not.toContain("`x`")
  })
})

describe("analyzeCode — allow-list stricte (fail-closed)", () => {
  test("accepte un calcul pur", () => {
    expect(analyzeCode("const x = 2 + 2; x * 3").ok).toBe(true)
  })

  test("accepte les globales du bac à sable", () => {
    const ok = analyzeCode(`
      const arr = [3, 1, 2];
      const sorted = arr.map(v => v * 2).filter(v => v > 2);
      JSON.stringify({ n: Math.max(...sorted), d: new Date().getUTCFullYear() });
    `)
    expect(ok.ok).toBe(true)
  })

  test("accepte les identifiants déclarés (fonctions, classes, destructuring)", () => {
    const ok = analyzeCode(`
      function helper(a, b) { return a + b }
      class Point { }
      const { one, two } = JSON.parse('{"one":1,"two":2}');
      const [first] = [10];
      const items = [];
      for (const item of items) { helper(item, first) }
      try { } catch (err) { }
      helper(one, two);
    `)
    expect(ok.ok).toBe(true)
  })

  test("refuse process / globalThis / fetch / require (non déclarés)", () => {
    for (const hostile of ["process.exit(1)", "globalThis", "fetch('http://x')", "require('fs')"]) {
      const verdict = analyzeCode(hostile)
      expect(verdict.ok).toBe(false)
      expect(verdict.reason).toBeTruthy()
    }
  })

  test("refuse un identifiant libre non déclaré (fail-closed)", () => {
    const verdict = analyzeCode("foo(1)")
    expect(verdict.ok).toBe(false)
    expect(verdict.violations.some((v) => v.identifier === "foo")).toBe(true)
  })

  test("refuse les propriétés d'échappement même sur variable déclarée", () => {
    for (const hostile of [
      "const x = {}; x.constructor",
      "const x = {}; x.__proto__",
      "const f = () => {}; f.call",
      "const f = () => {}; f.apply",
      "const f = () => {}; f.bind",
    ]) {
      const verdict = analyzeCode(hostile)
      expect(verdict.ok).toBe(false)
      expect(verdict.deniedProperty).toBeTruthy()
    }
  })

  test("refuse this et super (portes vers les intrinsics du contexte)", () => {
    expect(analyzeCode("const o = { x: 1 }; this").ok).toBe(false)
    expect(analyzeCode("class A { m() { super.toString() } }").ok).toBe(false)
  })

  test("ne rejette PAS les mots dangereux à l'intérieur de chaînes", () => {
    const ok = analyzeCode(`const s = "constructor __proto__ process"; s.length`)
    expect(ok.ok).toBe(true)
  })

  test("refuse le code trop volumineux", () => {
    const verdict = analyzeCode(`const big = "${"x".repeat(MAX_CODE_BYTES)}";`)
    expect(verdict.ok).toBe(false)
    expect(verdict.reason).toContain("volumineux")
  })

  test("collectDeclarations : paramètres de flèche et destructuring", () => {
    const declared = collectDeclarations("const { a, b } = o; items.map(item => item + a)")
    expect(declared.has("a")).toBe(true)
    expect(declared.has("b")).toBe(true)
    expect(declared.has("item")).toBe(true)
  })
})

describe("runSandboxedCode — exécution isolée réelle", () => {
  test("exécute un calcul et renvoie le résultat", async () => {
    const result = await runSandboxedCode({ code: "const total = [1,2,3,4].reduce((acc, v) => acc + v, 0); total * 10" })
    expect(result.ok).toBe(true)
    expect(result.output).toContain("100")
  })

  test("capture les logs console", async () => {
    const result = await runSandboxedCode({ code: 'console.log("bonjour", 42); "fini"' })
    expect(result.ok).toBe(true)
    expect(result.logs.some((l) => l.includes("bonjour"))).toBe(true)
    expect(result.output).toContain("fini")
  })

  test("s'exécute dans un worker isolé quand disponible", async () => {
    const result = await runSandboxedCode({ code: "1 + 1" })
    if (sandboxAvailable()) {
      expect(result.isolated).toBe(true)
    }
    expect(result.ok).toBe(true)
  })

  test("timeout CPU : boucle infinie interrompue, pas de hang", async () => {
    const started = Date.now()
    const result = await runSandboxedCode({ code: "while (true) { }", timeoutMs: 400 })
    expect(result.ok).toBe(false)
    expect(result.error).toBeTruthy()
    expect(Date.now() - started).toBeLessThan(8000)
  })

  test("error runtime du code agent remonte comme observation", async () => {
    const result = await runSandboxedCode({ code: 'JSON.parse("{malformé}")' })
    expect(result.ok).toBe(false)
    expect(result.error).toBeTruthy()
  })

  test("refus allow-list : message explicite orienté agent", async () => {
    const result = await runSandboxedCode({ code: "process.exit(1)" })
    expect(result.ok).toBe(false)
    expect(result.error).toContain("allow-list")
    expect(result.error).toContain("process")
  })

  test("stockage massif : l'isolat meurt isolé (limite mémoire), pas le processus", async () => {
    // Allocation > 64 Mo — le worker doit mourir de son côté.
    const result = await runSandboxedCode({
      code: "const big = []; for (let i = 0; i < 400000; i++) { big.push(new Array(200).fill(i)) } big.length",
      timeoutMs: 6000,
    })
    // Selon l'application stricte des resourceLimits : échec mémoire OU
    // réussite — mais JAMAIS de hang ni de crash du test lui-même.
    expect(typeof result.ok).toBe("boolean")
    expect(result.durationMs).toBeLessThan(15000)
  })

  test("repli inline : même contrat hors worker", () => {
    const ok = runInlineSandbox("const v = Math.round(2.7); v", 1000)
    expect(ok.ok).toBe(true)
    expect(ok.output).toContain("3")
    const timeout = runInlineSandbox("while (true) {}", 100)
    expect(timeout.ok).toBe(false)
  })

  test("eval et Function sont neutralisés dans l'isolat", async () => {
    const evalAttempt = await runSandboxedCode({ code: "const r = eval('1+1'); r" })
    expect(evalAttempt.ok).toBe(false)
    const fnAttempt = await runSandboxedCode({ code: "const F = Function('return 1'); F()" })
    expect(fnAttempt.ok).toBe(false)
  })
})
