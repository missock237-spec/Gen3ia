#!/usr/bin/env tsx
/**
 * Générateur de documentation OpenAPI 3.1
 * Scanne les routes API et génère un fichier openapi.json
 * 
 * Usage: npx tsx scripts/generate-openapi.ts
 */

import * as fs from 'fs';
import * as path from 'path';

const API_DIR = path.join(process.cwd(), 'src', 'app', 'api');
const OUTPUT = path.join(process.cwd(), 'public', 'openapi.json');

interface OpenAPISpec {
  openapi: string;
  info: {
    title: string;
    version: string;
    description: string;
    contact: { name: string; email: string; url: string };
  };
  servers: { url: string; description: string }[];
  paths: Record<string, any>;
  components: {
    securitySchemes: Record<string, any>;
    schemas: Record<string, any>;
  };
  tags: { name: string; description: string }[];
}

const spec: OpenAPISpec = {
  openapi: '3.1.0',
  info: {
    title: 'Gen3ia API',
    version: '0.10.0',
    description: `
API REST de Gen3ia — AI Agent Operating System

## Authentification

La plupart des endpoints nécessitent un token JWT dans le header "Authorization: Bearer TOKEN".

## Paiements

Les paiements se font via **SebPay** (Mobile Money Afrique) :
- Orange Money, MTN MoMo, Wave, Carte Bancaire
- Monnaie : XAF (Francs CFA)

## Erreurs

Les erreurs suivent le format JSON : \`{ "error": "message" }\`
    `.trim(),
    contact: { name: 'Gen3ia Team', email: 'dev@gen3ia.ai', url: 'https://gen3ia.ai' },
  },
  servers: [
    { url: 'http://localhost:3000', description: 'Développement local' },
    { url: 'https://gen3ia-app.onrender.com', description: 'Production (Render)' },
  ],
  paths: {},
  components: {
    securitySchemes: {
      BearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Token JWT (généré après connexion)',
      },
    },
    schemas: {
      Error: {
        type: 'object',
        properties: {
          error: { type: 'string', description: "Message d'erreur" },
        },
      },
      HealthResponse: {
        type: 'object',
        properties: {
          status: { type: 'string', example: 'ok' },
          uptime: { type: 'number', example: 12345.67 },
          timestamp: { type: 'string', format: 'date-time' },
          version: { type: 'string', example: '0.10.0' },
        },
      },
      Plan: {
        type: 'object',
        properties: {
          id: { type: 'string', example: 'pro' },
          name: { type: 'string', example: 'Pro' },
          price: { type: 'number', example: 15000 },
          credits: { type: 'number', example: 5000 },
          priceLabel: { type: 'string', example: '15 000 FCFA/mois' },
        },
      },
      Subscription: {
        type: 'object',
        properties: {
          plan: { type: 'string', example: 'pro' },
          status: { type: 'string', example: 'active' },
          currentPeriodEnd: { type: 'string', format: 'date-time', nullable: true },
          cancelAtPeriodEnd: { type: 'boolean' },
        },
      },
      CreditTransaction: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          type: { type: 'string', enum: ['credit', 'debit', 'purchase', 'bonus', 'pending'] },
          amount: { type: 'number' },
          description: { type: 'string' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      BillingData: {
        type: 'object',
        properties: {
          subscription: { '$ref': '#/components/schemas/Subscription' },
          invoices: { type: 'array', items: { type: 'object' } },
          creditTransactions: { type: 'array', items: { '$ref': '#/components/schemas/CreditTransaction' } },
          credits: {
            type: 'object',
            properties: {
              balance: { type: 'number' },
              used: { type: 'number' },
              total: { type: 'number' },
              expiresAt: { type: 'string', nullable: true },
            },
          },
          availablePlans: { type: 'array', items: { '$ref': '#/components/schemas/Plan' } },
        },
      },
      CheckoutResponse: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'URL de redirection SebPay' },
          transactionId: { type: 'string' },
          reference: { type: 'string' },
          success: { type: 'boolean' },
          message: { type: 'string' },
        },
      },
      CreditPurchaseResponse: {
        type: 'object',
        properties: {
          packs: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                credits: { type: 'number' },
                price: { type: 'number' },
                currency: { type: 'string' },
                label: { type: 'string' },
                priceLabel: { type: 'string' },
              },
            },
          },
        },
      },
      SebPayPaymentRequest: {
        type: 'object',
        required: ['amount', 'phone', 'operator'],
        properties: {
          amount: { type: 'number', description: 'Montant en XAF', example: 15000 },
          currency: { type: 'string', enum: ['XAF', 'XOF', 'EUR', 'USD'], default: 'XAF' },
          phone: { type: 'string', example: '691234567' },
          operator: { type: 'string', enum: ['ORANGE_MONEY', 'MTN_MOMO', 'WAVE', 'CARTE_BANCAIRE'], example: 'ORANGE_MONEY' },
          description: { type: 'string', example: 'Achat credits Gen3ia' },
        },
      },
    },
  },
  tags: [
    { name: 'Health', description: "Points de terminaison de santé du service" },
    { name: 'Agents', description: "Gestion et exécution des agents IA" },
    { name: 'Billing', description: "Facturation, abonnements et crédits" },
    { name: 'Payments', description: "Paiements SebPay (Mobile Money Afrique)" },
    { name: 'Terminal', description: "Terminal intelligent avec exécution bash" },
    { name: 'Auth', description: "Authentification et sessions" },
    { name: 'Voice', description: "Appels vocaux IA via Twilio" },
    { name: 'MCP', description: "Model Context Protocol — Serveurs MCP" },
  ],
};

