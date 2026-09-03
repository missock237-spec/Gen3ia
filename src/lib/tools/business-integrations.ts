import { logger } from "@/lib/observability/logger"

/**
 * Intégrations APIs métiers — Salesforce, HubSpot, Notion, Slack.
 * Chaque intégration utilise l'API REST officielle avec authentification par token.
 */

export type IntegrationType = "salesforce" | "hubspot" | "notion" | "slack"

export interface IntegrationConfig {
  type: IntegrationType
  apiKey: string
  baseUrl?: string
  extraHeaders?: Record<string, string>
}

export interface IntegrationAction {
  type: "CREATE_TICKET" | "SEND_MESSAGE" | "UPDATE_CONTACT" | "CREATE_NOTE" | "SEARCH" | "CUSTOM"
  resource: string
  data: Record<string, unknown>
}

export interface ActionResult {
  ok: boolean
  data?: Record<string, unknown>
  error?: string
  statusCode?: number
}

/**
 * BusinessIntegration — Gestionnaire d'intégrations APIs métiers.
 */
export class BusinessIntegration {
  private config: IntegrationConfig

  constructor(config: IntegrationConfig) {
    this.config = config
  }

  /** Exécute une action sur l'API métier. */
  async execute(action: IntegrationAction): Promise<ActionResult> {
    try {
      switch (this.config.type) {
        case "salesforce":
          return await this.salesforceAction(action)
        case "hubspot":
          return await this.hubspotAction(action)
        case "notion":
          return await this.notionAction(action)
        case "slack":
          return await this.slackAction(action)
        default:
          return { ok: false, error: `Type d'intégration non supporté: ${this.config.type}` }
      }
    } catch (err) {
      logger.error("BusinessIntegration échec", { type: this.config.type, error: String(err) })
      return { ok: false, error: String(err) }
    }
  }

  private async salesforceAction(action: IntegrationAction): Promise<ActionResult> {
    const baseUrl = this.config.baseUrl ?? "https://api.salesforce.com"
    const headers = { "Authorization": `Bearer ${this.config.apiKey}`, "Content-Type": "application/json", ...this.config.extraHeaders }

    switch (action.type) {
      case "CREATE_TICKET":
        const res = await fetch(`${baseUrl}/services/data/v58/sobjects/Case`, {
          method: "POST",
          headers,
          body: JSON.stringify(action.data),
        })
        return { ok: res.ok, data: await res.json(), statusCode: res.status }

      case "UPDATE_CONTACT":
        const updRes = await fetch(`${baseUrl}/services/data/v58/sobjects/Contact/${action.data.id}`, {
          method: "PATCH",
          headers,
          body: JSON.stringify(action.data),
        })
        return { ok: updRes.ok, statusCode: updRes.status }

      case "SEARCH":
        const searchRes = await fetch(`${baseUrl}/services/data/v58/search?q=${encodeURIComponent(action.resource)}`, {
          headers,
        })
        return { ok: searchRes.ok, data: await searchRes.json(), statusCode: searchRes.status }

      default:
        return { ok: false, error: "Action Salesforce non supportée" }
    }
  }

  private async hubspotAction(action: IntegrationAction): Promise<ActionResult> {
    const baseUrl = "https://api.hubapi.com"
    const headers = { "Authorization": `Bearer ${this.config.apiKey}`, "Content-Type": "application/json" }

    switch (action.type) {
      case "CREATE_TICKET":
      case "CREATE_NOTE":
        const res = await fetch(`${baseUrl}/crm/v3/objects/${action.resource}`, {
          method: "POST",
          headers,
          body: JSON.stringify(action.data),
        })
        return { ok: res.ok, data: await res.json(), statusCode: res.status }

      case "UPDATE_CONTACT":
        const updRes = await fetch(`${baseUrl}/crm/v3/objects/contacts/${action.data.id}`, {
          method: "PATCH",
          headers,
          body: JSON.stringify(action.data),
        })
        return { ok: updRes.ok, statusCode: updRes.status }

      case "SEARCH":
        const searchRes = await fetch(`${baseUrl}/crm/v3/objects/${action.resource}/search`, {
          method: "POST",
          headers,
          body: JSON.stringify(action.data),
        })
        return { ok: searchRes.ok, data: await searchRes.json(), statusCode: searchRes.status }

      default:
        return { ok: false, error: "Action HubSpot non supportée" }
    }
  }

  private async notionAction(action: IntegrationAction): Promise<ActionResult> {
    const baseUrl = "https://api.notion.com/v1"
    const headers = {
      "Authorization": `Bearer ${this.config.apiKey}`,
      "Content-Type": "application/json",
      "Notion-Version": "2022-06-28",
    }

    switch (action.type) {
      case "CREATE_NOTE":
        const res = await fetch(`${baseUrl}/pages`, {
          method: "POST",
          headers,
          body: JSON.stringify(action.data),
        })
        return { ok: res.ok, data: await res.json(), statusCode: res.status }

      case "SEARCH":
        const searchRes = await fetch(`${baseUrl}/search`, {
          method: "POST",
          headers,
          body: JSON.stringify(action.data),
        })
        return { ok: searchRes.ok, data: await searchRes.json(), statusCode: searchRes.status }

      default:
        return { ok: false, error: "Action Notion non supportée" }
    }
  }

  private async slackAction(action: IntegrationAction): Promise<ActionResult> {
    const baseUrl = "https://slack.com/api"
    const headers = { "Authorization": `Bearer ${this.config.apiKey}`, "Content-Type": "application/json" }

    switch (action.type) {
      case "SEND_MESSAGE":
        const res = await fetch(`${baseUrl}/chat.postMessage`, {
          method: "POST",
          headers,
          body: JSON.stringify({ channel: action.resource, ...action.data }),
        })
        const json = await res.json()
        return { ok: json.ok ?? false, data: json, statusCode: res.status }

      case "CREATE_TICKET":
        // Slack n'a pas de tickets natifs, on crée un message dans un canal dédié
        const ticketRes = await fetch(`${baseUrl}/chat.postMessage`, {
          method: "POST",
          headers,
          body: JSON.stringify({ channel: action.resource, text: `🎫 Ticket: ${JSON.stringify(action.data)}` }),
        })
        return { ok: (await ticketRes.json()).ok ?? false, statusCode: ticketRes.status }

      default:
        return { ok: false, error: "Action Slack non supportée" }
    }
  }
}
