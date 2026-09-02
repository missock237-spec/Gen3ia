import vm from "vm"
import { zaiWebSearch, zaiPageReader, htmlToText, isZaiAvailable } from "@/lib/ai/providers/zai"
import { searchKnowledge } from "@/lib/rag/retriever"
import { recallMemories } from "@/lib/memory/store"
import { hasZaiConfig } from "@/lib/config"
import { logger } from "@/lib/observability/logger"
import { parseConnectorToolKey, runConnectorTool } from "@/lib/connectors/core/toolset"

/**
 * Registre d'outils — chaque outil possède une implémentation RÉELLE.
 * Aucune réponse simulée : si un outil échoue, l'erreur remonte au moteur
 * d'auto-correction qui décide de la stratégie de récupération.
 *
 * v3.1 — durcissement de la sandbox code_runner (audit sécurité) :
 *  - liste de refus STATIQUE des vecteurs d'échappement connus de node:vm
 *    (constructor, __proto__, process, require, import, eval, Function…) ;
 *  - contexte gelé (Object.freeze) ;
 *  - journalisation de chaque exécution (qui, quand, taille, verdict) ;
 *  - limitation inchangée : 5 s de CPU, 50 lignes de log, 4 Ko de sortie.
 *
 * ⚠ Limites documentées (ADR-0005) : node:vm n'est PAS une frontière de
 * sécurité dure (pas d'isolation mémoire/processus). Pour des charges
 * hostiles, l'exécution doit passer par le conteneur Docker autonome
 * (Dockerfile fourni) — décision explicite, pas un angle mort.
 */

export type ToolKey =
  | "web_search"
  | "page_reader"
  | "calculator"
  | "code_runner"
  | "knowledge_search"
  | "memory_recall"
  | "http_fetch"
  | "datetime"

export interface ToolDefinition {
  key: ToolKey
  name: string
  description: string
  category: string
  dangerous: boolean
  parameters: Record<string, { type: string; description: string; required: boolean }>
}

export const TOOL_CATALOG: ToolDefinition[] = [
  {
    key: "web_search",
    name: "Recherche web",
    description: "Recherche sur le web et renvoie les meilleurs résultats (titre, URL, extrait).",
    category: "INFORMATION",
    dangerous: false,
    parameters: { query: { type: "string", description: "Requête de recherche", required: true }, num: { type: "number", description: "Nombre de résultats (défaut 5)", required: false } },
  },
  {
    key: "page_reader",
    name: "Lecteur de page",
    description: "Lit une page web et renvoie son contenu textuel nettoyé.",
    category: "INFORMATION",
    dangerous: false,
    parameters: { url: { type: "string", description: "URL absolue à lire", required: true } },
  },
  {
    key: "calculator",
    name: "Calculatrice",
    description: "Évalue une expression mathématique (opérateurs, fonctions Math).",
    category: "UTILITAIRE",
    dangerous: false,
    parameters: { expression: { type: "string", description: "Expression mathématique", required: true } },
  },
  {
    key: "code_runner",
    name: "Exécuteur de code",
    description: "Exécute du code JavaScript dans un bac à sable isolé (5 s max, réseau coupé).",
    category: "EXECUTION",
    dangerous: true,
    parameters: { code: { type: "string", description: "Code JavaScript à exécuter", required: true } },
  },
  {
    key: "knowledge_search",
    name: "Base de connaissances",
    description: "Recherche dans les documents importés par l'utilisateur (RAG).",
    category: "INFORMATION",
    dangerous: false,
    parameters: { query: { type: "string", description: "Question/requête", required: true } },
  },
  {
    key: "memory_recall",
    name: "Rappel mémoire",
    description: "Rappelle les leçons et préférences mémorisées de l'utilisateur.",
    category: "MEMOIRE",
    dangerous: false,
    parameters: { query: { type: "string", description: "Sujet à rappeler", required: false } },
  },
  {
    key: "http_fetch",
    name: "Requête HTTP",
    description: "Effectue une requête HTTP GET sortante vers une API publique (SSRF bloqué).",
    category: "EXECUTION",
    dangerous: true,
    parameters: { url: { type: "string", description: "URL publique à interroger", required: true } },
  },
  {
    key: "datetime",
    name: "Date et heure",
    description: "Renvoie la date et l'heure courantes (UTC et locale).",
    category: "UTILITAIRE",
    dangerous: false,
    parameters: {},
  },
]