// ============================================================
// Définition manuelle des routes API
// ============================================================

function addPath(method: string, path: string, operation: any) {
  if (!spec.paths[path]) spec.paths[path] = {};
  spec.paths[path][method.toLowerCase()] = operation;
}

// Health
addPath('GET', '/api/health', {
  tags: ['Health'],
  summary: 'Vérifier l\'état du service',
  responses: { '200': { description: 'Service en bonne santé', content: { 'application/json': { schema: { '$ref': '#/components/schemas/HealthResponse' } } } } },
});

addPath('GET', '/api/metrics', {
  tags: ['Health'],
  summary: 'Métriques Prometheus',
  responses: { '200': { description: 'Métriques au format Prometheus' } },
});

// Billing
addPath('GET', '/api/billing', {
  tags: ['Billing'],
  summary: 'Informations de facturation',
  description: 'Abonnement, crédits, factures, transactions',
  security: [{ BearerAuth: [] }],
  responses: {
    '200': { description: 'Données de facturation', content: { 'application/json': { schema: { '$ref': '#/components/schemas/BillingData' } } } },
    '401': { description: 'Non authentifié', content: { 'application/json': { schema: { '$ref': '#/components/schemas/Error' } } } },
  },
});

addPath('GET', '/api/billing/credits', {
  tags: ['Billing'],
  summary: 'Solde et historique des crédits',
  security: [{ BearerAuth: [] }],
  responses: { '200': { description: 'Solde et transactions' } },
});

addPath('GET', '/api/billing/purchase-credits', {
  tags: ['Billing'],
  summary: 'Liste des packs de crédits disponibles',
  responses: { '200': { description: 'Packs de crédits', content: { 'application/json': { schema: { '$ref': '#/components/schemas/CreditPurchaseResponse' } } } } },
});

addPath('POST', '/api/billing/purchase-credits', {
  tags: ['Billing'],
  summary: 'Acheter des crédits via SebPay',
  security: [{ BearerAuth: [] }],
  requestBody: {
    required: true,
    content: {
      'application/json': {
        schema: {
          type: 'object',
          properties: {
            packId: { type: 'string', example: 'credits_500' },
            phone: { type: 'string', example: '691234567' },
            operator: { type: 'string', enum: ['ORANGE_MONEY', 'MTN_MOMO', 'WAVE'] },
          },
        },
      },
    },
  },
  responses: { '200': { description: 'Paiement initié', content: { 'application/json': { schema: { '$ref': '#/components/schemas/CheckoutResponse' } } } } },
});

addPath('POST', '/api/billing/webhook', {
  tags: ['Billing'],
  summary: 'Webhook SebPay (paiements)',
  description: "Endpoint appelé par SebPay pour notifier les statuts de paiement. Vérifie la signature HMAC SHA-256.",
  responses: { '200': { description: 'Webhook reçu' } },
});

addPath('POST', '/api/billing/checkout', {
  tags: ['Billing'],
  summary: "Initier l'achat d'un plan",
  security: [{ BearerAuth: [] }],
  requestBody: {
    required: true,
    content: {
      'application/json': {
        schema: {
          type: 'object',
          properties: {
            planId: { type: 'string', example: 'pro' },
            phone: { type: 'string' },
            operator: { type: 'string' },
          },
        },
      },
    },
  },
  responses: { '200': { description: 'Paiement initié' } },
});

// Payments
addPath('POST', '/api/payments/checkout', {
  tags: ['Payments'],
  summary: 'Initier un paiement SebPay (Mobile Money)',
  security: [{ BearerAuth: [] }],
  requestBody: {
    required: true,
    content: {
      'application/json': {
        schema: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['plan', 'credits'] },
            id: { type: 'string', example: 'pro' },
            phone: { type: 'string', example: '691234567' },
            operator: { type: 'string', enum: ['ORANGE_MONEY', 'MTN_MOMO', 'WAVE', 'CARTE_BANCAIRE'] },
          },
          required: ['type', 'id'],
        },
      },
    },
  },
  responses: {
    '200': { description: 'Paiement initié', content: { 'application/json': { schema: { '$ref': '#/components/schemas/CheckoutResponse' } } } },
    '401': { description: 'Non authentifié' },
  },
});

