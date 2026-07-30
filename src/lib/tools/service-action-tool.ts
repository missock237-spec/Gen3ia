// ServiceActionTool — outil pour que les agents puissent executer des actions via les comptes connectes

import { executeServiceAction, getAvailableActions, getSupportedServices } from '@/lib/agent-engine/service-executor';

interface ToolDefinition {
  name: string;
  description: string;
  execute: (params: Record<string, unknown>, context: ToolContext) => Promise<ToolResult>;
}

interface ToolContext {
  userId: string;
  agentId?: string;
}

interface ToolResult {
  success: boolean;
  result?: unknown;
  error?: string;
}

export const serviceActionTool: ToolDefinition = {
  name: 'service_action',
  description: `Execute une action sur un service externe (GitHub, Gmail, Slack, etc.) via les comptes connectes de l'utilisateur. Utilise les tokens OAuth stockes pour agir au nom de l'utilisateur.`,
  async execute(params: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    try {
      const service = params.service as string;
      const action = params.action as string;
      const actionParams = (params.params as Record<string, unknown>) || {};

      if (!service) return { success: false, error: 'Parametre "service" requis (ex: github, gmail, slack)' };
      if (!action) return { success: false, error: 'Parametre "action" requis' };
      if (!context.userId) return { success: false, error: 'Utilisateur non authentifie' };

      const availableActions = getAvailableActions(service);
      if (availableActions.length === 0) {
        return {
          success: false,
          error: `Service "${service}" non supporte. Services disponibles: ${getSupportedServices().join(', ')}`,
        };
      }

      const result = await executeServiceAction({
        service,
        action,
        params: actionParams,
        userId: context.userId,
        agentId: context.agentId,
      });

      if (!result.success) {
        if (result.statusCode === 401) {
          return {
            success: false,
            error: `Token expire pour ${service}. L'utilisateur doit reconnecter son compte.`,
            requiresReauth: true,
            service,
          };
        }
        return { success: false, error: result.error || `Action ${action} sur ${service} echouee` };
      }

      return { success: true, result: result.data };
    } catch (error) {
      return { success: false, error: `Erreur service_action: ${error instanceof Error ? error.message : 'Inconnue'}` };
    }
  },
};

export const serviceInfoTool: ToolDefinition = {
  name: 'service_info',
  description: 'Liste les services connectes de l\'utilisateur et leurs actions disponibles.',
  async execute(params: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    try {
      const { prisma } = await import('@/lib/prisma');

      const auths = await prisma.workflowAuthorization.findMany({
        where: { userId: context.userId, isActive: true },
        select: { service: true, accountName: true, scopes: true },
      });

      const servicesInfo = auths.map(a => ({
        service: a.service,
        accountName: a.accountName,
        scopes: JSON.parse(a.scopes || '[]'),
        availableActions: getAvailableActions(a.service).map(act => ({
          name: act.name,
          method: act.method,
        })),
      }));

      const specificService = params.service as string;
      if (specificService) {
        const found = servicesInfo.find(s => s.service === specificService);
        if (!found) {
          return {
            success: true,
            result: {
              service: specificService,
              connected: false,
              message: `Service "${specificService}" non connecte. Utilise l'interface pour le connecter.`,
              availableActions: getAvailableActions(specificService),
            },
          };
        }
        return { success: true, result: found };
      }

      return {
        success: true,
        result: {
          totalConnected: servicesInfo.length,
          services: servicesInfo,
          allActions: getAvailableActions(''),
        },
      };
    } catch (error) {
      return { success: false, error: `Erreur service_info: ${error instanceof Error ? error.message : 'Inconnue'}` };
    }
  },
};
