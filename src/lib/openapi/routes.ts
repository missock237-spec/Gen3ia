// ============================================================
// Gen3ia — Enregistrement de toutes les routes API
// Chaque route déclare ses schémas Zod pour la doc OpenAPI
// ============================================================

import { openApiRegistry } from './openapi-registry';
import {
  registerSchema,
  loginSchema,
  executeAgentSchema,
  createAgentSchema,
  createWorkflowSchema,
  subscribeSchema,
  createApiKeySchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from '@/lib/validation';
import { z } from 'zod';

// ============================================================
// SCHÉMAS PARTAGÉS
// ============================================================

const UserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string().nullable(),
  role: z.string(),
  plan: z.string(),
  credits: z.number().int(),
  isActive: z.boolean(),
  createdAt: z.string(),
});

const SuccessResponse = z.object({
  success: z.boolean(),
  message: z.string().optional(),
});

const ErrorResponse = z.object({
  error: z.string(),
  details: z.array(z.any()).optional(),
});

// Enregistrer les schémas partagés
openApiRegistry.registerSchema('User', UserSchema);
openApiRegistry.registerSchema('SuccessResponse', SuccessResponse);
openApiRegistry.registerSchema('ErrorResponse', ErrorResponse);
openApiRegistry.registerSchema('RegisterInput', registerSchema);
openApiRegistry.registerSchema('LoginInput', loginSchema);
openApiRegistry.registerSchema('ExecuteAgentInput', executeAgentSchema);
openApiRegistry.registerSchema('CreateAgentInput', createAgentSchema);

// ============================================================
// AUTH — /api/auth/*
// ============================================================

openApiRegistry.register({
  method: 'POST',
  path: '/api/auth/register',
  summary: 'Inscription utilisateur',
  description: 'Crée un nouveau compte utilisateur avec email et mot de passe. Le mot de passe est haché avec Argon2id.',
  tags: ['Auth'],
  bodySchema: registerSchema,
  responseSchema: z.object({
    accessToken: z.string(),
    refreshToken: z.string(),
    user: UserSchema,
  }),
  responseStatus: 201,
  examples: [
    {
      email: 'user@example.com',
      password: 'Str0ng!Pass',
      name: 'Jean Dupont',
    },
  ],
});

openApiRegistry.register({
  method: 'POST',
  path: '/api/auth/login',
  summary: 'Connexion utilisateur',
  description: 'Authentifie un utilisateur et retourne un access token (15 min) + refresh token (7 jours). Utilisez le refresh token pour obtenir de nouveaux tokens avant expiration.',
  tags: ['Auth'],
  bodySchema: loginSchema,
  responseSchema: z.object({
    accessToken: z.string(),
    refreshToken: z.string(),
    expiresIn: z.number().int(),
    user: UserSchema,
  }),
  examples: [
    {
      email: 'user@example.com',
      password: 'Str0ng!Pass',
    },
  ],
});

openApiRegistry.register({
  method: 'POST',
  path: '/api/auth/refresh',
  summary: 'Rafraîchir les tokens',
  description: 'Échange un refresh token valide contre un nouveau couple access + refresh token. L\'ancien refresh token est blacklisté (rotation).',
  tags: ['Auth'],
  bodySchema: z.object({
    refreshToken: z.string(),
  }),
  responseSchema: z.object({
    accessToken: z.string(),
    refreshToken: z.string(),
    expiresIn: z.number().int(),
  }),
  requiresAuth: false,
  rateLimit: { max: 20, windowMs: 60000 },
});

openApiRegistry.register({
  method: 'POST',
  path: '/api/auth/logout',
  summary: 'Déconnexion',
  description: 'Blackliste le refresh token et supprime la session en base de données.',
  tags: ['Auth'],
  bodySchema: z.object({
    refreshToken: z.string(),
  }),
  responseSchema: SuccessResponse,
});

openApiRegistry.register({
  method: 'POST',
  path: '/api/auth/forgot-password',
  summary: 'Mot de passe oublié',
  tags: ['Auth'],
  bodySchema: forgotPasswordSchema,
  responseSchema: SuccessResponse,
});

