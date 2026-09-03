import type { Agent, Task, TaskStep, Transaction, ApiKey } from "./types.gen"

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