addPath('POST', '/api/payments/webhook', {
  tags: ['Payments'],
  summary: 'Webhook SebPay',
  description: 'Reçoit les notifications de confirmation de paiement de SebPay',
  responses: { '200': { description: 'Webhook traité' } },
});

addPath('POST', '/api/payments/subscribe', {
  tags: ['Payments'],
  summary: "S'abonner à un plan",
  security: [{ BearerAuth: [] }],
  requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { planId: { type: 'string' }, phone: { type: 'string' }, operator: { type: 'string' } } } } } },
  responses: { '200': { description: 'Abonnement initié' } },
});

addPath('GET', '/api/payments/plans', {
  tags: ['Payments'],
  summary: 'Liste des plans disponibles',
  responses: { '200': { description: 'Plans disponibles' } },
});

// Agents
addPath('POST', '/api/agents/run', {
  tags: ['Agents'],
  summary: 'Exécuter un agent IA (boucle ReAct)',
  security: [{ BearerAuth: [] }],
  requestBody: {
    required: true,
    content: {
      'application/json': {
        schema: {
          type: 'object',
          properties: {
            agentId: { type: 'string' },
            prompt: { type: 'string', example: 'Crée un résumé des dernières tendances IA' },
            stream: { type: 'boolean', default: false },
          },
          required: ['agentId', 'prompt'],
        },
      },
    },
  },
  responses: {
    '200': { description: 'Réponse de l\'agent' },
    '402': { description: 'Crédits insuffisants' },
  },
});

addPath('GET', '/api/agents', {
  tags: ['Agents'],
  summary: 'Liste des agents',
  security: [{ BearerAuth: [] }],
  responses: { '200': { description: 'Liste des agents' } },
});

addPath('POST', '/api/agents', {
  tags: ['Agents'],
  summary: 'Créer un agent',
  security: [{ BearerAuth: [] }],
  requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { name: { type: 'string' }, type: { type: 'string' }, description: { type: 'string' } } } } } },
  responses: { '200': { description: 'Agent créé' } },
});

// Terminal
addPath('POST', '/api/terminal/execute', {
  tags: ['Terminal'],
  summary: 'Exécuter une commande dans le terminal',
  security: [{ BearerAuth: [] }],
  requestBody: {
    required: true,
    content: { 'application/json': { schema: { type: 'object', properties: { command: { type: 'string', example: 'ls -la' }, cwd: { type: 'string' } }, required: ['command'] } } },
  },
  responses: { '200': { description: 'Résultat de la commande' } },
});

addPath('GET', '/api/terminal/events', {
  tags: ['Terminal'],
  summary: 'Événements SSE du terminal (temps réel)',
  security: [{ BearerAuth: [] }],
  responses: { '200': { description: 'Flux SSE' } },
});

// Voice
addPath('POST', '/api/voice/call', {
  tags: ['Voice'],
  summary: 'Lancer un appel vocal IA',
  security: [{ BearerAuth: [] }],
  requestBody: {
    required: true,
    content: { 'application/json': { schema: { type: 'object', properties: { toNumber: { type: 'string' }, agentId: { type: 'string' }, context: { type: 'string' } } } } },
  },
  responses: { '200': { description: 'Appel initié' } },
});

// MCP
addPath('POST', '/api/mcp/connectors', {
  tags: ['MCP'],
  summary: 'Créer un connecteur MCP',
  security: [{ BearerAuth: [] }],
  requestBody: {
    required: true,
    content: { 'application/json': { schema: { type: 'object', properties: { name: { type: 'string' }, serverUrl: { type: 'string' }, authType: { type: 'string' } } } } },
  },
  responses: { '200': { description: 'Connecteur créé' } },
});

addPath('GET', '/api/mcp/connectors', {
  tags: ['MCP'],
  summary: 'Lister les connecteurs MCP',
  security: [{ BearerAuth: [] }],
  responses: { '200': { description: 'Liste des connecteurs' } },
});

// Ici on pourrait ajouter une détection automatique des routes
// en scannant le filesystem, mais pour l'instant on liste
// manuellement les 30+ endpoints principaux

try {
  // Créer le dossier public s\'il n\'existe pas
  const publicDir = path.join(process.cwd(), 'public');
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }
  
  fs.writeFileSync(OUTPUT, JSON.stringify(spec, null, 2), 'utf-8');
  // eslint-disable-next-line no-console
  console.log(`✅ OpenAPI spec générée: ${OUTPUT}`);
  // eslint-disable-next-line no-console
  console.log(`   Endpoints documentés: ${Object.keys(spec.paths).length}`);
} catch (err) {
  console.error('❌ Erreur lors de la génération:', err);
  process.exit(1);
}