openApiRegistry.register({
  method: 'POST',
  path: '/api/auth/reset-password',
  summary: 'Réinitialiser le mot de passe',
  tags: ['Auth'],
  bodySchema: resetPasswordSchema,
  responseSchema: SuccessResponse,
});

openApiRegistry.register({
  method: 'GET',
  path: '/api/auth/me',
  summary: 'Profil utilisateur',
  tags: ['Auth'],
  responseSchema: UserSchema,
  requiresAuth: true,
});

openApiRegistry.register({
  method: 'GET',
  path: '/api/auth/sessions',
  summary: 'Liste des sessions actives',
  tags: ['Auth'],
  responseSchema: z.object({
    sessions: z.array(z.object({
      id: z.string(),
      createdAt: z.string(),
      lastAccessedAt: z.string(),
      ipAddress: z.string(),
      userAgent: z.string().nullable(),
      current: z.boolean(),
    })),
  }),
  requiresAuth: true,
});

openApiRegistry.register({
  method: 'DELETE',
  path: '/api/auth/sessions',
  summary: 'Révoquer une session',
  tags: ['Auth'],
  bodySchema: z.object({
    sessionId: z.string(),
  }),
  responseSchema: SuccessResponse,
  requiresAuth: true,
});

// ============================================================
// AGENTS — /api/agents/*
// ============================================================

openApiRegistry.register({
  method: 'POST',
  path: '/api/agents/run',
  summary: 'Exécuter un agent IA',
  description: 'Lance l\'exécution d\'un agent en boucle ReAct (Think → Act → Observe). Consomme des crédits. Supporte le checkpointing et la reprise de session.',
  tags: ['Agents'],
  bodySchema: executeAgentSchema,
  responseSchema: z.object({
    success: z.boolean(),
    sessionId: z.string(),
    steps: z.number().int(),
    totalCost: z.number(),
    totalTokens: z.number().int(),
    output: z.string(),
    thoughts: z.array(z.string()),
    creditsCharged: z.number().int(),
    stoppedBy: z.string().nullable(),
  }),
  requiresAuth: true,
  rateLimit: { max: 30, windowMs: 60000 },
  examples: [
    {
      agentId: 'agent_abc123',
      input: 'Quelle est la capitale du Cameroun ?',
    },
  ],
});

openApiRegistry.register({
  method: 'GET',
  path: '/api/agents',
  summary: 'Lister les agents',
  tags: ['Agents'],
  responseSchema: z.object({
    agents: z.array(z.any()),
  }),
  requiresAuth: true,
});

openApiRegistry.register({
  method: 'POST',
  path: '/api/agents',
  summary: 'Créer un agent',
  tags: ['Agents'],
  bodySchema: createAgentSchema,
  responseSchema: z.object({
    id: z.string(),
    name: z.string(),
  }),
  requiresAuth: true,
  examples: [
    {
      name: 'Assistant Support',
      type: 'support',
      description: 'Agent de support client automatique',
    },
  ],
});

// ============================================================
// WORKFLOWS — /api/workflows/*
// ============================================================

openApiRegistry.register({
  method: 'POST',
  path: '/api/workflows',
  summary: 'Créer un workflow',
  description: 'Crée un workflow multi-étapes avec dépendances entre les étapes.',
  tags: ['Workflows'],
  bodySchema: createWorkflowSchema,
  responseSchema: z.object({
    id: z.string(),
    name: z.string(),
  }),
  requiresAuth: true,
});

// ============================================================
// CRÉDITS & PAIEMENTS — /api/payments/*
// ============================================================

openApiRegistry.register({
  method: 'GET',
  path: '/api/payments/plans',
  summary: 'Liste des plans',
  description: 'Retourne les 4 plans disponibles (Free, Starter, Pro, Enterprise) avec leurs crédits, prix et fonctionnalités.',
  tags: ['Crédits'],
  responseSchema: z.object({
    success: z.boolean(),
    data: z.array(z.object({
      id: z.string(),
      name: z.string(),
      price: z.number(),
      credits: z.number().int(),
      maxAgents: z.union([z.number().int(), z.string()]),
      features: z.array(z.string()),
    })),
  }),
});

