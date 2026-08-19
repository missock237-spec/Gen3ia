// Register Service Tools — enregistre les outils de service dans le ToolRegistry
// Pour etre appele au demarrage de l'agent engine

import { ToolRegistry, ToolDefinition } from '@/lib/tools/registry';
import { executeServiceAction, getAvailableActions, getSupportedServices } from '@/lib/agent-engine/service-executor';
import { requestConsent } from '@/lib/agent-engine/consent-manager';

const SERVICE_DESCRIPTIONS: Record<string, string> = {
  github: 'GitHub — depots, issues, pull requests, workflows, gists',
  gmail: 'Gmail — emails, labels, drafts, recherche',
  google_calendar: 'Google Calendar — evenements, agenda, disponibilite',
  google_drive: 'Google Drive — fichiers, dossiers, permissions',
  slack: 'Slack — messages, canaux, utilisateurs, fichiers',
  twitter: 'Twitter/X — tweets, likes, abonnes, messages directs',
  linkedin: 'LinkedIn — profil, posts, recherche, messages',
  notion: 'Notion — pages, bases de donnees, commentaires, recherche',
  discord: 'Discord — serveurs, canaux, messages, reactions',
  dropbox: 'Dropbox — fichiers, dossiers, telechargement, recherche',
  stripe: 'Stripe — clients, paiements, factures, produits, abonnements',
  shopify: 'Shopify — produits, commandes, clients, inventaire',
};

export function registerServiceTools(registry: ToolRegistry): void {
  const supportedServices = getSupportedServices();

  for (const service of supportedServices) {
    const actions = getAvailableActions(service);
    if (actions.length === 0) continue;

    const actionList = actions.map(a => `${a.name} (${a.method})`).join(', ');
    const serviceDesc = SERVICE_DESCRIPTIONS[service] || `Service ${service}`;

    const serviceTool: ToolDefinition = {
      name: `service_${service}`,
      description: `${serviceDesc}. Actions disponibles: ${actionList}. Utilise le token OAuth stocke de l'utilisateur.`,
      parameters: {
        action: { type: 'string', description: `Action a executer parmi: ${actionList}`, required: true },
        params: { type: 'object', description: 'Parametres de l action (optionnel selon l action)', required: false, default: {} },
      },
      execute: async (params, context) => {
        const action = params.action as string;
        const actionParams = (params.params as Record<string, unknown>) || {};

        const consent = await requestConsent(
          context.userId,
          context.agentId,
          'Agent',
          service,
          action,
          actionParams
        );

        if (consent.status !== 'approved') {
          return {
            success: false,
            error: `Action ${action} sur ${service} en attente d approbation. ID: ${consent.id}`,
            consentId: consent.id,
            requiresApproval: true,
          };
        }

        const result = await executeServiceAction({
          service,
          action,
          params: actionParams,
          userId: context.userId,
          agentId: context.agentId,
        });

        return result;
      },
      isDangerous: true,
      category: 'communication',
      permissions: [{ action: 'execute', scope: 'limited' }],
      timeout: 30000,
    };

    registry.register(serviceTool);
  }

  const allServices = getSupportedServices().join(', ');

  const serviceInfoTool: ToolDefinition = {
    name: 'list_connected_services',
    description: `Liste les services connectes par l'utilisateur et leurs actions disponibles. Services: ${allServices}`,
    parameters: {
      service: { type: 'string', description: 'Filtrer par service specifique (optionnel)', required: false },
    },
    execute: async (params) => {
      const { prisma } = await import('@/lib/prisma');
      const { getServerSession } = await import('@/lib/auth');
      const session = await getServerSession();
      if (!session?.user.id) return { success: false, error: 'Non authentifie' };

      const auths = await prisma.workflowAuthorization.findMany({
        where: { userId: session.user.id, isActive: true },
        select: { service: true, accountName: true },
      });

      const specific = params.service as string;
      if (specific) {
        const found = auths.find(a => a.service === specific);
        const actions = getAvailableActions(specific);
        return {
          success: true,
          result: {
            connected: !!found,
            accountName: found?.accountName || null,
            availableActions: actions,
          },
        };
      }

      return {
        success: true,
        result: {
          totalConnected: auths.length,
          connectedServices: auths.map(a => ({
            service: a.service,
            accountName: a.accountName,
            availableActions: getAvailableActions(a.service),
          })),
        },
      };
    },
    category: 'search',
    permissions: [{ action: 'read', scope: 'full' }],
  };

  registry.register(serviceInfoTool);
}

export function getRegisteredServiceToolNames(): string[] {
  return getSupportedServices().map(s => `service_${s}`).concat(['list_connected_services']);
}
