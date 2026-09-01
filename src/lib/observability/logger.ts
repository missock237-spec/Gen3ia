/**
 * Logger JSON structuré (amélioration « Logging Structuré et Métriques »).
 *
 * Chaque ligne est un objet JSON unique : { ts, level, msg, …champs },
 * filtrable par LOG_LEVEL (debug|info|warn|error), avec :
 *  - requestId / taskId / userId / engine propagés par child loggers ;
 *  - rédaction automatique des secrets (clés, tokens, authorization) ;
 *  - chronomètres intégrés (logger.timer) pour les durées de phase.
 *
 * Format prévu pour l'ingestion par un agrégateur (Vercel log drains,
 * Datadog, Loki…) et pour le futur dashboard d'observabilité.
 */

export type LogLevel = "debug" | "info" | "warn" | "error"

const LEVEL_WEIGHT: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 }

const REDACTION_PATTERNS: Array<[RegExp, string]> = [
  [/ghp_[A-Za-z0-9]{20,}/g, "ghp_[REDACTED]"],
  [/vcp_[A-Za-z0-9]{20,}/g, "vcp_[REDACTED]"],
  [/sk-[A-Za-z0-9-]{20,}/g, "sk-[REDACTED]"],
  [/Bearer\s+[A-Za-z0-9-._~+/]+=*/gi, "Bearer [REDACTED]"],
  [/(api[_-]?key|token|secret|password|authorization)\s*[:=]\s*["']?[^"',\s}]+/gi, "$1=[REDACTED]"],
]

function redact(value: string): string {
  let out = value
  for (const [pattern, replacement] of REDACTION_PATTERNS) {
    out = out.replace(pattern, replacement)
  }
  return out
}

function redactDeep(value: unknown, depth = 0): unknown {
  if (depth > 4 || value === null || value === undefined) return value
  if (typeof value === "string") return redact(value)
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redactDeep(v, depth + 1))
  if (typeof value === "object") {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (/key|token|secret|password|authorization/i.test(k)) out[k] = "[REDACTED]"
      else out[k] = redactDeep(v, depth + 1)
    }
    return out
  }
  return value
}

export interface LoggerFields {
  [key: string]: unknown
}

export interface Logger {
  debug(msg: string, fields?: LoggerFields): void
  info(msg: string, fields?: LoggerFields): void
  warn(msg: string, fields?: LoggerFields): void
  error(msg: string, fields?: LoggerFields): void
  child(fields: LoggerFields): Logger
  /** Chronomètre : log automatique avec durMs à la fermeture. */
  timer(label: string, fields?: LoggerFields): { end: (extra?: LoggerFields) => number }
}

function minLevel(): number {
  const raw = (process.env.LOG_LEVEL ?? (process.env.NODE_ENV === "production" ? "info" : "debug")).toLowerCase()
  return LEVEL_WEIGHT[(raw as LogLevel)] ?? LEVEL_WEIGHT.info
}

function emit(level: LogLevel, msg: string, base: LoggerFields, fields?: LoggerFields) {
  if (LEVEL_WEIGHT[level] < minLevel()) return
  const merged: Record<string, unknown> = { ...base, ...(redactDeep(fields ?? {}) as LoggerFields) }
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    msg: redact(String(msg)),
    ...Object.fromEntries(Object.entries(merged).filter(([, v]) => v !== undefined)),
  })
  if (level === "error") console.error(line)
  else if (level === "warn") console.warn(line)
  else console.log(line)
}

function makeLogger(base: LoggerFields): Logger {
  return {
    debug: (msg, fields) => emit("debug", msg, base, fields),
    info: (msg, fields) => emit("info", msg, base, fields),
    warn: (msg, fields) => emit("warn", msg, base, fields),
    error: (msg, fields) => emit("error", msg, base, fields),
    child: (fields) => makeLogger({ ...base, ...(redactDeep(fields) as LoggerFields) }),
    timer: (label, fields) => {
      const start = Date.now()
      return {
        end: (extra) => {
          const durMs = Date.now() - start
          emit("info", label, base, { ...fields, ...extra, durMs })
          return durMs
        },
      }
    },
  }
}

/** Logger racine — utilisez `.child({ requestId, userId, … })` par requête/tâche. */
export const logger: Logger = makeLogger({ service: "gen3ia" })

export function withRequestLogger(req: Request): Logger {
  const requestId = req.headers.get("x-request-id") ?? crypto.randomUUID().slice(0, 8)
  return logger.child({ requestId, method: req.method, path: new URL(req.url).pathname })
}
