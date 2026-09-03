import { db } from "@/lib/db"
import { logger } from "@/lib/observability/logger"
import type { AgentExport } from "@/lib/engines/types"

/**
 * AgentExporter — Export d'un agent au format JSON/YAML complet.
 * Inclut config, prompts, tools, skills, memory patterns.
 */
export class AgentExporter {
  async exportAgent(agentId: string): Promise<AgentExport> {
    const agent = await db.agent.findUniqueOrThrow({ where: { id: agentId } })

    // Récupérer les skills associés (via config)
    let toolKeys: string[] = []
    if (agent.config) {
      try {
        const config = JSON.parse(agent.config)
        toolKeys = config.tools ?? []
      } catch {}
    }

    // Récupérer les skills
    const skills = await db.skill.findMany({
      where: { userId: agent.userId },
      take: 50,
    })

    return {
      version: "3.3",
      agent: {
        name: agent.name,
        description: agent.description,
        systemPrompt: agent.systemPrompt,
        provider: agent.provider,
        model: agent.model,
        temperature: agent.temperature,
        maxTokens: agent.maxTokens,
        config: agent.config,
      },
      skills: skills.map((s) => ({
        key: s.key,
        name: s.name,
        definition: s.definition,
      })),
      tools: toolKeys,
      exportedAt: new Date().toISOString(),
    }
  }

  async exportAgentJSON(agentId: string): Promise<string> {
    return JSON.stringify(await this.exportAgent(agentId), null, 2)
  }
}

/**
 * AgentImporter — Import d'un agent depuis JSON/YAML avec validation.
 * Pas d'exécution de code non validé.
 */
export class AgentImporter {
  async importAgent(userId: string, data: AgentExport): Promise<string> {
    // Validation de sécurité
    this.validateImport(data)

    // Générer un slug unique
    const baseSlug = data.agent.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
    const slug = `${baseSlug}-${Date.now()}`

    const agent = await db.agent.create({
      data: {
        userId,
        name: data.agent.name,
        slug,
        description: data.agent.description,
        systemPrompt: data.agent.systemPrompt,
        provider: data.agent.provider,
        model: data.agent.model,
        temperature: data.agent.temperature,
        maxTokens: data.agent.maxTokens,
        config: data.agent.config,
        status: "DRAFT",
        visibility: "PRIVATE",
      },
    })

    // Importer les skills (sans exécuter le code)
    for (const skill of data.skills ?? []) {
      const existing = await db.skill.findUnique({ where: { key: skill.key } })
      if (!existing) {
        await db.skill.create({
          data: {
            userId,
            key: `${skill.key}-imported-${Date.now()}`,
            name: skill.name,
            description: skill.name,
            definition: skill.definition,
          },
        })
      }
    }

    logger.info("Agent importé", { agentId: agent.id, userId, originalName: data.agent.name })
    return agent.id
  }

  /**
   * Valide les données importées (sécurité).
   */
  private validateImport(data: AgentExport): void {
    if (!data.version) throw new Error("Version manquante")
    if (!data.agent?.name) throw new Error("Nom de l'agent manquant")
    if (data.agent.systemPrompt && data.agent.systemPrompt.length > 10_000) {
      throw new Error("System prompt trop long")
    }
    if (data.agent.model && !/^[a-zA-Z0-9\-\/\.]+$/.test(data.agent.model)) {
      throw new Error("Nom de modèle invalide")
    }
    // Bloquer les tentatives d'injection de code
    const suspicious = ["eval(", "exec(", "child_process", "__proto__", "constructor"]
    for (const field of [data.agent.systemPrompt, data.agent.config]) {
      if (field) {
        for (const pattern of suspicious) {
          if (field.includes(pattern)) {
            throw new Error(`Pattern suspect détecté : ${pattern}`)
          }
        }
      }
    }
  }
}

export const agentExporter = new AgentExporter()
export const agentImporter = new AgentImporter()