openApiRegistry.register({
  method: 'POST',
  path: '/api/payments/subscribe',
  summary: 'S\'abonner',
  description: 'Initie un abonnement via SebPay (Mobile Money Afrique).',
  tags: ['Paiements'],
  bodySchema: subscribeSchema,
  responseSchema: z.object({
    success: z.boolean(),
    transactionId: z.string(),
    paymentUrl: z.string().optional(),
    message: z.string(),
  }),
  requiresAuth: true,
});

openApiRegistry.register({
  method: 'POST',
  path: '/api/payments/webhook',
  summary: 'Webhook de paiement SebPay',
  description: 'Reçoit les notifications de paiement de SebPay. La signature HMAC SHA-256 est vérifiée avec le secret configuré.',
  tags: ['Paiements'],
  headers: ['X-SebPay-Signature'],
  bodySchema: z.object({
    event: z.string(),
    transaction_id: z.string(),
    reference: z.string(),
    status: z.string(),
    amount: z.number(),
    currency: z.string(),
  }),
  responseSchema: z.object({
    received: z.boolean(),
  }),
});

openApiRegistry.register({
  method: 'POST',
  path: '/api/payments/checkout',
  summary: 'Initier un checkout',
  description: 'Crée une transaction d\'achat de crédits ou de plan d\'abonnement.',
  tags: ['Crédits'],
  requiresAuth: true,
  bodySchema: z.object({
    type: z.enum(['plan', 'credits']),
    id: z.string(),
  }),
  responseSchema: z.object({
    success: z.boolean(),
    url: z.string().optional(),
    transactionId: z.string().optional(),
  }),
});

// ============================================================
// WEBHOOKS — /api/webhooks/*
// ============================================================

openApiRegistry.register({
  method: 'GET',
  path: '/api/webhooks',
  summary: 'Lister les webhooks',
  tags: ['Webhooks'],
  requiresAuth: true,
  responseSchema: z.object({
    success: z.boolean(),
    data: z.array(z.any()),
  }),
});

openApiRegistry.register({
  method: 'POST',
  path: '/api/webhooks',
  summary: 'Créer un webhook sortant',
  description: 'Crée un endpoint de webhook qui sera appelé lors des événements configurés.',
  tags: ['Webhooks'],
  requiresAuth: true,
  bodySchema: z.object({
    name: z.string(),
    url: z.string().url(),
    events: z.array(z.string()).optional(),
    secret: z.string().optional(),
    timeoutMs: z.number().int().optional(),
  }),
  responseSchema: z.object({
    success: z.boolean(),
    data: z.object({
      name: z.string(),
      url: z.string(),
      events: z.array(z.string()),
      secret: z.string(),
    }),
    warning: z.string(),
  }),
});

openApiRegistry.register({
  method: 'POST',
  path: '/api/webhooks/emit',
  summary: 'Émettre un événement webhook',
  tags: ['Webhooks'],
  requiresAuth: true,
  bodySchema: z.object({
    eventType: z.string(),
    userId: z.string(),
// @ts-ignore — type narrowing pending, see refactor ticket
    data: z.record(z.any()),
  }),
  responseSchema: SuccessResponse,
});

// ============================================================
// TERMINAL — /api/terminal/*
// ============================================================

openApiRegistry.register({
  method: 'POST',
  path: '/api/terminal/execute',
  summary: 'Exécuter une commande terminal',
  description: 'Exécute une commande bash dans le terminal intelligent. Ne consomme pas de crédits.',
  tags: ['Terminal'],
  requiresAuth: true,
  bodySchema: z.object({
    command: z.string().max(1000),
    userId: z.string(),
    sudo: z.boolean().optional(),
  }),
  responseSchema: z.object({
    success: z.boolean(),
    output: z.string(),
    error: z.string().optional(),
    exitCode: z.number().int(),
  }),
});

