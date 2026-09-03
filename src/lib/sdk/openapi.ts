import { getAppUrl } from "@/lib/config"

/**
 * Document OpenAPI 3.1 de l'API publique v1 (v3.6 — DX).
 *
 * Construit À PARTIR DES ROUTES RÉELLES (src/app/api/v1/*) : chaque entrée
 * documente les schémas Zod de validation réellement appliqués côté serveur.
 * Sert :
 *  - GET /api/openapi.json (spec machine, intégrations tierces) ;
 *  - /docs/api (Swagger UI interactif maison — essai réel des endpoints).
 */

export const API_V1_ENDPOINTS = [
  "/api/v1/chat",
  "/api/v1/task",
  "/api/v1/task/{taskId}",
  "/api/v1/agents",
  "/api/v1/keys",
  "/api/v1/transactions",
  "/api/v1/models",
  "/api/v1/models/select",
  "/api/v1/embeddings",
  "/api/v1/files",
  "/api/v1/knowledge",
  "/api/v1/jobs",
] as const

export function buildOpenApiDocument(): Record<string, unknown> {
  return {
    openapi: "3.1.0",
    info: {
      title: "GEN3IA API",
      version: "4.0.0",
      description:
        "API publique GEN3IA — plateforme d'agents IA.\n\n" +
        "Authentification : clé API `g3ia_live_...` via l'en-tête `Authorization: Bearer`.\n" +
        "Créez une clé depuis l'interface (section Clés API) ou le SDK.\n\n" +
        "Toutes les réponses suivent l'enveloppe `{ ok, ... | error, code }`.",
      contact: { name: "GEN3IA", url: getAppUrl() },
      license: { name: "MIT" },
    },
    servers: [{ url: getAppUrl() }],
    tags: [
      { name: "Chat", description: "Conversation synchrone avec un agent" },
      { name: "Tasks", description: "Pipeline complet d'exécution (analyse → plan → exécution → vérification)" },
      { name: "Agents", description: "Catalogue des agents accessibles" },
      { name: "Account", description: "Clés API et historique de crédits" },
      { name: "Models", description: "Registre de modèles + routage intelligent (v4.0)" },
      { name: "Intelligence", description: "Embeddings et Knowledge Base RAG (v4.0)" },
      { name: "Compute", description: "Fichiers HF Bucket et jobs longs Hugging Face (v4.0)" },
    ],
    components: {
      securitySchemes: {
        BearerApiKey: {
          type: "http",
          scheme: "bearer",
          description: "Clé API GEN3IA (g3ia_live_...)",
        },
      },
      schemas: {
        Error: {
          type: "object",
          properties: {
            ok: { type: "boolean", const: false },
            error: { type: "string", description: "Message lisible" },
            code: { type: "string", description: "Code machine (BAD_API_KEY, FORBIDDEN, ...)" },
          },
          required: ["ok", "error"],
        },
        ChatRequest: {
          type: "object",
          properties: {
            message: { type: "string", minLength: 1, maxLength: 8000, description: "Message utilisateur" },
            agent_slug: { type: "string", maxLength: 60, description: "Slug de l'agent cible (défaut : agent de la clé)" },
            history: {
              type: "array",
              maxItems: 20,
              items: {
                type: "object",
                properties: {
                  role: { type: "string", enum: ["user", "assistant"] },
                  content: { type: "string", maxLength: 8000 },
                },
                required: ["role", "content"],
              },
            },
          },
          required: ["message"],
        },
        ChatResponse: {
          type: "object",
          properties: {
            ok: { type: "boolean", const: true },
            agent: {
              type: "object",
              properties: { slug: { type: "string" }, name: { type: "string" } },
              required: ["slug", "name"],
            },
            answer: { type: "string", description: "Réponse de l'agent (inférence réelle)" },
            usage: {
              type: "object",
              properties: {
                tokensIn: { type: "integer" },
                tokensOut: { type: "integer" },
                credits: { type: "number", description: "Crédits débités" },
              },
            },
            latencyMs: { type: "integer" },
          },
          required: ["ok", "agent", "answer"],
        },
        TaskRequest: {
          type: "object",
          properties: {
            prompt: { type: "string", minLength: 10, maxLength: 8000, description: "Demande à exécuter" },
            agent_slug: { type: "string", maxLength: 60, description: "Agent à utiliser" },
            mode: { type: "string", enum: ["async"], description: "Mode asynchrone (recommandé)" },
          },
          required: ["prompt"],
        },
        TaskCreated: {
          type: "object",
          properties: {
            ok: { type: "boolean", const: true },
            task_id: { type: "string", description: "Identifiant à sonder via /task/{taskId}" },
          },
          required: ["ok", "task_id"],
        },
        TaskStatus: {
          type: "object",
          properties: {
            id: { type: "string" },
            status: {
              type: "string",
              enum: ["QUEUED", "ANALYZING", "PLANNING", "SIMULATING", "WAITING_PLAN_APPROVAL", "WAITING_FOR_HUMAN", "EXECUTING", "VERIFYING", "LEARNING", "COMPLETED", "FAILED", "CANCELLED"],
              description: "État courant du pipeline",
            },
            prompt: { type: "string" },
            costCredits: { type: "number" },
            tokensIn: { type: "integer" },
            tokensOut: { type: "integer" },
            attempts: { type: "integer" },
            error: { type: "string", nullable: true },
            result: {
              type: "object",
              nullable: true,
              properties: {
                answer: { type: "string", description: "Réponse finale (si terminée)" },
                evidence: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      type: { type: "string" },
                      description: { type: "string" },
                      content: { type: "string" },
                    },
                  },
                },
              },
            },
            steps: {
              type: "array",
              description: "Journal d'exécution par étape",
              items: {
                type: "object",
                properties: {
                  phase: { type: "string" },
                  title: { type: "string" },
                  status: { type: "string", enum: ["PENDING", "RUNNING", "DONE", "FAILED", "SKIPPED", "WAITING"] },
                },
              },
            },
            createdAt: { type: "string", format: "date-time" },
            completedAt: { type: "string", format: "date-time", nullable: true },
          },
          required: ["id", "status"],
        },
        AgentPublic: {
          type: "object",
          properties: {
            id: { type: "string" },
            slug: { type: "string" },
            name: { type: "string" },
            description: { type: "string", nullable: true },
            category: { type: "string", nullable: true },
            provider: { type: "string" },
            model: { type: "string" },
            temperature: { type: "number" },
            status: { type: "string", enum: ["PUBLISHED", "PAUSED"] },
            visibility: { type: "string", enum: ["PRIVATE", "MARKETPLACE"] },
            createdAt: { type: "string", format: "date-time" },
          },
          required: ["id", "slug", "name"],
        },
        ApiKeyPublic: {
          type: "object",
          description: "Clé API (préfixe uniquement — le secret complet n'est jamais renvoyé)",
          properties: {
            id: { type: "string" },
            name: { type: "string" },
            prefix: { type: "string", description: "12 premiers caractères, affichables" },
            scopes: { type: "string", description: "CSV des scopes" },
            requests: { type: "integer" },
            agentId: { type: "string", nullable: true },
            lastUsedAt: { type: "string", format: "date-time", nullable: true },
            createdAt: { type: "string", format: "date-time" },
          },
          required: ["id", "name", "prefix"],
        },
        Transaction: {
          type: "object",
          properties: {
            id: { type: "string" },
            type: { type: "string", description: "TASK_EXECUTION | TOPUP | SUBSCRIPTION | REFUND | ..." },
            amount: { type: "number", description: "Positif = crédit, négatif = débit" },
            balanceAfter: { type: "number" },
            description: { type: "string" },
            refType: { type: "string", nullable: true },
            refId: { type: "string", nullable: true },
            createdAt: { type: "string", format: "date-time" },
          },
          required: ["id", "type", "amount", "balanceAfter"],
        },
      },
    },
    security: [{ BearerApiKey: [] }],
    paths: {
      "/api/v1/chat": {
        post: {
          tags: ["Chat"],
          summary: "Conversation avec un agent",
          description: "Inférence synchrone avec un agent publié (accessible à la clé).",
          requestBody: {
            required: true,
            content: { "application/json": { schema: { $ref: "#/components/schemas/ChatRequest" } } },
          },
          responses: {
            200: {
              description: "Réponse de l'agent",
              content: { "application/json": { schema: { $ref: "#/components/schemas/ChatResponse" } } },
            },
            401: { description: "Clé API invalide", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
            403: { description: "Agent non accessible", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
            429: { description: "Limite de débit dépassée", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          },
        },
      },
      "/api/v1/task": {
        post: {
          tags: ["Tasks"],
          summary: "Lancer une tâche (pipeline complet)",
          description:
            "Analyse → planification (5 plans) → exécution outils → vérification → livraison.\n" +
            "Retourne immédiatement un task_id à sonder (mode async).",
          requestBody: {
            required: true,
            content: { "application/json": { schema: { $ref: "#/components/schemas/TaskRequest" } } },
          },
          responses: {
            200: {
              description: "Tâche créée",
              content: { "application/json": { schema: { $ref: "#/components/schemas/TaskCreated" } } },
            },
            401: { description: "Clé API invalide", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
            402: { description: "Crédits insuffisants", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          },
        },
      },
      "/api/v1/task/{taskId}": {
        get: {
          tags: ["Tasks"],
          summary: "Statut et résultat d'une tâche",
          parameters: [
            {
              name: "taskId",
              in: "path",
              required: true,
              schema: { type: "string" },
              description: "Identifiant renvoyé par POST /api/v1/task",
            },
          ],
          responses: {
            200: {
              description: "État courant (poll jusqu'à COMPLETED/FAILED/CANCELLED)",
              content: { "application/json": { schema: { $ref: "#/components/schemas/TaskStatus" } } },
            },
            404: { description: "Tâche introuvable", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          },
        },
      },
      "/api/v1/agents": {
        get: {
          tags: ["Agents"],
          summary: "Agents accessibles",
          description: "Agents publics (marketplace), agents du propriétaire de la clé et l'agent lié à la clé.",
          responses: {
            200: {
              description: "Liste d'agents (sans prompt système ni secret)",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      ok: { type: "boolean" },
                      agents: { type: "array", items: { $ref: "#/components/schemas/AgentPublic" } },
                    },
                    required: ["ok", "agents"],
                  },
                },
              },
            },
          },
        },
      },
      "/api/v1/keys": {
        get: {
          tags: ["Account"],
          summary: "Clés API du compte",
          description: "Clés actives du propriétaire (préfixes affichables uniquement).",
          responses: {
            200: {
              description: "Liste des clés",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      ok: { type: "boolean" },
                      keys: { type: "array", items: { $ref: "#/components/schemas/ApiKeyPublic" } },
                    },
                    required: ["ok", "keys"],
                  },
                },
              },
            },
          },
        },
      },
      "/api/v1/transactions": {
        get: {
          tags: ["Account"],
          summary: "Historique des crédits",
          parameters: [
            { name: "limit", in: "query", schema: { type: "integer", default: 25, maximum: 100 }, description: "Nombre de transactions" },
            { name: "cursor", in: "query", schema: { type: "string" }, description: "Curseur de pagination (id du dernier élément)" },
          ],
          responses: {
            200: {
              description: "Transactions paginées",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      ok: { type: "boolean" },
                      transactions: { type: "array", items: { $ref: "#/components/schemas/Transaction" } },
                      total: { type: "integer" },
                      nextCursor: { type: "string", nullable: true },
                    },
                    required: ["ok", "transactions"],
                  },
                },
              },
            },
          },
        },
      },
      "/api/v1/models": {
        get: {
          tags: ["Models"],
          summary: "Registre des modèles",
          description: "Catalogue des modèles (provider, capacités, coûts, scores APPRIS).",
          parameters: [
            { name: "provider", in: "query", schema: { type: "string" }, description: "Filtrer par fournisseur" },
            { name: "task", in: "query", schema: { type: "string" }, description: "Filtrer par type de tâche" },
            { name: "stats", in: "query", schema: { type: "string", enum: ["0", "1"] }, description: "Inclure le classement de performance" },
          ],
          responses: {
            200: { description: "Modèles du registre", content: { "application/json": { schema: { type: "object" } } } },
            401: { description: "Clé API invalide", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          },
        },
      },
      "/api/v1/models/select": {
        post: {
          tags: ["Models"],
          summary: "Sélection intelligente de modèle",
          description: "Model Router : meilleur modèle + raison + alternatives + coût estimé + confiance (sans exécution).",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    prompt: { type: "string", description: "Demande (pour estimer le contexte)" },
                    task_type: { type: "string", enum: ["ANALYSIS", "PLANNING", "EXECUTION", "VERIFICATION", "LEARNING", "CHAT", "SUMMARIZATION", "EMBEDDING", "VISION"] },
                    desired_quality: { type: "string", enum: ["fast", "balanced", "premium"] },
                    context_tokens: { type: "integer" },
                    budget_credits: { type: "number" },
                    model_constraints: { type: "object", description: "Listes blanches/noires providers/modèles" },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: "Décision de routage justifiée", content: { "application/json": { schema: { type: "object" } } } },
            401: { description: "Clé API invalide", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          },
        },
      },
      "/api/v1/embeddings": {
        post: {
          tags: ["Intelligence"],
          summary: "Embeddings vectoriels",
          description: "Embeddings (fournisseur auto : OpenAI-compat / HF / local), facturés au crédit.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["input"],
                  properties: {
                    input: { oneOf: [{ type: "string" }, { type: "array", items: { type: "string" }, maxItems: 64 }] },
                    model: { type: "string" },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: "Vecteurs", content: { "application/json": { schema: { type: "object" } } } },
          },
        },
      },
      "/api/v1/files": {
        get: {
          tags: ["Compute"],
          summary: "Liste des fichiers (Bucket HF)",
          parameters: [
            { name: "bucket", in: "query", schema: { type: "string" }, description: "models|datasets|knowledge|generated|..." },
            { name: "folder", in: "query", schema: { type: "string" }, description: "Sous-dossier" },
          ],
          responses: { 200: { description: "Objets du bucket", content: { "application/json": { schema: { type: "object" } } } } },
        },
        post: {
          tags: ["Compute"],
          summary: "Déposer un fichier (Bucket HF)",
          description: "Octets stockés chez Hugging Face (HF_TOKEN côté serveur uniquement), métadonnées dans PostgreSQL.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["path", "content_base64"],
                  properties: {
                    path: { type: "string" },
                    content_base64: { type: "string", description: "Contenu encodé base64" },
                    content_type: { type: "string" },
                    bucket: { type: "string", enum: ["models", "datasets", "users", "agents", "knowledge", "embeddings", "generated", "checkpoints", "artifacts", "logs", "temporary"] },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: "Objet déposé", content: { "application/json": { schema: { type: "object" } } } },
            503: { description: "HF non configuré", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          },
        },
        delete: {
          tags: ["Compute"],
          summary: "Supprimer un fichier",
          responses: { 200: { description: "Supprimé", content: { "application/json": { schema: { type: "object" } } } } },
        },
      },
      "/api/v1/knowledge": {
        get: {
          tags: ["Intelligence"],
          summary: "Documents de la Knowledge Base",
          responses: { 200: { description: "Documents paginés", content: { "application/json": { schema: { type: "object" } } } } },
        },
        post: {
          tags: ["Intelligence"],
          summary: "Ingérer un document",
          description: "Chunk + embeddings + archive HF Bucket ; recherche hybride prête.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["title", "content"],
                  properties: { title: { type: "string" }, content: { type: "string" }, source_type: { type: "string", enum: ["TEXT", "FILE", "URL"] } },
                },
              },
            },
          },
          responses: {
            200: { description: "Document indexé (réponse standard)", content: { "application/json": { schema: { type: "object" } } } },
            201: { description: "Document indexé (création)", content: { "application/json": { schema: { type: "object" } } } },
          },
        },
        put: {
          tags: ["Intelligence"],
          summary: "Recherche RAG hybride",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["query"],
                  properties: { query: { type: "string" }, top_k: { type: "integer", default: 5, minimum: 1, maximum: 20 } },
                },
              },
            },
          },
          responses: { 200: { description: "Morceaux pertinents scorés", content: { "application/json": { schema: { type: "object" } } } } },
        },
      },
      "/api/v1/jobs": {
        get: {
          tags: ["Compute"],
          summary: "Jobs HF (statut/liste)",
          parameters: [
            { name: "id", in: "query", schema: { type: "string" }, description: "Statut d'un job précis" },
            { name: "status", in: "query", schema: { type: "string", enum: ["PENDING", "RUNNING", "COMPLETED", "FAILED", "CANCELLED"] } },
          ],
          responses: { 200: { description: "Job(s)", content: { "application/json": { schema: { type: "object" } } } } },
        },
        post: {
          tags: ["Compute"],
          summary: "Soumettre un job long",
          description: "embeddings-batch, batch-inference, fine-tuning… (worker BullMQ/asynchrone — jamais dans la requête).",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["kind"],
                  properties: {
                    kind: { type: "string", enum: ["preprocessing", "embeddings-batch", "dataset-generation", "evaluation", "fine-tuning", "conversion", "batch-inference", "media-processing"] },
                    parameters: { type: "object", additionalProperties: true },
                    input_path: { type: "string", description: "Chemin Bucket des entrées" },
                    idempotency_key: { type: "string", description: "Clé d'idempotence" },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: "Job accepté (traité)", content: { "application/json": { schema: { type: "object" } } } },
            202: { description: "Job accepté (asynchrone)", content: { "application/json": { schema: { type: "object" } } } },
            401: { description: "Clé API invalide", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          },
        },
        patch: {
          tags: ["Compute"],
          summary: "Actions job (cancel/poll/drain)",
          responses: { 200: { description: "Résultat de l'action", content: { "application/json": { schema: { type: "object" } } } } },
        },
      },
    },
  }
}
