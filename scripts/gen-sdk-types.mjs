/**
 * Générateur de types SDK (v3.6 — DX) :
 *  - lit prisma/schema.prisma (source de vérité unique) ;
 *  - produit sdks/typescript (package npm : client + types générés) ;
 *  - produit sdks/python (package pip : dataclasses + client typé) ;
 *  - émet un manifeste (sdks/manifest.json) pour audit/test.
 *
 * Usage : node scripts/gen-sdk-types.mjs   (après toute modification du schéma)
 * Les types couvrent les objets publics de l'API v1 (champs exposés
 * réellement par les routes /api/v1/*) — pas une déclaration aveugle.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")
const schema = readFileSync(join(ROOT, "prisma/schema.prisma"), "utf8")

// ---------- Parsing du schéma Prisma ----------

function parseModels(src) {
  const models = []
  // Retire les commentaires AVANT parsing : un « // JSON : { … } » contient
  // une accolade qui tronquerait le corps du modèle avec [^}]*.
  const clean = src
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, ""))
    .join("\n")
  const re = /^model\s+(\w+)\s+\{([^}]*)\}/gm
  let m
  while ((m = re.exec(clean))) {
    const name = m[1]
    const body = m[2]
    const fields = []
    for (let line of body.split("\n")) {
      line = line.trim()
      if (!line || line.startsWith("@@") || line.startsWith("//")) continue
      const fm = line.match(/^(\w+)\s+([\w\[\]?]+)(.*)$/)
      if (!fm) continue
      const [, fieldName, rawType, rest] = fm
      const optional = rawType.endsWith("?")
      const isArray = rawType.startsWith("[]")
      const baseType = rawType.replace(/[\[\]?]/g, "")
      fields.push({
        name: fieldName,
        type: baseType,
        optional,
        isArray,
        isId: /@id/.test(rest),
        isRelation: /@relation/.test(rest) || fieldsHaveRelations(name, fieldName, src),
        hasDefault: /@default/.test(rest),
      })
    }
    // Champs relation (listes typées `Task[]` etc.) : détectés séparément.
    for (let line of body.split("\n")) {
      const rm = line.trim().match(/^(\w+)\s+(\w+)\[\]\s*(.*)$/)
      if (rm) {
        if (!fields.find((f) => f.name === rm[1])) {
          fields.push({ name: rm[1], type: rm[2], optional: false, isArray: true, isId: false, isRelation: true, hasDefault: false })
        }
      }
    }
    models.push({ name, fields })
  }
  return models
}

/** Heuristique relation inverse : `user User @relation(...)`. */
function fieldsHaveRelations(modelName, fieldName, src) {
  const re = new RegExp(`^\\s*${fieldName}\\s+\\w+\\s+@relation`, "m")
  return re.test(src)
}

const models = parseModels(schema)

// Champs PUBLICS exposés par l'API v1 (mapping modèle → sous-ensemble).
// Les secrets (passwordHash, encryptedData, secret, apiKey hash) sont
// STRUCTURELLEMENT exclus : jamais générés dans les types publics.
const PUBLIC_FIELDS = {
  User: ["id", "email", "name", "role", "plan", "credits", "createdAt", "updatedAt", "avatarUrl"],
  Agent: ["id", "userId", "name", "slug", "description", "provider", "model", "temperature", "maxTokens", "status", "visibility", "category", "createdAt", "updatedAt"],
  Task: ["id", "userId", "agentId", "prompt", "status", "selectedPlanId", "costCredits", "tokensIn", "tokensOut", "attempts", "totalRetries", "error", "createdAt", "updatedAt", "startedAt", "completedAt"],
  TaskStep: ["id", "taskId", "phase", "stepIndex", "title", "status", "detail", "startedAt", "finishedAt", "createdAt"],
  Transaction: ["id", "userId", "type", "amount", "balanceAfter", "reason", "createdAt"],
  Document: ["id", "userId", "agentId", "title", "sourceType", "size", "createdAt"],
  Skill: ["id", "userId", "name", "description", "category", "visibility", "createdAt", "updatedAt"],
  ApiKey: ["id", "userId", "name", "prefix", "scopes", "lastUsedAt", "createdAt", "expiresAt"],
  LiveSession: ["id", "hostId", "code", "title", "status", "createdAt"],
  AdCampaign: ["id", "userId", "name", "platform", "objective", "status", "budgetPerDay", "totalSpent", "targetUrl", "startDate", "endDate", "createdAt", "updatedAt"],
}