// ============================================================
// MÉMOIRE & RAG — /api/memory/*, /api/rag/*
// ============================================================

openApiRegistry.register({
  method: 'POST',
  path: '/api/rag/retrieve',
  summary: 'Recherche RAG',
  description: 'Recherche hybride (vectorielle + BM25) dans les documents de la base de connaissances.',
  tags: ['Mémoire'],
  requiresAuth: true,
  bodySchema: z.object({
    query: z.string().min(1).max(500),
    topK: z.number().int().min(1).max(50).default(5),
    useReranking: z.boolean().default(true),
    documentId: z.string().optional(),
  }),
  responseSchema: z.object({
    results: z.array(z.object({
      content: z.string(),
      source: z.string(),
      score: z.number(),
    })),
  }),
});

// ============================================================
// MONITORING — /api/metrics, /api/health
// ============================================================

openApiRegistry.register({
  method: 'GET',
  path: '/api/health',
  summary: 'Health check',
  description: 'Vérifie l\'état de santé du service. Retourne le statut de la base de données, Redis, Qdrant et les dépendances externes.',
  tags: ['Monitoring'],
  responseSchema: z.object({
    status: z.string(),
    uptime: z.number(),
    database: z.string(),
    redis: z.string().optional(),
    version: z.string(),
    timestamp: z.string(),
  }),
});

openApiRegistry.register({
  method: 'GET',
  path: '/api/metrics',
  summary: 'Métriques Prometheus',
  description: 'Endpoint Prometheus exposant les métriques de l\'application au format texte. Utilisé par Prometheus pour le scraping.',
  tags: ['Monitoring'],
  responseSchema: z.object({
    // Retourne du texte/plain, pas du JSON
  }),
});

// ============================================================
// API KEYS — /api/keys/*
// ============================================================

openApiRegistry.register({
  method: 'POST',
  path: '/api/keys',
  summary: 'Créer une clé API',
  tags: ['Admin'],
  requiresAuth: true,
  roles: ['admin', 'user'],
  bodySchema: createApiKeySchema,
  responseSchema: z.object({
    id: z.string(),
    name: z.string(),
    key: z.string(),
    scopes: z.string(),
  }),
});

// ============================================================
// TASKS (BullMQ) — /api/tasks/*
// ============================================================

openApiRegistry.register({
  method: 'POST',
  path: '/api/tasks',
  summary: 'Créer une tâche',
  tags: ['Workflows'],
  requiresAuth: true,
  bodySchema: z.object({
    title: z.string(),
    description: z.string().optional(),
    priority: z.enum(['low', 'medium', 'high']).default('medium'),
    agentId: z.string().optional(),
  }),
  responseSchema: z.object({
    id: z.string(),
    title: z.string(),
  }),
});

// ============================================================
// ADMIN / AGENTS - endpoints additionnels
// ============================================================

openApiRegistry.register({
  method: 'GET',
  path: '/api/agents/run/{id}',
  summary: 'Statut d\'exécution',
  tags: ['Agents'],
  requiresAuth: true,
  pathSchema: z.object({ id: z.string() }),
  responseSchema: z.object({
    id: z.string(),
    status: z.string(),
    result: z.any().nullable(),
  }),
});

openApiRegistry.register({
  method: 'GET',
  path: '/api/admin/stats',
  summary: 'Statistiques administrateur',
  tags: ['Admin'],
  requiresAuth: true,
  roles: ['admin'],
  responseSchema: z.object({
    totalUsers: z.number().int(),
    totalExecutions: z.number().int(),
    totalCreditsUsed: z.number(),
    activeSubscriptions: z.number().int(),
    recentErrors: z.number().int(),
  }),
});

// @ts-ignore — type narrowing pending, see refactor ticket
log.info('Routes OpenAPI enregistrées', { count: openApiRegistry.getRoutes().length });

function log(message: string, context?: Record<string, unknown>) {
  // Simple logger console - pas besoin d'importer le logger pour éviter les circular deps
  console.log(`[OpenAPI] ${message}`, context || '');
}
