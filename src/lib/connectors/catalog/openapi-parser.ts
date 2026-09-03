/**
 * Parseur OpenAPI → ActionSpec exécutables.
 *
 * Reprend le principe de construction des outils de Composio (les toolkits
 * sont générés de specs OpenAPI) en local : l'opérateur attache la spec
 * publique d'une app du catalogue, et chaque opération devient une action
 * réelle (méthode, chemin, paramètres typés) exécutable par le moteur
 * HTTP de GEN3IA (connectors/core/executor).
 *
 * Support : OpenAPI / Swagger 2.0 et 3.x, JSON uniquement (convertir le
 * YAML en amont si nécessaire). Paramètres query / path / header et corps
 * JSON (schéma simplifié en types ActionParam).
 */

import type { ActionSpec, ActionParam, ActionParamType } from "../core/types"

interface RawParameter {
  name: string
  in?: string
  required?: boolean
  description?: string
  type?: string
  schema?: { type?: string; $ref?: string; items?: { type?: string }; enum?: unknown[]; properties?: Record<string, unknown> }
  enum?: unknown[]
  items?: { type?: string }
  properties?: Record<string, unknown>
}

type RawOperation = {
  operationId?: string
  summary?: string
  description?: string
  parameters?: RawParameter[]
  requestBody?: {
    content?: Record<string, { schema?: { $ref?: string; type?: string; properties?: Record<string, unknown> } }>
  }
  deprecated?: boolean
}

type RawSpec = {
  openapi?: string
  swagger?: string
  info?: { title?: string; description?: string }
  servers?: Array<{ url: string; description?: string }>
  host?: string
  basePath?: string
  schemes?: string[]
  paths?: Record<string, Record<string, RawOperation>>
  components?: {
    schemas?: Record<string, unknown>
  }
  definitions?: Record<string, unknown>
}

function resolveSchemaRef(spec: RawSpec, ref: string | undefined): Record<string, unknown> {
  if (!ref) return {}
  const name = ref.split("/").pop() ?? ""
  const store = spec.components?.schemas ?? spec.definitions ?? {}
  return (store[name] as Record<string, unknown>) ?? {}
}

function toParamType(type: string | undefined, hasEnum: boolean, isArray: boolean): ActionParamType {
  if (hasEnum) return "enum"
  if (isArray) return "array"
  switch (type) {
    case "integer":
    case "int":
      return "integer"
    case "number":
    case "float":
    case "double":
      return "number"
    case "boolean":
    case "bool":
      return "boolean"
    case "array":
      return "array"
    case "object":
      return "object"
    default:
      return "string"
  }
}

function sanitizeSlug(v: string): string {
  return v
    .replace(/[^a-zA-Z0-9_]+/g, "_")
    .replace(/_{2,}/g, "_")
    .replace(/^_|_$/g, "")
    .toUpperCase()
}

function toEnumValues(values: unknown[] | undefined): string[] | undefined {
  if (!values?.length) return undefined
  return values.map((v) => String(v))
}

function parseParameters(spec: RawSpec, operation: RawOperation): {
  params: ActionParam[]
  bodyParams: ActionParam[]
} {
  const params: ActionParam[] = []
  const bodyParams: ActionParam[] = []

  for (const p of operation.parameters ?? []) {
    if (p.in !== "query" && p.in !== "path") continue // headers : gérés par le moteur
    const schemaType = p.schema?.type ?? p.type
    const enumValues = toEnumValues((p.enum as unknown[] | undefined) ?? (p.schema?.enum as unknown[] | undefined))
    const isArray = schemaType === "array" || !!p.items || !!p.schema?.items
    const param: ActionParam = {
      name: p.name,
      type: toParamType(schemaType, !!enumValues, isArray),
      required: !!p.required,
      description: p.description ?? "",
      enum: enumValues,
      in: p.in as "query" | "path",
    }
    params.push(param)
  }

  // Corps JSON : propriétés du schéma du requestBody (réf. résolue).
  const content = operation.requestBody?.content
  const jsonSchema = content?.["application/json"]?.schema
  if (jsonSchema) {
    const ref = (jsonSchema as { $ref?: string }).$ref
    const resolved = ref
      ? (resolveSchemaRef(spec, ref) as Record<string, unknown>)
      : ((jsonSchema as { properties?: Record<string, unknown> }).properties
        ? (jsonSchema as Record<string, unknown>)
        : (resolveSchemaRef(spec, ref) as Record<string, unknown>))
    const properties = (resolved.properties ?? {}) as Record<string, Record<string, unknown>>
    const requiredList = (resolved.required as string[] | undefined) ?? []
    const requiredSet = new Set(requiredList)
    for (const [name, def] of Object.entries(properties)) {
      const type = (def.type as string) ?? "string"
      const enumValues = toEnumValues(def.enum as unknown[] | undefined)
      bodyParams.push({
        name,
        type: toParamType(type, !!enumValues, type === "array"),
        required: requiredSet.has(name),
        description: (def.description as string) ?? "",
        enum: enumValues,
        in: "body",
      })
    }
  }

  return { params, bodyParams }
}