/**
 * Champs STRUCTURELLEMENT exclus des types générés — quel que soit le
 * modèle : les secrets ne doivent jamais apparaître dans un SDK public.
 */
const SECRET_FIELD_RE = /^(passwordHash|password|token|tokens|secret|secrets|encryptedData|hash|apiKey|apiKeys?|key|privateKey|clientSecret|verifierEnc|chariowId)$/i

const TS_TYPES = { String: "string", Int: "number", Float: "number", Boolean: "boolean", DateTime: "string", Json: "unknown", BigInt: "number" }

function tsType(field) {
  let t = TS_TYPES[field.type] ?? "unknown"
  if (field.optional) t += " | null"
  if (field.isArray) t = `Array<${t}>`
  return t
}

function pyType(field) {
  const map = { String: "str", Int: "int", Float: "float", Boolean: "bool", DateTime: "str", Json: "object", BigInt: "int" }
  let t = map[field.type] ?? "object"
  if (field.optional) t = `${t} | None`
  if (field.isArray) t = `list[${t}]`
  return t
}

// ---------- TypeScript : sdks/typescript ----------

function tsInterface(model) {
  const allow = PUBLIC_FIELDS[model.name]
  const fields = allow
    ? model.fields.filter((f) => allow.includes(f.name))
    : model.fields.filter((f) => !f.isRelation && !SECRET_FIELD_RE.test(f.name))
  const lines = fields.map((f) => `  /** ${f.name}${f.isId ? " (identifiant)" : ""} */\n  ${f.name}${f.optional ? "?" : ""}: ${tsType(f)};`)
  return `export interface ${model.name} {\n${lines.join("\n")}\n}`
}

const tsModels = models.map(tsInterface).join("\n\n")

const TS_PACKAGE = {
  name: "@gen3ia/sdk",
  version: "3.6.0",
  description: "SDK officiel GEN3IA — types générés depuis le schéma Prisma + client API v1 typé",
  type: "module",
  main: "src/index.ts",
  types: "src/index.ts",
  files: ["src"],
  keywords: ["gen3ia", "ai", "agents", "sdk"],
  license: "MIT",
  engines: { node: ">=18" },
}