export interface ToolResult {
  ok: boolean
  output: string
  data?: unknown
  latencyMs: number
  error?: string
}

export interface ToolContext {
  userId: string
  agentId?: string | null
}

// ---------- Implementations ----------

async function toolWebSearch(args: { query: string; num?: number }): Promise<ToolResult> {
  const started = Date.now()
  try {
    // 1. Moteur intégré (GLM) si disponible.
    if (hasZaiConfig()) {
      try {
        const results = await zaiWebSearch(args.query, Math.min(args.num ?? 5, 8))
        if (results.length > 0) {
          return {
            ok: true,
            data: results,
            latencyMs: Date.now() - started,
            output: results
              .map((r, i) => `${i + 1}. ${r.name}\n   ${r.url}\n   ${r.snippet}`)
              .join("\n"),
          }
        }
      } catch {
        // Repli ci-dessous.
      }
    }
    // 2. Repli public : DuckDuckGo HTML.
    const res = await fetch("https://html.duckduckgo.com/html/", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "Mozilla/5.0 (compatible; GEN3IA/1.0)",
      },
      body: new URLSearchParams({ q: args.query }).toString(),
      signal: AbortSignal.timeout(20_000),
    })
    if (!res.ok) throw new Error(`DuckDuckGo HTTP ${res.status}`)
    const html = await res.text()
    const results: { url: string; name: string; snippet: string }[] = []
    const linkRe = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g
    const snippetRe = /<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g
    const snippets: string[] = []
    let sm: RegExpExecArray | null
    while ((sm = snippetRe.exec(html)) && snippets.length < 8) {
      snippets.push(htmlToText(sm[1]).slice(0, 280))
    }
    let lm: RegExpExecArray | null
    let i = 0
    while ((lm = linkRe.exec(html)) && results.length < Math.min(args.num ?? 5, 8)) {
      let url = lm[1]
      const uddg = url.match(/uddg=([^&]+)/)
      if (uddg) url = decodeURIComponent(uddg[1])
      results.push({ url, name: htmlToText(lm[2]).slice(0, 120), snippet: snippets[i] ?? "" })
      i++
    }
    if (results.length === 0) {
      return { ok: false, output: "Aucun résultat trouvé.", latencyMs: Date.now() - started, error: "EMPTY" }
    }
    return {
      ok: true,
      data: results,
      latencyMs: Date.now() - started,
      output: results.map((r, idx) => `${idx + 1}. ${r.name}\n   ${r.url}\n   ${r.snippet}`).join("\n"),
    }
  } catch (err) {
    return {
      ok: false,
      output: "",
      error: err instanceof Error ? err.message : String(err),
      latencyMs: Date.now() - started,
    }
  }
}

async function toolPageReader(args: { url: string }): Promise<ToolResult> {
  const started = Date.now()
  try {
    if (await isZaiAvailable()) {
      try {
        const r = await zaiPageReader(args.url)
        return { ok: true, data: { title: r.title }, output: r.text.slice(0, 6000), latencyMs: Date.now() - started }
      } catch {
        // Repli ci-dessous.
      }
    }
    const res = await fetch(args.url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; GEN3IA/1.0)" },
      signal: AbortSignal.timeout(20_000),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const html = await res.text()
    return { ok: true, output: htmlToText(html).slice(0, 6000), latencyMs: Date.now() - started }
  } catch (err) {
    return {
      ok: false,
      output: "",
      error: err instanceof Error ? err.message : String(err),
      latencyMs: Date.now() - started,
    }
  }
}

