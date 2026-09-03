import { Worker } from "node:worker_threads"
import { logger } from "@/lib/observability/logger"
import { bumpSandboxRun } from "@/lib/observability/metrics"
import { analyzeCode } from "./analyze"
import { runInlineSandbox } from "./inline"

/**
 * Isolation multi-tenant des exécutions de code (v3.6).
 *
 * Chaque exécution code_runner tourne dans un PROCESSUS LÉGER DÉDIÉ
 * (Worker Thread) avec ses propres limites de ressources :
 *  - maxOldGenerationSizeMb : 64 Mo de tas (au-delà : l'exécution meurt,
 *    PAS la plateforme) ;
 *  - maxYoungGenerationSizeMb / stackSizeMb / codeRangeSizeMb bornés ;
 *  - un timer CPU de 5 s (node:vm) + un mur horloge de 8 s (terminate) ;
 *  - génération de code désactivée dans l'isolat (eval/Function/WebAssembly) ;
 *  - enveloppe IIFE stricte → `this` neutralisé ;
 *  - allow-list stricte appliquée AVANT lancement (analyse en amont).
 *
 * Un agent « gourmand » ou malveillant ne peut donc plus impacter le
 * processus API ni les autres agents : son budget mémoire/CPU lui est
 * propre, et sa mort est isolée (l'erreur remonte comme observation).
 *
 * Le worker est instancié en mode `eval: true` (source autonome passée en
 * chaîne) : aucune dépendance au bundler — le code du worker n'est ni
 * transformé ni résolu au build, il est embarqué tel quel.
 */

const DEFAULT_VM_TIMEOUT_MS = 5_000
const MAX_VM_TIMEOUT_MS = 15_000
/** Mur horloge : si le VM ne répond pas (CPU bloqué hors timeout), kill. */
const HARD_KILL_GRACE_MS = 3_000
/** Nombre maximum d'exécutions sandbox simultanées par instance (backpressure). */
const MAX_CONCURRENT_WORKERS = 8

export const WORKER_RESOURCE_LIMITS = {
  maxYoungGenerationSizeMb: 16,
  maxOldGenerationSizeMb: 64,
  codeRangeSizeMb: 16,
  stackSizeMb: 2,
} as const

export interface SandboxedExecution {
  ok: boolean
  output: string
  logs: string[]
  error?: string
  durationMs: number
  /** true = exécuté dans un worker isolé (nominal) ; false = repli in-process. */
  isolated: boolean
}

/** Source autonome du worker — fonctionne en CJS (require) comme en ESM (import dynamique). */
const WORKER_SOURCE = String.raw`
"use strict";
(async () => {
  let wt, vm;
  try {
    wt = require("node:worker_threads");
    vm = require("node:vm");
  } catch (e) {
    wt = await import("node:worker_threads");
    vm = await import("node:vm");
  }
  const parentPort = wt.parentPort;
  const { code, timeoutMs } = wt.workerData;
  const logs = [];
  function serialize(v) {
    if (typeof v === "string") return v;
    try { return JSON.stringify(v); } catch (e) { return String(v); }
  }
  const sandboxConsole = {
    log: function () {
      if (logs.length < 50) logs.push(Array.prototype.map.call(arguments, serialize).join(" "));
    },
    error: function () {
      if (logs.length < 50) logs.push("[erreur] " + Array.prototype.map.call(arguments, serialize).join(" "));
    },
  };
  const sandbox = {
    console: sandboxConsole,
    Math: Math, JSON: JSON, Date: Date, Number: Number, String: String,
    Boolean: Boolean, Array: Array, Object: Object,
    Map: Map, Set: Set, RegExp: RegExp, Error: Error, TypeError: TypeError,
    RangeError: RangeError, BigInt: BigInt,
    isNaN: isNaN, parseInt: parseInt, parseFloat: parseFloat, isFinite: isFinite,
    encodeURIComponent: encodeURIComponent, decodeURIComponent: decodeURIComponent,
    encodeURI: encodeURI, decodeURI: decodeURI,
    process: undefined, fetch: undefined, require: undefined,
    globalThis: undefined, Buffer: undefined, WebSocket: undefined,
  };
  Object.freeze(sandboxConsole);
  const started = Date.now();
  try {
    const context = vm.createContext(sandbox, { codeGeneration: { strings: false, wasm: false } });
    // Script (et non IIFE) pour conserver la valeur de complétion du
    // programme (dernière expression) ; « this » est refusé en amont par
    // l'allow-list, la directive stricte neutralise les silences de sloppy mode.
    const script = "\"use strict\";\n" + code;
    const result = vm.runInContext(script, context, { timeout: timeoutMs, displayErrors: true });
    const parts = [];
    if (logs.length > 0) parts.push(logs.join("\n"));
    if (result !== undefined) parts.push("→ " + serialize(result));
    parentPort.postMessage({
      ok: true,
      output: parts.join("\n").slice(0, 4000) || "(aucune sortie)",
      logs: logs.slice(0, 50),
      durationMs: Date.now() - started,
    });
  } catch (err) {
    parentPort.postMessage({
      ok: false,
      output: logs.join("\n").slice(0, 2000),
      logs: logs.slice(0, 50),
      error: String((err && err.message) || err),
      durationMs: Date.now() - started,
    });
  }
})();
`

