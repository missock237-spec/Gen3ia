import { db } from "@/lib/db"
import { chatJSON } from "@/lib/ai"
import { z } from "zod"
import { logger } from "@/lib/observability/logger"

const profileSchema = z.object({
  responseStyle: z.enum(["concise", "balanced", "detailed"]).default("balanced"),
  tone: z.enum(["professional", "casual", "formal"]).default("professional"),
  detailLevel: z.number().min(0).max(1).default(0.5),
  language: z.string().default("fr"),
  preferences: z.array(z.string()).default([]),
})

/**
 * UserProfileEvolver — Apprend les préférences de l'utilisateur
 * (style de réponse, niveau de détail, ton) à partir de l'historique
 * des interactions et les applique automatiquement.
 */
export class UserProfileEvolver {
  /**
   * Analyse l'historique des interactions pour mettre à jour le profil.
   */
  async evolve(userId: string): Promise<void> {
    const tasks = await db.task.findMany({
      where: { userId, status: "COMPLETED" },
      select: { prompt: true, result: true },
      take: 50,
      orderBy: { createdAt: "desc" },
    })

    if (tasks.length < 5) return // Pas assez de données

    const res = await chatJSON(
      {
        messages: [
          {
            role: "system",
            content: `Tu es le moteur d'évolution de profil de GEN3IA. Analyse l'historique des interactions de l'utilisateur pour déterminer ses préférences :
- Style de réponse (concis, équilibré, détaillé)
- Ton (professionnel, décontracté, formel)
- Niveau de détail souhaité (0=pas de détail, 1=très détaillé)
- Langue préférée
- Autres préférences remarquées`,
          },
          {
            role: "user",
            content: `Interactions récentes :\n${tasks.map((t) => `Q: ${t.prompt.substring(0, 150)}...`).join("\n")}`,
          },
        ],
        taskType: "ANALYSIS",
        temperature: 0.3,
      },
      profileSchema
    )

    // Upsert du profil
    const existing = await db.userProfile.findUnique({ where: { userId } })
    if (existing) {
      await db.userProfile.update({
        where: { userId },
        data: {
          responseStyle: res.data.responseStyle,
          tone: res.data.tone,
          detailLevel: res.data.detailLevel,
          language: res.data.language,
          preferences: JSON.stringify(res.data.preferences),
          interactionCount: { increment: tasks.length },
        },
      })
    } else {
      await db.userProfile.create({
        data: {
          userId,
          responseStyle: res.data.responseStyle,
          tone: res.data.tone,
          detailLevel: res.data.detailLevel,
          language: res.data.language,
          preferences: JSON.stringify(res.data.preferences),
          interactionCount: tasks.length,
        },
      })
    }

    logger.info("Profil utilisateur mis à jour", { userId, style: res.data.responseStyle, tone: res.data.tone })
  }

  /**
   * Récupère le profil évolutif d'un utilisateur.
   */
  async getProfile(userId: string) {
    const profile = await db.userProfile.findUnique({ where: { userId } })
    if (!profile) {
      return { responseStyle: "balanced", tone: "professional", detailLevel: 0.5, language: "fr", preferences: [] }
    }
    return {
      responseStyle: profile.responseStyle,
      tone: profile.tone,
      detailLevel: profile.detailLevel,
      language: profile.language,
      preferences: profile.preferences ? JSON.parse(profile.preferences) : [],
      interactionCount: profile.interactionCount,
    }
  }

  /**
   * Applique le profil aux prompts système pour personnaliser les réponses.
   */
  async applyToSystemPrompt(userId: string, basePrompt: string): Promise<string> {
    const profile = await this.getProfile(userId)
    const styleDirective = `Style: ${profile.responseStyle}, Ton: ${profile.tone}, Niveau de détail: ${profile.detailLevel}, Langue: ${profile.language}`
    return `${basePrompt}\n\n[Profil utilisateur — ${styleDirective}]`
  }
}

export const userProfileEvolver = new UserProfileEvolver()