const tsClient = `import type { Agent, Task, TaskStep, Transaction, ApiKey } from "./types.gen"

/** Enveloppe standard des réponses API v1. */
export interface ApiResponse<T> {
  ok: boolean
  data?: T
  error?: string
  code?: string
}

/** Message d'historique de conversation. */
export interface ChatMessage {
  role: "user" | "assistant"
  content: string
}

export interface ChatResult {
  answer: string
  agent: { slug: string; name: string }
  usage?: { tokensIn: number; tokensOut: number; credits: number }
}

export interface TaskResult {
  answer: string
  evidence?: Array<{ type: string; description: string; content: string }>
  metrics?: { tokensIn: number; tokensOut: number; costCredits: number; durationMs: number }
}

export interface RunTaskOptions {
  agentSlug?: string
  wait?: boolean
  pollMs?: number
  timeoutMs?: number
}

export class Gen3iaError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string
  ) {
    super(message)
    this.name = "Gen3iaError"
  }
}

/** Client GEN3IA API v1 — typé de bout en bout (Node 18+, fetch natif). */
export class Gen3iaClient {
  constructor(
    private options: { apiKey: string; baseUrl: string; fetchImpl?: typeof fetch } = {
      apiKey: process.env.GEN3IA_API_KEY ?? "",
      baseUrl: process.env.GEN3IA_URL ?? "https://gen3ia.online",
    }
  ) {
    if (!this.options.apiKey) throw new Gen3iaError("GEN3IA_API_KEY manquante (param ou variable d'environnement)", 0)
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const doFetch = this.options.fetchImpl ?? fetch
    const res = await doFetch(this.options.baseUrl + "/api/v1" + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + this.options.apiKey,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => "")
      throw new Gen3iaError("GEN3IA " + res.status + " : " + text.slice(0, 500), res.status)
    }
    return (await res.json()) as T
  }

  /** Conversation synchrone avec un agent publié. */
  async chat(message: string, agentSlug: string, history: ChatMessage[] = []): Promise<ChatResult> {
    return this.request<ChatResult>("POST", "/chat", { message, agent_slug: agentSlug, history })
  }

  /** Lance une tâche (pipeline complet) et l'attend optionnellement. */
  async runTask(prompt: string, options: RunTaskOptions = {}): Promise<Task & { result?: TaskResult; steps?: TaskStep[] }> {
    const created = await this.request<{ task_id: string }>("POST", "/task", {
      prompt,
      agent_slug: options.agentSlug,
      mode: "async",
    })
    if (options.wait === false) return { id: created.task_id } as Task
    const timeoutMs = options.timeoutMs ?? 15 * 60_000
    const deadline = Date.now() + timeoutMs
    for (;;) {
      const task = await this.request<Task & { result?: TaskResult; steps?: TaskStep[] }>(
        "GET",
        "/task/" + created.task_id
      )
      if (["COMPLETED", "FAILED", "CANCELLED"].includes(task.status)) return task
      if (Date.now() > deadline) throw new Gen3iaError("Timeout d'attente de la tâche " + created.task_id, 408)
      await new Promise((r) => setTimeout(r, options.pollMs ?? 2000))
    }
  }

  /** Détail d'une tâche (statut, étapes, résultat). */
  async getTask(taskId: string): Promise<Task & { result?: TaskResult; steps?: TaskStep[] }> {
    return this.request("GET", "/task/" + taskId)
  }

  /** Historique des transactions de crédits. */
  async listTransactions(): Promise<Transaction[]> {
    const res = await this.request<{ transactions: Transaction[] }>("GET", "/transactions")
    return res.transactions
  }

  /** Clés API actives (préfixes uniquement — jamais les secrets). */
  async listApiKeys(): Promise<ApiKey[]> {
    const res = await this.request<{ keys: ApiKey[] }>("GET", "/keys")
    return res.keys
  }

  /** Agents publics du marketplace. */
  async listAgents(): Promise<Agent[]> {
    const res = await this.request<{ agents: Agent[] }>("GET", "/agents")
    return res.agents
  }
}
`

const tsIndex = `export * from "./types.gen"
export * from "./client"
`

// ---------- Python : sdks/python ----------

function pyDataclass(model) {
  const allow = PUBLIC_FIELDS[model.name]
  const fields = allow
    ? model.fields.filter((f) => allow.includes(f.name))
    : model.fields.filter((f) => !f.isRelation && !SECRET_FIELD_RE.test(f.name))
  // Dataclasses : les champs avec défaut DOIVENT venir en dernier ; les
  // champs à défaut serveur (id, createdAt…) sont TOUJOURS présents dans
  // une réponse → requis, sans défaut.
  const required = fields.filter((f) => !f.optional)
  const optional = fields.filter((f) => f.optional)
  const ordered = [...required, ...optional]
  const lines = ordered
    .map((f) => {
      const d = f.optional ? " = None" : ""
      return `    ${snake(f.name)}: ${pyType(f)}${d}`
    })
    .join("\n")
  return `@dataclass\nclass ${model.name}:\n${lines}\n`
}

function snake(name) {
  return name.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase()
}

