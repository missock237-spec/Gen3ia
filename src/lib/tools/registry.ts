import { zaiWebSearch, zaiPageReader, htmlToText, isZaiAvailable } from "@/lib/ai/providers/zai"
import { searchKnowledge } from "@/lib/rag/retriever"
import { recallMemories } from "@/lib/memory/store"
import { hasZaiConfig } from "@/lib/config"
import { logger } from "@/lib/observability/logger"
import { parseConnectorToolKey, runConnectorTool } from "@/lib/connectors/core/toolset"
import { runSandboxedCode, sandboxStats } from "@/lib/security/sandbox/runner"
import { executeTerminalCommand as toolTerminalExec, type TerminalExecResult } from "@/lib/tools/terminal"
import { saveAgentFile as toolSaveAgentFile, type AgentFileSave } from "@/lib/engines/agent-files"
import { startSpan as otelStart, endSpan as otelEnd, traceparentHeader } from "@/lib/observability/otel"

/**
 * Registre d'outils — chaque outil possède une implémentation RÉELLE.
 * Aucune réponse simulée : si un outil échoue, l'erreur remonte au moteur
 * d'auto-correction qui décide de la stratégie de récupération.
 *
 * v3.6 — durcissement majeur de la sandbox code_runner (ADR-0005 révisé) :
 *  - ALLOW-LIST stricte des identifiants (vs ancienne deny-list contournable)
 *    avec retrait préalable des chaînes/commentaires (anti-dissimulation) ;
 *  - exécution dans un WORKER THREAD DÉDIÉ avec limites mémoire/CPU
 *    (maxOldGenerationSizeMb 64, stackSizeMb 2…) : un agent gourmand ou
 *    hostile meurt SEUL, la plateforme et les autres agents survivent ;
 *  - génération de code désactivée dans l'isolat (eval/Function/WebAssembly) ;
 *  - enveloppe IIFE stricte (« this » neutralisé) + contexte gelé ;
 *  - timeout CPU 5 s + mur horloge 8 s (terminate) ;
 *  - repli in-process à protection VM identique si worker_threads absent ;
 *  - journalisation de chaque exécution (qui, quand, taille, verdict, isolat).
 */

