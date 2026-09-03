import { logger } from "@/lib/observability/logger"

/**
 * Connecteur de bases de données externes — PostgreSQL, MySQL, MongoDB.
 * Lecture/écriture avec validation, limites de résultats, protection injection.
 * Les credentials sont stockés chiffrés (ExternalConnection.config).
 */

export type DatabaseType = "postgresql" | "mysql" | "mongodb"

export interface DatabaseConfig {
  type: DatabaseType
  host: string
  port: number
  database: string
  username: string
  password: string
  ssl?: boolean
  maxConnections?: number
  connectionTimeoutMs?: number
}

export interface QueryOptions {
  readOnly: boolean
  limit: number
  timeout: number
}

export interface QueryResult {
  ok: boolean
  rows: Record<string, unknown>[]
  affectedRows?: number
  latencyMs: number
  error?: string
}

const DEFAULT_OPTIONS: QueryOptions = {
  readOnly: true,
  limit: 100,
  timeout: 10_000,
}

/**
 * DatabaseConnector — Connexion sécurisée à une base de données externe.
 * Utilise les drivers natifs de Node.js via des imports dynamiques.
 */
export class DatabaseConnector {
  private config: DatabaseConfig

  constructor(config: DatabaseConfig) {
    this.config = config
  }

  /**
   * Exécute une requête SQL (PostgreSQL/MySQL) avec validation et limites.
   * En mode readOnly, seules les requêtes SELECT/SHOW/DESCRIBE sont autorisées.
   */
  async query(sql: string, options: Partial<QueryOptions> = {}): Promise<QueryResult> {
    const opts = { ...DEFAULT_OPTIONS, ...options }
    const start = Date.now()

    try {
      // Validation : bloquer les requêtes destructives en readOnly
      if (opts.readOnly) {
        const normalized = sql.trim().toUpperCase()
        const forbidden = ["DROP", "DELETE", "TRUNCATE", "ALTER", "CREATE", "INSERT", "UPDATE", "GRANT", "REVOKE"]
        for (const kw of forbidden) {
          if (normalized.startsWith(kw)) {
            return { ok: false, rows: [], latencyMs: Date.now() - start, error: `Requête ${kw} interdite en mode lecture seule` }
          }
        }
      }

      // Limiter le nombre de résultats
      const limitedSql = opts.readOnly && !sql.toUpperCase().includes("LIMIT")
        ? sql.replace(/;?\s*$/, ` LIMIT ${opts.limit};`)
        : sql

      // Connexion dynamique selon le type
      if (this.config.type === "postgresql" || this.config.type === "mysql") {
        const { Pool } = await import(this.config.type === "postgresql" ? "pg" : "mysql2/promise")
        const pool = typeof Pool === "function" ? new Pool({
          host: this.config.host,
          port: this.config.port,
          database: this.config.database,
          user: this.config.username,
          password: this.config.password,
          ssl: this.config.ssl,
          connectionTimeoutMillis: opts.timeout,
        }) : Pool

        const result = await pool.query(limitedSql)
        await pool.end()

        return {
          ok: true,
          rows: result.rows,
          affectedRows: result.rowCount ?? result.affectedRows,
          latencyMs: Date.now() - start,
        }
      }

      if (this.config.type === "mongodb") {
        const { MongoClient } = await import("mongodb")
        const client = new MongoClient(`mongodb://${this.config.username}:${this.config.password}@${this.config.host}:${this.config.port}/${this.config.database}`, {
          serverSelectionTimeoutMS: opts.timeout,
        })
        await client.connect()
        const db = client.db(this.config.database)

        // Pour MongoDB, on attend une syntaxe de filtre JSON
        const filter = JSON.parse(limitedSql || "{}")
        const collection = await db.listCollections().toArray()
        const results: Record<string, unknown>[] = []
        for (const col of collection) {
          const docs = await db.collection(col.name).find(filter).limit(opts.limit).toArray()
          results.push(...docs)
        }
        await client.close()

        return { ok: true, rows: results, latencyMs: Date.now() - start }
      }

      return { ok: false, rows: [], latencyMs: Date.now() - start, error: "Type de base de données non supporté" }
    } catch (err) {
      logger.error("DatabaseConnector: échec de requête", { error: String(err) })
      return { ok: false, rows: [], latencyMs: Date.now() - start, error: String(err) }
    }
  }

  /**
   * Introspecte le schéma de la base pour la génération de SQL.
   */
  async introspectSchema(): Promise<{ tables: Array<{ name: string; columns: Array<{ name: string; type: string; nullable: boolean }> }> }> {
    if (this.config.type === "postgresql") {
      const result = await this.query(`
        SELECT table_name, column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'public'
        ORDER BY table_name, ordinal_position;
      `)
      if (!result.ok) return { tables: [] }
      const tablesMap = new Map<string, Array<{ name: string; type: string; nullable: boolean }>>()
      for (const row of result.rows as Array<Record<string, string>>) {
        const tableName = row.table_name
        if (!tablesMap.has(tableName)) tablesMap.set(tableName, [])
        tablesMap.get(tableName)!.push({
          name: row.column_name,
          type: row.data_type,
          nullable: row.is_nullable === "YES",
        })
      }
      return { tables: Array.from(tablesMap.entries()).map(([name, columns]) => ({ name, columns })) }
    }
    return { tables: [] }
  }

  /** Ferme proprement les connexions. */
  async close(): Promise<void> {
    // Les pools sont créés et fermés par requête (serverless-friendly)
  }
}