function toolCalculator(args: { expression: string }): ToolResult {
  const started = Date.now()
  const expr = args.expression ?? ""
  // Validation stricte : chiffres, opérateurs, parenthèses, noms de fonctions Math autorisés.
  const sanitized = expr.replace(/\s+/g, "").replace(/\^/g, "**")
  if (!/^[0-9+\-*/().,%eEpiPIsqrtabfloorceilrndminmaxexplogsincostantanthypotpow0-9*]+$/i.test(sanitized)) {
    return { ok: false, output: "", error: "Expression contient des caractères interdits.", latencyMs: Date.now() - started }
  }
  if (/[a-zA-Z]/.test(sanitized.replace(/sqrt|abs|floor|ceil|round|min|max|exp|log|sin|cos|tan|hypot|pow|pi|e/gi, ""))) {
    return { ok: false, output: "", error: "Identifiants non autorisés dans l'expression.", latencyMs: Date.now() - started }
  }
  try {
    const allowed = {
      sqrt: Math.sqrt, abs: Math.abs, floor: Math.floor, ceil: Math.ceil,
      round: Math.round, min: Math.min, max: Math.max, exp: Math.exp,
      log: Math.log, log10: Math.log10, sin: Math.sin, cos: Math.cos,
      tan: Math.tan, pow: Math.pow, hypot: Math.hypot, PI: Math.PI, E: Math.E,
    }
    const fn = new Function(...Object.keys(allowed), `"use strict"; return (${expr.replace(/\^/g, "**")});`)
    const value = fn(...Object.values(allowed))
    if (typeof value !== "number" || !isFinite(value)) {
      return { ok: false, output: "", error: "Résultat non numérique.", latencyMs: Date.now() - started }
    }
    return { ok: true, output: String(value), data: { value }, latencyMs: Date.now() - started }
  } catch (err) {
    return {
      ok: false,
      output: "",
      error: `Évaluation impossible : ${err instanceof Error ? err.message : String(err)}`,
      latencyMs: Date.now() - started,
    }
  }
}