const pyTypes = `"""Types générés automatiquement depuis le schéma Prisma GEN3IA (v3.6).

Ne pas éditer à la main — régénérer via : node scripts/gen-sdk-types.mjs
Champs publics de l'API v1 uniquement (aucun secret n'est typé).
"""
from dataclasses import dataclass, field
from typing import Any


${models.map(pyDataclass).join("\n")}
`

const PY_CLIENT = `"""Client GEN3IA API v1 — typé de bout en bout (Python 3.9+, urllib)."""
import json
import os
import time
import urllib.request
import urllib.error
from typing import Any, Dict, List, Optional

from .types_gen import Task, TaskStep, Transaction, ApiKey, Agent

BASE_URL = os.environ.get("GEN3IA_URL", "https://gen3ia.online")
API_KEY = os.environ.get("GEN3IA_API_KEY", "")


class Gen3iaError(Exception):
    def __init__(self, message: str, status: int = 0):
        super().__init__(message)
        self.status = status


class Gen3iaClient:
    def __init__(self, api_key: Optional[str] = None, base_url: Optional[str] = None):
        self.api_key = api_key or API_KEY
        self.base_url = (base_url or BASE_URL).rstrip("/")
        if not self.api_key:
            raise Gen3iaError("GEN3IA_API_KEY manquante (param ou variable d'environnement)")

    def _request(self, method: str, path: str, payload: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        data = json.dumps(payload).encode() if payload is not None else None
        req = urllib.request.Request(
            self.base_url + "/api/v1" + path,
            data=data,
            method=method,
            headers={"Content-Type": "application/json", "Authorization": "Bearer " + self.api_key},
        )
        try:
            with urllib.request.urlopen(req) as res:
                return json.loads(res.read().decode())
        except urllib.error.HTTPError as e:
            raise Gen3iaError(f"GEN3IA {e.code} : {e.read().decode()[:500]}", e.code)

    def chat(self, message: str, agent_slug: str, history: Optional[List[Dict[str, str]]] = None) -> Dict[str, Any]:
        return self._request("POST", "/chat", {
            "message": message,
            "agent_slug": agent_slug,
            "history": history or [],
        })

    def run_task(self, prompt: str, agent_slug: Optional[str] = None, wait: bool = True, poll_s: float = 2.0, timeout_s: float = 900.0) -> Dict[str, Any]:
        created = self._request("POST", "/task", {"prompt": prompt, "agent_slug": agent_slug, "mode": "async"})
        task_id = created["task_id"]
        if not wait:
            return {"id": task_id}
        deadline = time.time() + timeout_s
        while True:
            task = self._request("GET", "/task/" + task_id)
            if task.get("status") in ("COMPLETED", "FAILED", "CANCELLED"):
                return task
            if time.time() > deadline:
                raise Gen3iaError("Timeout d'attente de la tâche " + task_id, 408)
            time.sleep(poll_s)

    def get_task(self, task_id: str) -> Dict[str, Any]:
        return self._request("GET", "/task/" + task_id)

    def list_transactions(self) -> List[Dict[str, Any]]:
        return self._request("GET", "/transactions")["transactions"]

    def list_api_keys(self) -> List[Dict[str, Any]]:
        return self._request("GET", "/keys")["keys"]

    def list_agents(self) -> List[Dict[str, Any]]:
        return self._request("GET", "/agents")["agents"]
`

const PY_PROJECT = `[project]
name = "gen3ia"
version = "3.6.0"
description = "SDK officiel GEN3IA — types générés depuis le schéma Prisma + client API v1 typé"
requires-python = ">=3.9"
license = "MIT"

[build-system]
requires = ["setuptools>=61"]
build-backend = "setuptools.build-meta"
`

// ---------- Écriture ----------