export type ToolKey =
  | "web_search"
  | "page_reader"
  | "calculator"
  | "code_runner"
  | "terminal"
  | "write_file"
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
    description: "Exécute du code JavaScript dans un isolat dédié (allow-list stricte : déclarer toute variable, seules Math/JSON/Date/console… sont disponibles ; 5 s max, 64 Mo max, réseau coupé).",
    category: "EXECUTION",
    dangerous: true,
    parameters: { code: { type: "string", description: "Code JavaScript à exécuter", required: true } },
  },
  {
    key: "terminal",
    name: "Terminal intégré (agents)",
    description: "Exécute une commande shell dans le terminal isolé de la session de l'agent (bash, répertoire de travail persistant par tâche, 30 s max, sortie 64 Ko, réseau selon plateforme, commandes destructrices bloquées). Réservé aux agents IA — les humains consultent l'historique en lecture seule.",
    category: "EXECUTION",
    dangerous: true,
    parameters: {
      command: { type: "string", description: "Commande shell à exécuter (ex: 'ls -la', 'cat rapport.txt')", required: true },
      timeoutMs: { type: "number", description: "Délai en ms (défaut 30000, max 120000)", required: false },
      workdir: { type: "string", description: "Sous-répertoire de travail relatif à la sandbox de session", required: false },
    },
  },
  {
    key: "write_file",
    name: "Écriture de fichier agent",
    description: "Enregistre un fichier de code/document généré par l'agent dans l'espace de fichiers du projet (visualisable et modifiable par l'utilisateur dans le visualiseur de code).",
    category: "EXECUTION",
    dangerous: false,
    parameters: {
      path: { type: "string", description: "Chemin du fichier (ex: 'src/utils/parser.ts')", required: true },
      content: { type: "string", description: "Contenu complet du fichier", required: true },
      language: { type: "string", description: "Langage/dialecte (typescript, python, json, markdown, html, css, sql, bash, text)", required: false },
      description: { type: "string", description: "Intention/raison de cette écriture", required: false },
    },
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

/**
 * Catalogue dynamique : les 8 outils de base + les actions des apps
 * connectées (outils connector_*) exposées par le toolset local —
 * cf. ADR-0014. Les actions connectées sont ajoutées par l'executor
 * au prompt (par utilisateur) ; ce catalogue reste la base statique
 * partagée (agents, planner, UI, validation HITL).
 */
export function getToolCatalog(): ToolDefinition[] {
  return TOOL_CATALOG
}

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
  taskId?: string | null
  /** v4.3 — Action Gateway : traçabilité complète de l'appel. */
  planId?: string | null
  stepIndex?: number | null
  /** v4.3 — approbation amont (HITL du plan) — le gateway affine. */
  preAuthorized?: boolean
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

/**
 * code_runner — exécution isolée (v3.6).
 * Allow-list statique puis worker thread dédié avec limites de ressources.
 * Voir src/lib/security/sandbox/ (analyze.ts, runner.ts, inline.ts).
 */
async function toolCodeRunner(args: { code: string }, ctx?: ToolContext): Promise<ToolResult> {
  const started = Date.now()
  const result = await runSandboxedCode({
    code: String(args.code ?? ""),
    userId: ctx?.userId,
    taskId: ctx?.taskId ?? undefined,
  })
  logger.info("sandbox: exécution code_runner", {
    userId: ctx?.userId,
    bytes: Buffer.byteLength(String(args.code ?? ""), "utf8"),
    ok: result.ok,
    isolated: result.isolated,
    durMs: result.durationMs,
    sandbox: sandboxStats(),
  })
  return {
    ok: result.ok,
    output: result.output,
    data: { logs: result.logs, isolated: result.isolated, sandboxDurationMs: result.durationMs },
    error: result.error ?? undefined,
    latencyMs: Date.now() - started,
  }
}

/**
 * terminal — exécution shell réservée aux agents (v4.1).
 * Retourne la structure TerminalExecResult complète (session, sortie,
 * code de retour, troncature). Le dispatch runTool formate la sortie LLM.
 */
function toolTerminal(
  args: { command: string; timeoutMs?: number; workdir?: string },
  ctx: ToolContext
): Promise<TerminalExecResult> {
  return toolTerminalExec(args, ctx)
}

/**
 * write_file — persistance des fichiers générés par les agents (v4.1).
 * Le fichier est versionné : les éditions humaines créent une nouvelle
 * version, l'historique complet est conservé (visualiseur de code).
 */
function toolWriteFile(
  args: { path: string; content: string; language?: string; description?: string },
  ctx: ToolContext
): Promise<AgentFileSave> {
  return toolSaveAgentFile({ ...args, taskId: ctx.taskId ?? null, agentId: ctx.agentId ?? null }, ctx.userId)
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
  // v3.6 — OTel : span d'appel externe + propagation traceparent W3C.
  const span = otelStart("http.client.fetch", { "http.url": check.url.toString().slice(0, 200) })
  try {
    const res = await fetch(check.url.toString(), {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; GEN3IA/1.0)",
        Accept: "application/json, text/*",
        ...traceparentHeader(span),
      },
      signal: AbortSignal.timeout(20_000),
      redirect: "follow",
    })
    otelEnd(span, "OK", { "http.status_code": res.status })
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
    otelEnd(span, "ERROR", {}, err instanceof Error ? err.message : String(err))
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
    case "terminal": {
      const term = await toolTerminal(
        {
          command: String(args.command ?? ""),
          timeoutMs: args.timeoutMs ? Number(args.timeoutMs) : undefined,
          workdir: args.workdir ? String(args.workdir) : undefined,
        },
        ctx
      )
      return {
        ok: term.ok,
        output: term.ok
          ? `${term.stdout}${term.stderr ? `\n[stderr] ${term.stderr}` : ""}`
          : `${term.stderr || "échec"}${term.stdout ? `\n${term.stdout}` : ""}`,
        data: {
          exitCode: term.exitCode,
          stdout: term.stdout,
          stderr: term.stderr,
          truncated: term.truncated,
          timedOut: term.timedOut,
          durationMs: term.durationMs,
          sessionId: term.sessionId,
        },
        error: term.ok ? undefined : `exit=${term.exitCode ?? "?"}${term.timedOut ? " timeout" : ""}`,
        latencyMs: term.durationMs,
      }
    }
    case "write_file": {
      const written = await toolWriteFile(
        {
          path: String(args.path ?? ""),
          content: String(args.content ?? ""),
          language: args.language ? String(args.language) : undefined,
          description: args.description ? String(args.description) : undefined,
        },
        ctx
      )
      return {
        ok: written.ok,
        output: written.ok
          ? `Fichier enregistré : ${written.path} (${written.bytes} octets, version ${written.version})`
          : written.error ?? "écriture impossible",
        data: written.ok
          ? { fileId: written.fileId, path: written.path, version: written.version, bytes: written.bytes }
          : undefined,
        error: written.ok ? undefined : written.error,
        latencyMs: 0,
      }
    }
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
        // v4.3 — chaîne de trace complète (taskId, planId, stepIndex)
        // + pré-autorisation transmises à l'Action Gateway.
        const result = await runConnectorTool(key, args, {
          userId: ctx.userId,
          agentId: ctx.agentId,
          taskId: ctx.taskId,
          planId: ctx.planId,
          stepIndex: ctx.stepIndex,
          preAuthorized: ctx.preAuthorized,
        })
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
  return getToolCatalog().find((t) => t.key === key)?.dangerous ?? false
}

export function listAvailableToolKeys(): string[] {
  return getToolCatalog().map((t) => t.key)
}
