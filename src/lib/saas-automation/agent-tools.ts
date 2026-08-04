// ============================================================
// SaaS Automation Tools — Enregistrement des outils SaaS pour les agents
//
// Ces outils sont enregistrés dans le ToolRegistry de l'Agent Engine
// pour que les agents IA puissent utiliser les comptes SaaS liés
// de l'utilisateur de manière autonome.
// ============================================================

import { ToolRegistry } from '@/lib/tools/registry';
import { getAutonomousActionEngine } from '@/lib/saas-automation/action-engine';
import { getActionTemplateManager } from '@/lib/saas-automation/action-templates';
import { getSaaSAccountConnector } from '@/lib/saas-automation/account-connector';
import { createLogger } from '@/lib/logger';

const log = createLogger('saas-automation-tools');

/**
 * Enregistrer tous les outils SaaS Automation dans le ToolRegistry
 */
export function registerSaaSAutomationTools(registry: ToolRegistry): void {
  log.info('Registering SaaS automation tools');

  // === Outil: saas_list_accounts ===
  registry.register({
    name: 'saas_list_accounts',
    description: 'Liste les comptes SaaS externes liés par l\'utilisateur. Retourne les providers disponibles (Gmail, Slack, Notion, etc.) avec leur statut.',
    parameters: {
      type: 'object',
      properties: {
        activeOnly: { type: 'boolean', default: true, description: 'Ne retourner que les comptes actifs' },
      },
    },
    execute: async (params: { activeOnly?: boolean }, context: { userId: string }) => {
      const connector = getSaaSAccountConnector();
      const accounts = await connector.listAccounts(context.userId, params.activeOnly ?? true);
      return {
        accounts,
        total: accounts.length,
        providers: [...new Set(accounts.map(a => a.provider))],
      };
    },
  });

  // === Outil: saas_execute ===
  registry.register({
    name: 'saas_execute',
    description: 'Exécute une action sur un compte SaaS externe. L\'action passe par le Safety Guard (consentement, validation, audit). Exemples: gmail.send_email, slack.post_message, notion.create_page, github.create_issue, calendar.create_event.',
    parameters: {
      type: 'object',
      properties: {
        saasAccountId: { type: 'string', description: 'ID du compte SaaS lié' },
        operation: { type: 'string', description: 'Opération à exécuter (ex: gmail.send_email, slack.post_message)' },
        inputParams: { type: 'object', description: 'Paramètres de l\'action' },
        executionMode: { type: 'string', enum: ['autonomous', 'supervised', 'manual'], default: 'supervised', description: 'Mode d\'exécution' },
        agentConfidence: { type: 'number', description: 'Score de confiance de l\'agent (0-1)' },
      },
      required: ['saasAccountId', 'operation', 'inputParams'],
    },
    execute: async (params: {
      saasAccountId: string;
      operation: string;
      inputParams: Record<string, unknown>;
      executionMode?: string;
      agentConfidence?: number;
    }, context: { userId: string; agentId?: string }) => {
      const engine = getAutonomousActionEngine();
      const result = await engine.executeAction({
        userId: context.userId,
        agentId: context.agentId,
        saasAccountId: params.saasAccountId,
        operation: params.operation,
        inputParams: params.inputParams,
        options: {
          executionMode: params.executionMode as 'autonomous' | 'supervised' | 'manual',
          agentConfidence: params.agentConfidence,
        },
      });
      return result;
    },
  });

  // === Outil: saas_list_templates ===
  registry.register({
    name: 'saas_list_templates',
    description: 'Liste les templates d\'actions disponibles pour les plateformes SaaS. Permet de découvrir les opérations possibles par provider ou catégorie.',
    parameters: {
      type: 'object',
      properties: {
        provider: { type: 'string', description: 'Filtrer par provider (google_gmail, slack, notion, github...)' },
        category: { type: 'string', enum: ['communication', 'productivity', 'crm', 'dev_tools', 'finance', 'social', 'file_management'], description: 'Filtrer par catégorie' },
        groupBy: { type: 'string', enum: ['provider', 'category'], description: 'Grouper les résultats' },
      },
    },
    execute: async (params: {
      provider?: string;
      category?: string;
      groupBy?: string;
    }) => {
      const manager = getActionTemplateManager();

      if (params.groupBy === 'provider') {
        return { templates: manager.listByProvider() };
      }
      if (params.groupBy === 'category') {
        return { templates: manager.listByCategory() };
      }

      const templates = manager.listTemplates({
        provider: params.provider,
        category: params.category as any,
      });
      return { templates, total: templates.length };
    },
  });

  // === Outil: saas_compose ===
  registry.register({
    name: 'saas_compose',
    description: 'Exécute une séquence composée d\'actions SaaS. Permet de chaîner plusieurs opérations (ex: résumer un document puis l\'envoyer par email, créer une issue GitHub puis notifier sur Slack).',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Nom de l\'action composée' },
        steps: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              saasAccountId: { type: 'string' },
              operation: { type: 'string' },
              inputParams: { type: 'object' },
            },
            required: ['saasAccountId', 'operation', 'inputParams'],
          },
          description: 'Étapes séquentielles à exécuter',
        },
        failureStrategy: { type: 'string', enum: ['abort', 'skip', 'continue'], default: 'abort', description: 'Stratégie en cas d\'échec d\'une étape' },
      },
      required: ['name', 'steps'],
    },
    execute: async (params: {
      name: string;
      steps: Array<{ saasAccountId: string; operation: string; inputParams: Record<string, unknown> }>;
      failureStrategy?: string;
    }, context: { userId: string; agentId?: string }) => {
      const engine = getAutonomousActionEngine();
      return engine.executeComposedAction({
        userId: context.userId,
        agentId: context.agentId,
        name: params.name,
        steps: params.steps.map(s => ({
          userId: context.userId,
          agentId: context.agentId,
          ...s,
        })),
        failureStrategy: (params.failureStrategy as 'abort' | 'skip' | 'continue') || 'abort',
      });
    },
  });

  // === Outil: saas_action_history ===
  registry.register({
    name: 'saas_action_history',
    description: 'Récupère l\'historique des actions SaaS exécutées ou en attente. Utile pour suivre les résultats et les consentements.',
    parameters: {
      type: 'object',
      properties: {
        status: { type: 'string', description: 'Filtrer par statut (completed, failed, pending, consent_requested)' },
        limit: { type: 'number', default: 20 },
      },
    },
    execute: async (params: { status?: string; limit?: number }, context: { userId: string }) => {
      const engine = getAutonomousActionEngine();
      return engine.getActionHistory(context.userId, {
        status: params.status,
        limit: params.limit || 20,
      });
    },
  });

  // === Outil: saas_approve_action ===
  registry.register({
    name: 'saas_approve_action',
    description: 'Approuve une action en attente de consentement. L\'action sera ensuite exécutée automatiquement.',
    parameters: {
      type: 'object',
      properties: {
        actionId: { type: 'string', description: 'ID de l\'action à approuver' },
      },
      required: ['actionId'],
    },
    execute: async (params: { actionId: string }, context: { userId: string }) => {
      const engine = getAutonomousActionEngine();
      return engine.approveAction(params.actionId, context.userId);
    },
  });

  log.info('SaaS automation tools registered successfully', {
    tools: ['saas_list_accounts', 'saas_execute', 'saas_list_templates', 'saas_compose', 'saas_action_history', 'saas_approve_action'],
  });
}
