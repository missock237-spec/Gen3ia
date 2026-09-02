import { db } from "@/lib/db"
import { chatJSON } from "@/lib/ai"
import { z } from "zod"
import { logger } from "@/lib/observability/logger"

const skillSchema = z.object({
  pattern: z.string(),
  code: z.string(),
  name: z.string(),
  description: z.string(),
  language: z.enum(["typescript", "javascript", "python"]).default("typescript"),
  parameters: z.array(z.object({
    name: z.string(),
    type: z.string(),
    description: z.string(),
    required: z.boolean().default(true),
  })),
})

/**
 * SkillCreator — Génère automatiquement de nouveaux outils (skills)
 * à partir des patterns récurrents dans les tâches et les enregistre dans le registre.
 */
export class SkillCreator {
  /**
   * Analyse l'historique des tâches pour détecter des patterns récurrents.
   * Regroupe les tâches par similarité de prompt et d'outils utilisés.
   */
  async detectPatterns(userId: string): Promise<Array<{ pattern: string; frequency: number; examples: string[] }>> {
    const tasks = await db.task.findMany({
      where: { userId, status: "COMPLETED" },
      select: { prompt: true, executionLog: true },
      take: 200,
      orderBy: { createdAt: "desc" },
    })

    // Analyser les patterns par LLM
    const res = await chatJSON(
      {
        messages: [
          {
            role: "system",
            content: `Tu es le moteur de détection de patterns de GEN3IA. Analyse l'historique des tâches de l'utilisateur et identifie les patterns récurrents qui pourraient être automatisés sous forme de skills (outils réutilisables).
Pour chaque pattern, indique sa fréquence et des exemples.`,
          },
          {
            role: "user",
            content: `Tâches récentes :\n${tasks.map((t, i) => `${i}: ${t.prompt.substring(0, 200)}`).join("\n")}`,
          },
        ],
        taskType: "ANALYSIS",
        temperature: 0.3,
      },
      z.object({
        patterns: z.array(z.object({
          pattern: z.string(),
          frequency: z.number(),
          examples: z.array(z.string()),
        })),
      })
    )

    return res.data.patterns
  }

  /**
   * Génère le code d'un skill à partir d'un pattern détecté.
   */
  async generateSkill(userId: string, pattern: string, examples: string[]) {
    const res = await chatJSON(
      {
        messages: [
          {
            role: "system",
            content: `Tu es le générateur de skills de GEN3IA. À partir d'un pattern récurrent et d'exemples, génère un outil réutilisable sous forme de fonction.
Le code doit être :
- En TypeScript, autonome et testé
- Avec validation des entrées (Zod si possible)
- Avec gestion d'erreurs
- Documenté (commentaires en français)`,
          },
          {
            role: "user",
            content: `Pattern : ${pattern}\nExemples :\n${examples.join("\n")}`,
          },
        ],
        taskType: "EXECUTING",
        temperature: 0.2,
      },
      skillSchema
    )

    // Valider la syntaxe (vérification basique)
    const code = res.data.code
    if (!code || code.length < 10) {
      throw new Error("Code généré invalide")
    }

    // Enregistrer en base
    const skill = await db.autoSkill.create({
      data: {
        userId,
        pattern,
        code,
        language: res.data.language,
        status: "DRAFT",
      },
    })

    logger.info("Skill auto-généré", { skillId: skill.id, userId, pattern })
    return skill
  }

  /**
   * Valide un skill généré (vérification syntaxique).
   */
  async validateSkill(skillId: string): Promise<boolean> {
    const skill = await db.autoSkill.findUnique({ where: { id: skillId } })
    if (!skill) return false

    try {
      // Validation syntaxique de base TypeScript
      if (skill.language === "typescript" || skill.language === "javascript") {
        // En production, on utiliserait un AST.parser (esbuild, swc)
        // Ici validation basique : vérifier les accolades, parenthèses
        const code = skill.code
        const openBraces = (code.match(/{/g) ?? []).length
        const closeBraces = (code.match(/}/g) ?? []).length
        const openParens = (code.match(/\(/g) ?? []).length
        const closeParens = (code.match(/\)/g) ?? []).length
        if (openBraces !== closeBraces) return false
        if (openParens !== closeParens) return false
      }

      await db.autoSkill.update({ where: { id: skillId }, data: { status: "VALIDATED" } })
      return true
    } catch {
      await db.autoSkill.update({ where: { id: skillId }, data: { status: "REJECTED" } })
      return false
    }
  }
}

export const skillCreator = new SkillCreator()
