// ============================================================
// GET /api/docs — Documentation API Swagger/OpenAPI
// ============================================================
// Génère automatiquement la spec OpenAPI pour les 58 endpoints
// ============================================================
import { NextResponse } from "next/server";





export const dynamic = "force-dynamic";
const apiDocs = {
  openapi: "3.0.3",
  info: {
    title: "Genova API",
    version: "1.0.0",
    description: "🤖 Genova AI Agent Operating System — API REST complète pour agents IA autonomes, workflows et paiements Mobile Money.",
    contact: {
      name: "Genova Team",
      email: "support@genova.ai",
      url: "https://github.com/missock237-spec/Genova",
    },
    license: {
      name: "MIT",
      url: "https://github.com/missock237-spec/Genova/blob/main/LICENSE",
    },
  },
  servers: [
    { url: "http://localhost:3000", description: "Développement local" },
  ],
  security: [
    { bearerAuth: [] },
    { apiKey: [] },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description: "Token de session (connexion)",
      },
      apiKey: {
        type: "apiKey",
        in: "header",
        name: "x-api-key",
        description: "Clé API pour accès machine-to-machine",
      },
    },
    schemas: {
      Error: {
        type: "object",
        properties: {
          success: { type: "boolean", example: false },
          error: {
            type: "object",
            properties: {
              code: { type: "string", example: "NOT_FOUND" },
              message: { type: "string", example: "Agent introuvable" },
            },
          },
        },
      },
      HealthResponse: {
        type: "object",
        properties: {
          status: { type: "string", example: "healthy" },
          version: { type: "string", example: "1.0.0" },
          timestamp: { type: "string", format: "date-time" },
          checks: {
            type: "object",
            properties: {
              database: { type: "object", properties: { status: { type: "string" } } },
              redis: { type: "object", properties: { status: { type: "string" } } },
            },
          },
        },
      },
      ExecuteAgentInput: {
        type: "object",
        required: ["agentId", "input"],
        properties: {
          agentId: { type: "string", description: "ID de l'agent" },
          input: { type: "string", description: "Message pour l'agent", maxLength: 10000 },
          sessionId: { type: "string", description: "Session existante (reprise)" },
          resume: { type: "boolean", description: "Reprendre une session", default: false },
        },
      },
      SubscribeInput: {
        type: "object",
        required: ["planId", "phone", "operator", "userId"],
        properties: {
          planId: { type: "string", enum: ["free", "starter", "pro", "enterprise"] },
          phone: { type: "string", example: "+237691234567" },
          operator: { type: "string", enum: ["orange", "mtn", "airtel", "moov"] },
          userId: { type: "string" },
        },
      },
    },
  },
  paths: {
    "/api/health": {
      get: {
        tags: ["Système"],
        summary: "État du service",
        responses: { "200": { description: "Service en bonne santé" } },
      },
    },
    "/api/metrics": {
      get: {
        tags: ["Système"],
        summary: "Métriques Prometheus",
        responses: { "200": { description: "Métriques collectées" } },
      },
    },
    "/api/docs": {
      get: {
        tags: ["Système"],
        summary: "Documentation API",
        responses: { "200": { description: "Spec OpenAPI complète" } },
      },
    },
    "/api/agents/run": {
      post: {
        tags: ["Agents"],
        summary: "Exécuter un agent (ReAct Loop)",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/ExecuteAgentInput" } } },
        },
        responses: {
          "200": { description: "Agent exécuté" },
          "400": { description: "Données invalides", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          "402": { description: "Crédits insuffisants" },
          "404": { description: "Agent introuvable" },
          "429": { description: "Trop de requêtes" },
        },
      },
    },
    "/api/payments/plans": {
      get: {
        tags: ["Paiements"],
        summary: "Plans d'abonnement",
        responses: { "200": { description: "Plans récupérés" } },
      },
    },
    "/api/payments/subscribe": {
      post: {
        tags: ["Paiements"],
        summary: "S'abonner (Mobile Money)",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/SubscribeInput" } } },
        },
        responses: {
          "200": { description: "Paiement initié" },
          "400": { description: "Données invalides" },
          "502": { description: "Erreur SebPay" },
        },
      },
    },
    "/api/payments/webhook": {
      post: {
        tags: ["Paiements"],
        summary: "Webhook SebPay",
        responses: { "200": { description: "Webhook reçu" } },
      },
    },
    "/api/admin/supervision": {
      get: {
        tags: ["Administration"],
        summary: "Dashboard supervision",
        responses: { "200": { description: "Données de supervision" } },
      },
    },
  },
  tags: [
    { name: "Système", description: "Monitoring et documentation" },
    { name: "Agents", description: "Gestion et exécution des agents IA" },
    { name: "Paiements", description: "Abonnements Mobile Money" },
    { name: "Administration", description: "Endpoints réservés aux admins" },
  ],
};

export async function GET() {
  return NextResponse.json(apiDocs);
}