export interface ParsedOpenApi {
  baseUrl: string
  title: string
  description: string
  actions: ActionSpec[]
  warnings: string[]
}

/**
 * Convertit une spécification OpenAPI (objet JSON) en actions réelles.
 * Les actions sont prêtes pour l'exécution par connectors/core/executor :
 * injection bearer par défaut (le moteur gère OAuth2/rafraîchissement).
 */
export function parseOpenApi(spec: RawSpec, options?: { maxActions?: number }): ParsedOpenApi {
  const warnings: string[] = []
  const maxActions = Math.min(400, Math.max(1, options?.maxActions ?? 200))

  // Base URL : servers (v3) ou host+schemes+basePath (v2).
  let baseUrl = ""
  if (spec.servers?.length) {
    baseUrl = spec.servers[0].url.replace(/\/+$/, "")
  } else if (spec.host) {
    const scheme = spec.schemes?.includes("https") ? "https" : (spec.schemes?.[0] ?? "https")
    baseUrl = `${scheme}://${spec.host}${(spec.basePath ?? "").replace(/\/+$/, "")}`
  }
  if (!baseUrl) warnings.push("Aucune URL de serveur dans la spec — baseUrl à saisir manuellement.")

  const actions: ActionSpec[] = []
  const seenSlugs = new Set<string>()

  for (const [path, methods] of Object.entries(spec.paths ?? {})) {
    for (const [method, rawOp] of Object.entries(methods)) {
      if (!["get", "post", "put", "patch", "delete"].includes(method)) continue
      const operation = rawOp as RawOperation
      if (operation.deprecated) continue

      let slug = operation.operationId ? sanitizeSlug(operation.operationId) : sanitizeSlug(`${method}_${path}`)
      if (!slug) slug = `OP_${actions.length}`
      while (seenSlugs.has(slug)) slug = `${slug}_${actions.length}`
      seenSlugs.add(slug)

      const { params, bodyParams } = parseParameters(spec, operation)
      actions.push({
        slug,
        name: operation.summary ?? `${method.toUpperCase()} ${path}`,
        description: operation.description ?? operation.summary ?? `${method.toUpperCase()} ${path}`,
        method: method.toUpperCase() as ActionSpec["method"],
        path: path.replace(/^\//, ""),
        params: [...params, ...bodyParams],
        bodyContentType: "json",
        auth: { style: "bearer" },
      })

      if (actions.length >= maxActions) {
        warnings.push(`Limite de ${maxActions} actions atteinte (spec volumineuse tronquée).`)
        return { baseUrl, title: spec.info?.title ?? "", description: spec.info?.description ?? "", actions, warnings }
      }
    }
  }

  if (!actions.length) warnings.push("Aucune opération exécutable trouvée dans la spec.")

  return {
    baseUrl,
    title: spec.info?.title ?? "",
    description: spec.info?.description ?? "",
    actions,
    warnings,
  }
}

/** Valide qu'une chaîne est une spec OpenAPI JSON parsable. */
export function tryParseSpec(raw: string): { ok: true; spec: RawSpec } | { ok: false; error: string } {
  try {
    const parsed = JSON.parse(raw) as RawSpec
    if (!parsed.paths || typeof parsed.paths !== "object") {
      return { ok: false, error: "Spec invalide : section « paths » absente." }
    }
    if (!parsed.openapi && !parsed.swagger) {
      return { ok: false, error: "Spec invalide : ni « openapi » ni « swagger » déclaré." }
    }
    return { ok: true, spec: parsed }
  } catch (err) {
    return { ok: false, error: `JSON illisible : ${err instanceof Error ? err.message : String(err)}` }
  }
}