const tsDir = join(ROOT, "sdks/typescript/src")
mkdirSync(tsDir, { recursive: true })
writeFileSync(join(tsDir, "types.gen.ts"), `/** Types générés automatiquement depuis le schéma Prisma GEN3IA (v3.6).\n * Ne pas éditer à la main — régénérer via : node scripts/gen-sdk-types.mjs\n * Champs publics de l'API v1 uniquement (aucun secret n'est typé).\n */\n\n${tsModels}\n`)
writeFileSync(join(tsDir, "client.ts"), tsClient)
writeFileSync(join(tsDir, "index.ts"), tsIndex)
writeFileSync(join(ROOT, "sdks/typescript/package.json"), JSON.stringify(TS_PACKAGE, null, 2) + "\n")
const TS_README = [
  "# @gen3ia/sdk (TypeScript)",
  "",
  "SDK officiel GEN3IA — **types générés depuis le schéma Prisma** (autocomplétion",
  "complète, zéro divergence entre base et client).",
  "",
  "```bash",
  "npm install @gen3ia/sdk   # ou : copier src/ directement (zéro dépendance)",
  "```",
  "",
  "```ts",
  'import { Gen3iaClient } from "@gen3ia/sdk"',
  "",
  'const client = new Gen3iaClient({ apiKey: "g3ia_live_...", baseUrl: "https://gen3ia.online" })',
  'const task = await client.runTask("Analyse le marché des panneaux solaires", { agentSlug: "analyste-marche" })',
  "console.log(task.result?.answer)",
  "```",
  "",
  "Régénération des types après modification du schéma :",
  "```bash",
  "node scripts/gen-sdk-types.mjs",
  "```",
  "",
].join("\n")
writeFileSync(join(ROOT, "sdks/typescript/README.md"), TS_README)

const pyDir = join(ROOT, "sdks/python/gen3ia")
mkdirSync(pyDir, { recursive: true })
writeFileSync(join(pyDir, "types_gen.py"), pyTypes)
writeFileSync(join(pyDir, "client.py"), PY_CLIENT)
writeFileSync(join(pyDir, "__init__.py"), `from .client import Gen3iaClient, Gen3iaError
from .types_gen import *

__all__ = ["Gen3iaClient", "Gen3iaError"]
__version__ = "3.6.0"
`)
writeFileSync(join(ROOT, "sdks/python/pyproject.toml"), PY_PROJECT)
const PY_README = [
  "# gen3ia (Python)",
  "",
  "SDK officiel GEN3IA — **dataclasses générées depuis le schéma Prisma**.",
  "",
  "```bash",
  "pip install .   # depuis sdks/python/",
  "```",
  "",
  "```python",
  "from gen3ia import Gen3iaClient",
  "",
  'client = Gen3iaClient(api_key="g3ia_live_...")',
  'task = client.run_task("Analyse le marché des panneaux solaires", agent_slug="analyste-marche")',
  'print(task["result"]["answer"])',
  "```",
  "",
  "Régénération : `node scripts/gen-sdk-types.mjs`",
  "",
].join("\n")
writeFileSync(join(ROOT, "sdks/python/README.md"), PY_README)

// Manifeste d'audit.
const manifest = {
  generatedAt: new Date().toISOString(),
  source: "prisma/schema.prisma",
  models: models.length,
  publicModels: Object.keys(PUBLIC_FIELDS).length,
  excludedSecretFields: ["passwordHash", "encryptedData", "secret", "hash", "token"],
  outputs: [
    "sdks/typescript/src/types.gen.ts",
    "sdks/typescript/src/client.ts",
    "sdks/python/gen3ia/types_gen.py",
    "sdks/python/gen3ia/client.py",
  ],
}
writeFileSync(join(ROOT, "sdks/manifest.json"), JSON.stringify(manifest, null, 2) + "\n")

console.log(`[gen-sdk-types] ${models.length} modèles Prisma → ${Object.keys(PUBLIC_FIELDS).length} types publics restreints`)
console.log(`[gen-sdk-types] TypeScript : sdks/typescript (package @gen3ia/sdk)`)
console.log(`[gen-sdk-types] Python : sdks/python (package gen3ia)`)
