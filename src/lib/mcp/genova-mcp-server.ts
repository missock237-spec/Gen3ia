/**
 * Genova MCP Server
 *
 * Expose Genova en tant que serveur MCP (Model Context Protocol)
 * pour connexion depuis Cursor, Claude Desktop, Windsurf, etc.
 *
 * Endpoint: GET /api/mcp (SSE)
 *           POST /api/mcp (JSON-RPC)
 */

import { db } from '@/lib/db';
import { createLogger } from '@/lib/logger';
import { createHash, randomBytes } from 'crypto';

const log = createLogger('genova-mcp');

// ============================================================
// Types MCP
// ============================================================

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface MCPResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface MCPPrompt {
  name: string;
  description: string;
  arguments?: { name: string; description: string; required?: boolean }[];
}

interface JSONRPCRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

interface JSONRPCResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: unknown;
  error?: { code: number; message: string };
}

// ============================================================
// Outils Genova exposés via MCP
// ============================================================

const GENOVA_TOOLS: MCPTool[] = [
  {
    name: 'genova_list_agents',
    description: 'Liste tous les agents AI de votre compte Genova',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', description: 'Filtrer par statut (active, inactive)' },
      },
    },
  },
  {
    name: 'genova_get_agent',
    description: 'Récupère les détails d\'un agent AI spécifique',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'string', description: 'ID de l\'agent' },
      },
      required: ['agentId'],
    },
  },
  {
    name: 'genova_execute_agent',
    description: 'Exécute une tâche sur un agent AI',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'string', description: 'ID de l\'agent' },
        task: { type: 'string', description: 'Description de la tâche à exécuter' },
      },
      required: ['agentId', 'task'],
    },
  },
  {
    name: 'genova_list_workflows',
    description: 'Liste tous vos workflows Genova',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'genova_list_conversations',
    description: 'Liste toutes vos conversations Genova',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Nombre maximum de conversations (défaut: 20)' },
      },
    },
  },
  {
    name: 'genova_get_credits',
    description: 'Vérifie votre solde de crédits Genova',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'genova_create_agent',
    description: 'Crée un nouvel agent AI dans Genova',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Nom de l\'agent' },
        type: { type: 'string', description: 'Type d\'agent (assistant, coder, researcher, etc.)' },
        description: { type: 'string', description: 'Description de l\'agent' },
      },
      required: ['name', 'type'],
    },
  },
  {
    name: 'genova_search_memory',
    description: 'Recherche dans la mémoire d\'un agent',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'string', description: 'ID de l\'agent' },
        query: { type: 'string', description: 'Texte à rechercher' },
        category: { type: 'string', description: 'Catégorie (optionnelle)' },
      },
      required: ['agentId', 'query'],
    },
  },
  {
    name: 'genova_get_usage',
    description: 'Récupère les statistiques d\'utilisation de votre compte',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];

const GENOVA_RESOURCES: MCPResource[] = [
  { uri: 'genova://account/profile', name: 'Profil utilisateur', description: 'Votre profil Genova', mimeType: 'application/json' },
  { uri: 'genova://account/credits', name: 'Solde crédits', description: 'Votre solde de crédits', mimeType: 'application/json' },
  { uri: 'genova://account/usage', name: 'Statistiques utilisation', description: 'Votre utilisation mensuelle', mimeType: 'application/json' },
  { uri: 'genova://agents', name: 'Liste des agents', description: 'Tous vos agents AI', mimeType: 'application/json' },
  { uri: 'genova://workflows', name: 'Liste des workflows', description: 'Tous vos workflows', mimeType: 'application/json' },
];

const GENOVA_PROMPTS: MCPPrompt[] = [
  {
    name: 'analyze_with_genova',
    description: 'Analyser des données avec un agent Genova',
    arguments: [
      { name: 'query', description: 'Ce que vous voulez analyser', required: true },
      { name: 'agentType', description: 'Type d\'agent (assistant, coder, researcher)', required: false },
    ],
  },
  {
    name: 'deploy_agent',
    description: 'Déployer un nouvel agent AI Genova',
    arguments: [
      { name: 'name', description: 'Nom de l\'agent', required: true },
      { name: 'capabilities', description: 'Capacités souhaitées', required: true },
    ],
  },
];

// ============================================================
// Handlers
// ============================================================