/** Compteur global d'exécutions simultanées (backpressure par instance). */
const g = globalThis as unknown as { gen3iaSandboxActive?: number; gen3iaSandboxTotal?: number; gen3iaSandboxIsolated?: number; gen3iaSandboxFallback?: number }

export function sandboxAvailable(): boolean {
  return typeof Worker === "function"
}

export function sandboxStats() {
  return {
    active: g.gen3iaSandboxActive ?? 0,
    totalRuns: g.gen3iaSandboxTotal ?? 0,
    isolatedRuns: g.gen3iaSandboxIsolated ?? 0,
    fallbackRuns: g.gen3iaSandboxFallback ?? 0,
    resourceLimits: WORKER_RESOURCE_LIMITS,
    maxConcurrent: MAX_CONCURRENT_WORKERS,
    defaultTimeoutMs: DEFAULT_VM_TIMEOUT_MS,
  }
}

/**
 * Exécute du code agent dans un isolat dédié.
 * Ordre : allow-list statique → worker isolé → (repli) VM in-process.
 */
export async function runSandboxedCode(params: {
  code: string
  timeoutMs?: number
  userId?: string
  taskId?: string
}): Promise<SandboxedExecution> {
  const started = Date.now()
  const timeoutMs = Math.min(Math.max(params.timeoutMs ?? DEFAULT_VM_TIMEOUT_MS, 100), MAX_VM_TIMEOUT_MS)
  g.gen3iaSandboxTotal = (g.gen3iaSandboxTotal ?? 0) + 1

  // Phase 1 — allow-list (fail-closed, dans le processus principal).
  const analysis = analyzeCode(params.code)
  if (!analysis.ok) {
    bumpSandboxRun({ ok: false, isolated: false })
    logger.warn("sandbox: code REFUSÉ par l'allow-list", {
      userId: params.userId,
      taskId: params.taskId,
      bytes: analysis.bytes,
      violations: analysis.violations.slice(0, 5).map((v) => v.identifier),
      deniedProperty: analysis.deniedProperty ?? null,
    })
    return {
      ok: false,
      output: "",
      logs: [],
      error: `Code refusé par la sandbox (allow-list) : ${analysis.reason}`,
      durationMs: Date.now() - started,
      isolated: false,
    }
  }

  // Phase 2 — worker isolé (chemin nominal).
  if (sandboxAvailable() && (g.gen3iaSandboxActive ?? 0) < MAX_CONCURRENT_WORKERS) {
    const result = await runInWorker(params.code, timeoutMs, started)
    if (result !== null) {
      g.gen3iaSandboxIsolated = (g.gen3iaSandboxIsolated ?? 0) + 1
      bumpSandboxRun({ ok: result.ok, isolated: true })
      return { ...result, isolated: true }
    }
    // runInWorker = null → échec d'infrastructure worker : repli.
  }

  // Phase 3 — repli in-process (runtime sans worker_threads ou saturation).
  g.gen3iaSandboxFallback = (g.gen3iaSandboxFallback ?? 0) + 1
  if (g.gen3iaSandboxActive ?? 0 >= MAX_CONCURRENT_WORKERS) {
    logger.warn("sandbox: workers saturés, repli inline (backpressure)", {
      userId: params.userId,
      active: g.gen3iaSandboxActive,
    })
  }
  const inline = runInlineSandbox(params.code, timeoutMs)
  bumpSandboxRun({ ok: inline.ok, isolated: false })
  logger.info("sandbox: exécution inline (repli)", {
    userId: params.userId,
    bytes: analysis.bytes,
    ok: inline.ok,
    durMs: inline.durationMs,
  })
  return { ...inline, isolated: false }
}

