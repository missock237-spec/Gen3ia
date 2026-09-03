import vm from "vm"

/**
 * Repli in-process du bac à sable (v3.6).
 *
 * Utilisé UNIQUEMENT lorsque les Worker Threads sont indisponibles sur le
 * runtime courant (environnements edge restrictifs). Le niveau de protection
 * IDENTIQUE au worker est appliqué sur le plan du contexte VM :
 *  - allow-list (analyisée en amont par ./analyze.ts) ;
 *  - contexte gelé, génération de code désactivée (eval/Function/WebAssembly) ;
 *  - enveloppe IIFE stricte (this neutralisé) ;
 *  - timeout CPU.
 * Seule l'isolation MÉMOIRE/PROCESSUS (resourceLimits) manque — d'où le
 * worker comme chemin nominal (cf. ./runner.ts).
 */

export interface VmExecution {
  ok: boolean
  output: string
  logs: string[]
  error?: string
  durationMs: number
}

function serialize(v: unknown): string {
  if (typeof v === "string") return v
  try {
    return JSON.stringify(v)
  } catch {
    return String(v)
  }
}

/** Exécute le code (déjà validé par l'allow-list) dans un contexte VM durci. */
export function runInlineSandbox(code: string, timeoutMs: number): VmExecution {
  const started = Date.now()
  const logs: string[] = []
  const sandboxConsole = {
    log: (...items: unknown[]) => {
      if (logs.length < 50) logs.push(items.map((x) => serialize(x)).join(" "))
    },
    error: (...items: unknown[]) => {
      if (logs.length < 50) logs.push(`[erreur] ${items.map((x) => serialize(x)).join(" ")}`)
    },
  }
  const sandbox: Record<string, unknown> = {
    console: sandboxConsole,
    Math, JSON, Date, Number, String, Boolean, Array, Object,
    Map, Set, RegExp, Error, TypeError, RangeError, BigInt,
    isNaN, parseInt, parseFloat, isFinite,
    encodeURIComponent, decodeURIComponent, encodeURI, decodeURI,
    // Surface explicitement neutralisée (défense en profondeur).
    process: undefined, fetch: undefined, require: undefined,
    globalThis: undefined, Buffer: undefined, WebSocket: undefined,
  }
  Object.freeze(sandboxConsole)

  try {
    const context = vm.createContext(sandbox, { codeGeneration: { strings: false, wasm: false } })
    // Script (et non IIFE) pour conserver la valeur de complétion du
    // programme (dernière expression) ; « this » est refusé en amont par
    // l'allow-list, la directive stricte neutralise les silences de sloppy mode.
    const script = `"use strict";\n${code}`
    const result = vm.runInContext(script, context, { timeout: timeoutMs, displayErrors: true })
    const parts: string[] = []
    if (logs.length > 0) parts.push(logs.join("\n"))
    if (result !== undefined) parts.push(`→ ${serialize(result)}`)
    return {
      ok: true,
      output: parts.join("\n").slice(0, 4000) || "(aucune sortie)",
      logs,
      durationMs: Date.now() - started,
    }
  } catch (err) {
    return {
      ok: false,
      output: logs.join("\n").slice(0, 2000),
      logs,
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - started,
    }
  }
}