async function handleToolCall(
  toolName: string,
  args: Record<string, unknown>,
  userId: string
): Promise<unknown> {
  switch (toolName) {
    case 'genova_list_agents': {
      const where: Record<string, unknown> = { userId };
      if (args.status) where.status = args.status;
      const agents = await db.agent.findMany({ where, orderBy: { createdAt: 'desc' } });
      return agents.map((a: { id: string; name: string; type: string; description: string; status: string; createdAt: Date }) => ({
        id: a.id, name: a.name, type: a.type,
        description: a.description, status: a.status, createdAt: a.createdAt,
      }));
    }

    case 'genova_get_agent': {
      const agent = await db.agent.findFirst({
        where: { id: args.agentId as string, userId },
        include: { tasks: { take: 5, orderBy: { createdAt: 'desc' } } },
      });
      if (!agent) throw new Error('Agent introuvable');
      return agent;
    }

    case 'genova_execute_agent': {
      const agent = await db.agent.findFirst({
        where: { id: args.agentId as string, userId },
      });
      if (!agent) throw new Error('Agent introuvable');

      const execution = await db.agentExecution.create({
        data: {
          agentId: agent.id,
          userId,
          task: args.task as string,
          status: 'pending',
        },
      });

      return { executionId: execution.id, status: 'pending', message: 'Tâche soumise à l\'agent' };
    }

    case 'genova_list_workflows': {
      const workflows = await db.workflow.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      });
      return workflows;
    }

    case 'genova_list_conversations': {
      const limit = Math.min(Number(args.limit) || 20, 100);
      const conversations = await db.conversation.findMany({
        where: { userId },
        orderBy: { updatedAt: 'desc' },
        take: limit,
        include: { messages: { take: 1, orderBy: { createdAt: 'desc' } } },
      });
      return conversations;
    }

    case 'genova_get_credits': {
      const lastTx = await db.creditTransaction.findFirst({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        select: { balance: true },
      });
      return { credits: lastTx?.balance ?? 0 };
    }

    case 'genova_create_agent': {
      const agent = await db.agent.create({
        data: {
          name: args.name as string,
          type: args.type as string,
          description: (args.description as string) || '',
          config: '{}',
          userId,
        },
      });
      return { id: agent.id, name: agent.name, type: agent.type, status: 'created' };
    }

    case 'genova_search_memory': {
      const memories = await db.agentMemory.findMany({
        where: {
          agentId: args.agentId as string,
          userId,
          ...(args.category ? { category: args.category as string } : {}),
          content: { contains: args.query as string },
        },
        orderBy: { relevance: 'desc' },
        take: 10,
      });
      return memories;
    }

    case 'genova_get_usage': {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const [agentCount, taskCount, creditsUsed, apiCalls] = await Promise.all([
        db.agent.count({ where: { userId } }),
        db.task.count({ where: { userId, createdAt: { gte: today } } }),
        db.creditTransaction.aggregate({ where: { userId, createdAt: { gte: today }, amount: { lt: 0 } }, _sum: { amount: true } }),
        db.usageDaily.findFirst({ where: { userId, date: today }, select: { apiCalls: true } }),
      ]);

      return {
        totalAgents: agentCount,
        tasksToday: taskCount,
        creditsUsedToday: Math.abs(creditsUsed._sum.amount ?? 0),
        apiCallsToday: apiCalls?.apiCalls ?? 0,
      };
    }

    default:
      throw new Error(`Outil inconnu: ${toolName}`);
  }
}

// ============================================================
// API Handler (pour les routes Next.js)
// ============================================================

/**
 * Liste des outils disponibles
 */
export function getTools(): MCPTool[] {
  return GENOVA_TOOLS;
}

/**
 * Liste des ressources disponibles
 */
export function getResources(): MCPResource[] {
  return GENOVA_RESOURCES;
}

/**
 * Liste des prompts disponibles
 */
export function getPrompts(): MCPPrompt[] {
  return GENOVA_PROMPTS;
}

/**
 * Traite une requête JSON-RPC MCP
 */