/** Exécute dans un worker dédié ; retourne null si l'infra worker échoue. */
function runInWorker(code: string, timeoutMs: number, startedAt: number): Promise<SandboxedExecution | null> {
  return new Promise((resolve) => {
    let settled = false
    let hardTimer: ReturnType<typeof setTimeout> | null = null
    const finish = (result: SandboxedExecution | null) => {
      if (settled) return
      settled = true
      g.gen3iaSandboxActive = Math.max(0, (g.gen3iaSandboxActive ?? 0) - 1)
      if (hardTimer) clearTimeout(hardTimer)
      resolve(result)
    }

    let worker: Worker
    try {
      worker = new Worker(WORKER_SOURCE, {
        eval: true,
        resourceLimits: { ...WORKER_RESOURCE_LIMITS },
        workerData: { code, timeoutMs },
      })
    } catch (err) {
      logger.warn("sandbox: worker indisponible, repli inline", {
        error: err instanceof Error ? err.message : String(err),
      })
      finish(null)
      return
    }

    g.gen3iaSandboxActive = (g.gen3iaSandboxActive ?? 0) + 1

    hardTimer = setTimeout(() => {
      worker
        .terminate()
        .catch(() => undefined)
        .finally(() =>
          finish({
            ok: false,
            output: "",
            logs: [],
            error: `Exécution interrompue (mur horloge dépassé : ${timeoutMs + HARD_KILL_GRACE_MS} ms).`,
            durationMs: Date.now() - startedAt,
            isolated: true,
          })
        )
    }, timeoutMs + HARD_KILL_GRACE_MS)

    worker.on("message", (msg: { ok: boolean; output: string; logs: string[]; error?: string; durationMs: number }) => {
      worker.terminate().catch(() => undefined)
      finish({
        ok: msg.ok,
        output: msg.output,
        logs: msg.logs ?? [],
        error: msg.error,
        durationMs: Date.now() - startedAt,
        isolated: true,
      })
    })
    worker.on("error", (err: Error) => {
      worker.terminate().catch(() => undefined)
      finish({
        ok: false,
        output: "",
        logs: [],
        error: `Worker sandbox : ${err.message}`,
        durationMs: Date.now() - startedAt,
        isolated: true,
      })
    })
    worker.on("exit", (exitCode: number) => {
      // OOM (resourceLimits) ou crash de l'isolat — mort ISOLÉE du worker.
      finish({
        ok: false,
        output: "",
        logs: [],
        error:
          exitCode === 0
            ? `Worker sandbox terminé sans réponse.`
            : `Worker sandbox terminé prématurément (code ${exitCode} — probablement limite mémoire ${WORKER_RESOURCE_LIMITS.maxOldGenerationSizeMb} Mo atteinte).`,
        durationMs: Date.now() - startedAt,
        isolated: true,
      })
    })
  })
}
