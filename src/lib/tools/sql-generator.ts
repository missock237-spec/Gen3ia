import { chatJSON } from "@/lib/ai"
import { z } from "zod"
import type { DatabaseConnector } from "./database-connector"
import { logger } from "@/lib/observability/logger"

const sqlSchema = z.object({
  sql: z.string(),
  explanation: z.string(),
  readOnly: z.boolean().default(true),
})

/**
 * SqlGenerator — Génère des requêtes SQL depuis du langage naturel.
 * Analyse le schéma de la base, génère le SQL, valide, et exécute.
 */
export class SqlGenerator {
  private connector: DatabaseConnector

  constructor(connector: DatabaseConnector) {
    this.connector = connector
  }

  /**
   * Génère et exécute une requête SQL depuis une question en langage naturel.
   * @param question La question en langage naturel
   * @param schema Le schéma de la base (de introspectSchema)
   * @param readOnly Mode lecture seule par défaut
   */
  async generateAndExecute(
    question: string,
    schema: { tables: Array<{ name: string; columns: Array<{ name: string; type: string; nullable: boolean }> }> },
    readOnly = true
  ): Promise<{ sql: string; explanation: string; rows: Record<string, unknown>[]; error?: string }> {
    // Construire la description du schéma pour le prompt
    const schemaStr = schema.tables
      .map((t) => `TABLE ${t.name} (${t.columns.map((c) => `${c.name} ${c.type}`).join(", ")})`)
      .join("\n")

    // Générer le SQL via LLM
    const res = await chatJSON(
      {
        messages: [
          {
            role: "system",
            content: `Tu es un générateur SQL expert. À partir d'une question en langage naturel et du schéma de base, génère la requête SQL appropriée.
Règles :
- Génére uniquement du SQL valide pour ${this.connector.constructor.name.includes("mongo") ? "MongoDB" : "PostgreSQL/MySQL"}
- En mode lecture seule, n'utilise que SELECT, SHOW, DESCRIBE
- Limite les résultats à 100 lignes
- Explique ta requête

Schéma de la base :
${schemaStr}`,
          },
          { role: "user", content: question },
        ],
        taskType: "EXECUTING",
        temperature: 0,
      },
      sqlSchema
    )

    const sql = res.data.sql

    // Validation de sécurité
    if (readOnly) {
      const forbidden = ["DROP", "DELETE", "TRUNCATE", "ALTER", "GRANT", "REVOKE"]
      for (const kw of forbidden) {
        if (sql.toUpperCase().includes(kw)) {
          logger.warn(`SQLGenerator: requête ${kw} bloquée`, { sql })
          return { sql, explanation: res.data.explanation, rows: [], error: `Opération ${kw} interdite en lecture seule` }
        }
      }
    }

    // Exécuter la requête
    const result = await this.connector.query(sql, { readOnly, limit: 100, timeout: 10000 })

    return {
      sql,
      explanation: res.data.explanation,
      rows: result.rows,
      error: result.error,
    }
  }
}