export async function handleMCPRequest(
  body: JSONRPCRequest,
  userId: string
): Promise<JSONRPCResponse> {
  const { id, method, params } = body;

  try {
    switch (method) {
      case 'initialize':
        return {
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: '2025-03-26',
            capabilities: {
              tools: {},
              resources: {},
              prompts: {},
              logging: {},
            },
            serverInfo: {
              name: 'genova-mcp',
              version: '1.0.0',
            },
          },
        };

      case 'tools/list':
        return {
          jsonrpc: '2.0',
          id,
          result: { tools: GENOVA_TOOLS },
        };

      case 'tools/call':
        if (!params?.name || !params?.arguments) {
          return {
            jsonrpc: '2.0',
            id,
            error: { code: -32602, message: 'Paramètres invalides: name et arguments requis' },
          };
        }
        try {
          const result = await handleToolCall(
            params.name as string,
            params.arguments as Record<string, unknown>,
            userId
          );
          return {
            jsonrpc: '2.0',
            id,
            result: { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] },
          };
        } catch (err) {
          return {
            jsonrpc: '2.0',
            id,
            error: { code: -32603, message: err instanceof Error ? err.message : 'Erreur interne' },
          };
        }

      case 'resources/list':
        return {
          jsonrpc: '2.0',
          id,
          result: { resources: GENOVA_RESOURCES },
        };

      case 'resources/read':
        if (!params?.uri) {
          return {
            jsonrpc: '2.0',
            id,
            error: { code: -32602, message: 'URI requis' },
          };
        }
        try {
          const content = await readResource(params.uri as string, userId);
          return {
            jsonrpc: '2.0',
            id,
            result: { contents: [{ uri: params.uri, mimeType: 'application/json', text: JSON.stringify(content, null, 2) }] },
          };
        } catch (err) {
          return {
            jsonrpc: '2.0',
            id,
            error: { code: -32603, message: err instanceof Error ? err.message : 'Erreur interne' },
          };
        }

      case 'prompts/list':
        return {
          jsonrpc: '2.0',
          id,
          result: { prompts: GENOVA_PROMPTS },
        };

      case 'prompts/get':
        return {
          jsonrpc: '2.0',
          id,
          result: {
            description: 'Assistant Genova',
            messages: [
              { role: 'system', content: { type: 'text', text: 'Vous êtes un assistant Genova AI. Vous pouvez gérer les agents, workflows, conversations et crédits.' } },
            ],
          },
        };

      default:
        return {
          jsonrpc: '2.0',
          id,
          error: { code: -32601, message: `Méthode non trouvée: ${method}` },
        };
    }
  } catch (err) {
    log.error('MCP request error', { method, error: err instanceof Error ? err.message : String(err) });
    return {
      jsonrpc: '2.0',
      id,
      error: { code: -32603, message: 'Erreur interne du serveur' },
    };
  }
}

/**
 * Lit une ressource MCP
 */
async function readResource(uri: string, userId: string): Promise<unknown> {
  switch (uri) {
    case 'genova://account/profile': {
      const user = await db.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, name: true, plan: true, role: true, createdAt: true },
      });
      return user;
    }
    case 'genova://account/credits': {
      const lastTx = await db.creditTransaction.findFirst({
        where: { userId }, orderBy: { createdAt: 'desc' }, select: { balance: true },
      });
      return { credits: lastTx?.balance ?? 0 };
    }
    case 'genova://account/usage': {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const [agentCount, monthlyUsage] = await Promise.all([
        db.agent.count({ where: { userId } }),
        db.usageDaily.findMany({ where: { userId, date: { gte: new Date(Date.now() - 30 * 86400000) } }, orderBy: { date: 'desc' } }),
      ]);
      return { totalAgents: agentCount, dailyUsage: monthlyUsage };
    }
    case 'genova://agents': {
      return db.agent.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
    }
    case 'genova://workflows': {
      return db.workflow.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
    }
    default:
      throw new Error(`Ressource inconnue: ${uri}`);
  }
}

/**
 * Génère le fichier de configuration MCP pour les clients
 */
export function generateMCPConfig(baseUrl: string, apiKey: string): Record<string, unknown> {
  return {
    mcpServers: {
      genova: {
        command: 'node',
        args: ['-e', `require('${process.cwd()}/src/lib/mcp/genova-mcp-server').startSTDIO('${apiKey}')`],
        env: {
          GENOVA_API_KEY: apiKey,
          GENOVA_API_URL: baseUrl,
        },
      },
    },
  };
}

/**
 * Génère le blob de configuration JSON pour Cursor/Claude Desktop
 */
export function generateCursorConfig(apiKey: string): string {
  return JSON.stringify({
    name: 'genova',
    type: 'api-key',
    apiKey,
    baseUrl: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
  }, null, 2);
}