/** Vecteurs d'échappement connus de node:vm — refusés AVANT exécution. */
const SANDBOX_DENYLIST: Array<[RegExp, string]> = [
  [/\bconstructor\b/, "accès à « constructor » (vecteur d'échappement d'isolat)"],
  [/__proto__/, "accès à « __proto__ » (pollution de prototype)"],
  [/\bprocess\b/, "accès à « process » interdit"],
  [/\bglobalThis\b/, "accès à « globalThis » interdit"],
  [/\brequire\s*\(/, "require() interdit"],
  [/\bimport\s*\(/, "import() dynamique interdit"],
  [/\beval\s*\(/, "eval() interdit"],
  [/\bFunction\s*\(/, "constructeur Function interdit"],
  [/\bWebAssembly\b/, "WebAssembly interdit"],
  [/\bSharedArrayBuffer\b/, "SharedArrayBuffer interdit"],
  [/\bWeakRef\b/, "WeakRef interdit"],
  [/\bProxy\s*\(/, "constructeur Proxy interdit"],
  [/\bfetch\b/, "réseau coupé : fetch indisponible"],
  [/\bWebSocket\b/, "réseau coupé : WebSocket indisponible"],
]

function toolCodeRunner(args: { code: string }, ctx?: ToolContext): ToolResult {
  const started = Date.now()
  const code = args.code ?? ""

  // v3.1 — contrôle statique AVANT toute exécution (échec rapide, explicite).
  for (const [pattern, reason] of SANDBOX_DENYLIST) {
    if (pattern.test(code)) {
      logger.warn("sandbox: code refusé (liste de refus)", {
        userId: ctx?.userId,
        reason,
        bytes: code.length,
      })
      return {
        ok: false,
        output: "",
        error: `Code refusé par la sandbox : ${reason}. Réécris le code sans cette construction.`,
        latencyMs: Date.now() - started,
      }
    }
  }

  const logs: string[] = []
  const sandboxConsole = {
    log: (...items: unknown[]) => {
      if (logs.length < 50) logs.push(items.map((x) => serialize(x)).join(" "))
    },
    error: (...items: unknown[]) => {
      if (logs.length < 50) logs.push(`[erreur] ${items.map((x) => serialize(x)).join(" ")}`)
    },
  }
  function serialize(v: unknown): string {
    if (typeof v === "string") return v
    try {
      return JSON.stringify(v)
    } catch {
      return String(v)
    }
  }
  const sandbox = {
    console: sandboxConsole,
    Math, JSON, Date, Number, String, Boolean, Array, Object, isNaN, parseInt, parseFloat,
    BigInt: undefined, process: undefined, fetch: undefined, require: undefined, global: undefined,
  }
  // Gel du conteneur (pas des globales partagées du processus hôte).
  Object.freeze(sandbox)
  Object.freeze(sandboxConsole)
  try {
    const result = vm.runInNewContext(code, sandbox, { timeout: 5000, displayErrors: true })
    const parts: string[] = []
    if (logs.length > 0) parts.push(logs.join("\n"))
    if (result !== undefined) parts.push(`→ ${serialize(result)}`)
    logger.info("sandbox: exécution code_runner", {
      userId: ctx?.userId,
      bytes: code.length,
      ok: true,
      durMs: Date.now() - started,
    })
    return {
      ok: true,
      output: parts.join("\n").slice(0, 4000) || "(aucune sortie)",
      data: { logs },
      latencyMs: Date.now() - started,
    }
  } catch (err) {
    logger.warn("sandbox: échec d'exécution", {
      userId: ctx?.userId,
      bytes: code.length,
      error: err instanceof Error ? err.message : String(err),
    })
    return {
      ok: false,
      output: logs.join("\n").slice(0, 2000),
      error: err instanceof Error ? err.message : String(err),
      latencyMs: Date.now() - started,
    }
  }
}

async function toolKnowledgeSearch(
  args: { query: string },
  ctx: ToolContext
): Promise<ToolResult> {
  const started = Date.now()
  try {
    const results = await searchKnowledge(ctx.userId, args.query, 4)
    return {
      ok: true,
      data: results,
      output:
        results.length === 0
          ? "Aucun document pertinent dans la base de connaissances."
          : results
              .map(
                (r, i) =>
                  `[${i + 1}] ${r.title} (score ${r.score})\n${r.text.slice(0, 700)}`
              )
              .join("\n\n"),
      latencyMs: Date.now() - started,
    }
  } catch (err) {
    return {
      ok: false,
      output: "",
      error: err instanceof Error ? err.message : String(err),
      latencyMs: Date.now() - started,
    }
  }
}

async function toolMemoryRecall(args: { query?: string }, ctx: ToolContext): Promise<ToolResult> {
  const started = Date.now()
  try {
    const memories = await recallMemories(ctx.userId, { query: args.query, limit: 6 })
    return {
      ok: true,
      data: memories,
      output:
        memories.length === 0
          ? "Aucune mémoire pertinente."
          : memories.map((m) => `[${m.layer}] ${m.content}`).join("\n"),
      latencyMs: Date.now() - started,
    }
  } catch (err) {
    return {
      ok: false,
      output: "",
      error: err instanceof Error ? err.message : String(err),
      latencyMs: Date.now() - started,
    }
  }
}

/** Blocage SSRF : aucun accès aux hôtes privés/locaux. */
function assertPublicUrl(url: string): { ok: true; url: URL } | { ok: false; error: string } {
  try {
    const u = new URL(url)
    if (!["http:", "https:"].includes(u.protocol)) {
      return { ok: false, error: "Protocole non autorisé (http/https uniquement)." }
    }
    const host = u.hostname.toLowerCase()
    const blocked =
      host === "localhost" ||
      host === "0.0.0.0" ||
      host === "::1" ||
      host.endsWith(".local") ||
      host.endsWith(".internal") ||
      /^127\./.test(host) ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^169\.254\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host)
    if (blocked) return { ok: false, error: "Accès aux adresses privées interdit." }
    return { ok: true, url: u }
  } catch {
    return { ok: false, error: "URL invalide." }
  }
}

async function toolHttpFetch(args: { url: string }): Promise<ToolResult> {
  const started = Date.now()
  const check = assertPublicUrl(args.url)
  if (!check.ok) {
    return { ok: false, output: "", error: check.error, latencyMs: Date.now() - started }
  }
  try {
    const res = await fetch(check.url.toString(), {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; GEN3IA/1.0)", Accept: "application/json, text/*" },
      signal: AbortSignal.timeout(20_000),
      redirect: "follow",
    })
    const contentType = res.headers.get("content-type") ?? ""
    const body = (await res.text()).slice(0, 8000)
    return {
      ok: res.ok,
      output: `HTTP ${res.status} ${res.statusText}\nContent-Type: ${contentType}\n\n${body}`,
      data: { status: res.status },
      latencyMs: Date.now() - started,
      error: res.ok ? undefined : `HTTP ${res.status}`,
    }
  } catch (err) {
    return {
      ok: false,
      output: "",
      error: err instanceof Error ? err.message : String(err),
      latencyMs: Date.now() - started,
    }
  }
}

function toolDatetime(): ToolResult {
  const now = new Date()
  return {
    ok: true,
    output:
      `UTC : ${now.toISOString()}\n` +
      `Locale : ${now.toLocaleString("fr-FR")}\n` +
      `Timezone offset : ${-now.getTimezoneOffset() / 60} h`,
    data: { iso: now.toISOString() },
    latencyMs: 0,
  }
}

// ---------- Exécution dispatch ----------

export async function runTool(
  key: string,
   
  args: Record<string, any>,
  ctx: ToolContext
): Promise<ToolResult> {
  switch (key) {
    case "web_search":
      return toolWebSearch({ query: String(args.query ?? ""), num: args.num ? Number(args.num) : 5 })
    case "page_reader":
      return toolPageReader({ url: String(args.url ?? "") })
    case "calculator":
      return toolCalculator({ expression: String(args.expression ?? "") })
    case "code_runner":
      return toolCodeRunner({ code: String(args.code ?? "") }, ctx)
    case "knowledge_search":
      return toolKnowledgeSearch({ query: String(args.query ?? "") }, ctx)
    case "memory_recall":
      return toolMemoryRecall({ query: args.query ? String(args.query) : undefined }, ctx)
    case "http_fetch":
      return toolHttpFetch({ url: String(args.url ?? "") })
    case "datetime":
      return toolDatetime()
    default: {
      // Outils connector (actions d'app connectées : GitHub, Slack, Notion…).
      if (parseConnectorToolKey(key)) {
        const result = await runConnectorTool(key, args, { userId: ctx.userId, agentId: ctx.agentId })
        return {
          ok: result.ok,
          output: result.ok ? result.output : `${result.error ? `${result.error}\n` : ""}${result.output}`,
          data: result.data,
          latencyMs: result.latencyMs,
          error: result.error,
        }
      }
      return { ok: false, output: "", error: `Outil inconnu : ${key}`, latencyMs: 0 }
    }
  }
}

export function isToolDangerous(key: string): boolean {
  if (parseConnectorToolKey(key)) {
    // Actions connector : sensibles sauf lecture pure (GET).
    // La méthode exacte est résolue par le toolset ; par défaut prudent.
    return true
  }
  return TOOL_CATALOG.find((t) => t.key === key)?.dangerous ?? false
}

export function listAvailableToolKeys(): string[] {
  return TOOL_CATALOG.map((t) => t.key)
}
