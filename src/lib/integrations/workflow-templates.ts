// ============================================================
// Workflow Templates — Modèles de workflows n8n prêts à l'emploi
// ============================================================

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  triggers: string[];
  servicesRequired: string[];
  nodes: unknown[];
  connections: Record<string, unknown>;
}

/**
 * Templates de workflows n8n pour l'intégration automatique
 * des comptes utilisateurs via les agents IA Genova.
 */
export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    id: 'gmail-email-monitor',
    name: 'Surveillance Email Gmail',
    description: 'Surveille les nouveaux emails et permet à l\'agent IA de répondre automatiquement',
    category: 'communication',
    triggers: ['email_received', 'new_message'],
    servicesRequired: ['gmail'],
    nodes: [
      {
        id: 'trigger-1',
        name: 'Nouvel Email',
        type: 'n8n-nodes-base.gmailTrigger',
        typeVersion: 1,
        position: [250, 300],
        parameters: {
          rule: [{ field: 'from', condition: 'isNotEmpty' }],
          simplify: true,
        },
      },
      {
        id: 'action-1',
        name: 'Analyser avec Genova IA',
        type: 'n8n-nodes-base.httpRequest',
        typeVersion: 4,
        position: [500, 300],
        parameters: {
          url: '={{ $env.GENOVA_API_URL }}/api/ai/process',
          method: 'POST',
          authentication: 'genericCredential',
          sendBody: true,
          bodyParameters: {
            parameters: [
              { name: 'message', value: '={{ $json }}' },
              { name: 'agent', value: 'email-assistant' },
            ],
          },
        },
      },
    ],
    connections: {
      'trigger-1': { main: [[{ node: 'action-1', type: 'main', index: 0 }]] },
    },
  },
  {
    id: 'slack-message-router',
    name: 'Routeur Messages Slack',
    description: 'Route les messages Slack vers l\'agent IA pour analyse et réponse',
    category: 'communication',
    triggers: ['message_received'],
    servicesRequired: ['slack'],
    nodes: [
      {
        id: 'trigger-slack',
        name: 'Message Slack',
        type: 'n8n-nodes-base.slackTrigger',
        typeVersion: 1,
        position: [250, 300],
        parameters: {
          event: ['message_im'],
        },
      },
      {
        id: 'action-slack',
        name: 'Agent IA Genova',
        type: 'n8n-nodes-base.httpRequest',
        typeVersion: 4,
        position: [500, 300],
        parameters: {
          url: '={{ $env.GENOVA_API_URL }}/api/ai/process',
          method: 'POST',
          sendBody: true,
          bodyParameters: {
            parameters: [
              { name: 'message', value: '={{ $json.text }}' },
              { name: 'source', value: 'slack' },
            ],
          },
        },
      },
    ],
    connections: {
      'trigger-slack': { main: [[{ node: 'action-slack', type: 'main', index: 0 }]] },
    },
  },
  {
    id: 'google-calendar-sync',
    name: 'Assistant Agenda Google',
    description: 'Synchronise le calendrier Google avec l\'agent pour la gestion des rendez-vous',
    category: 'productivity',
    triggers: ['event_created', 'event_updated', 'event_started'],
    servicesRequired: ['google-calendar'],
    nodes: [
      {
        id: 'trigger-cal',
        name: 'Événement Calendrier',
        type: 'n8n-nodes-base.googleCalendarTrigger',
        typeVersion: 1,
        position: [250, 300],
        parameters: {},
      },
      {
        id: 'action-cal',
        name: 'Notifier Agent IA',
        type: 'n8n-nodes-base.httpRequest',
        typeVersion: 4,
        position: [500, 300],
        parameters: {
          url: '={{ $env.GENOVA_API_URL }}/api/ai/process',
          method: 'POST',
          sendBody: true,
          bodyParameters: {
            parameters: [
              { name: 'event', value: '={{ $json }}' },
              { name: 'source', value: 'google-calendar' },
            ],
          },
        },
      },
    ],
    connections: {
      'trigger-cal': { main: [[{ node: 'action-cal', type: 'main', index: 0 }]] },
    },
  },
  {
    id: 'github-pr-review',
    name: 'Review PR GitHub par IA',
    description: 'Analyse automatiquement les Pull Requests GitHub via l\'agent IA Genova',
    category: 'development',
    triggers: ['pull_request_opened', 'pull_request_updated'],
    servicesRequired: ['github'],
    nodes: [
      {
        id: 'trigger-gh',
        name: 'PR GitHub',
        type: 'n8n-nodes-base.githubTrigger',
        typeVersion: 1,
        position: [250, 300],
        parameters: {
          events: ['pull_request'],
        },
      },
      {
        id: 'action-gh',
        name: 'Analyser avec Genova',
        type: 'n8n-nodes-base.httpRequest',
        typeVersion: 4,
        position: [500, 300],
        parameters: {
          url: '={{ $env.GENOVA_API_URL }}/api/ai/review',
          method: 'POST',
          sendBody: true,
          bodyParameters: {
            parameters: [
              { name: 'pr', value: '={{ $json }}' },
            ],
          },
        },
      },
    ],
    connections: {
      'trigger-gh': { main: [[{ node: 'action-gh', type: 'main', index: 0 }]] },
    },
  },
  {
    id: 'notion-document-generator',
    name: 'Génération Documents Notion',
    description: 'Crée et met à jour des documents Notion automatiquement via l\'agent IA',
    category: 'productivity',
    triggers: ['scheduled', 'manual'],
    servicesRequired: ['notion'],
    nodes: [
      {
        id: 'trigger-n',
        name: 'Déclencheur Manuel',
        type: 'n8n-nodes-base.webhook',
        typeVersion: 1,
        position: [250, 300],
        parameters: {
          path: 'genova-notion-{{ $json.userId }}',
          httpMethod: 'POST',
          options: {},
        },
      },
      {
        id: 'action-n1',
        name: 'Appeler Agent Genova',
        type: 'n8n-nodes-base.httpRequest',
        typeVersion: 4,
        position: [500, 300],
        parameters: {
          url: '={{ $env.GENOVA_API_URL }}/api/integrations/notion/generate',
          method: 'POST',
          sendBody: true,
          bodyParameters: {
            parameters: [
              { name: 'data', value: '={{ $json }}' },
            ],
          },
        },
      },
      {
        id: 'action-n2',
        name: 'Mettre à jour Notion',
        type: 'n8n-nodes-base.notion',
        typeVersion: 1,
        position: [750, 300],
        parameters: {
          resource: 'page',
          operation: 'create',
          databaseId: '={{ $json.databaseId }}',
        },
      },
    ],
    connections: {
      'trigger-n': { main: [[{ node: 'action-n1', type: 'main', index: 0 }]] },
      'action-n1': { main: [[{ node: 'action-n2', type: 'main', index: 0 }]] },
    },
  },
];

export function getTemplateById(id: string): WorkflowTemplate | undefined {
  return WORKFLOW_TEMPLATES.find(t => t.id === id);
}

export function getTemplatesByService(service: string): WorkflowTemplate[] {
  return WORKFLOW_TEMPLATES.filter(t => t.servicesRequired.includes(service));
}

export function getTemplatesByCategory(category: string): WorkflowTemplate[] {
  return WORKFLOW_TEMPLATES.filter(t => t.category === category);
}
