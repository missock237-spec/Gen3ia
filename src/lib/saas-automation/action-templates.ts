// ============================================================
// ACTION TEMPLATES — Templates d'actions pré-construits pour les plateformes SaaS
//
// Bibliothèque de +40 templates couvrant les opérations les plus courantes
// sur Gmail, Slack, Notion, GitHub, Google Calendar, Salesforce, HubSpot, etc.
//
// Chaque template définit:
// - Le schéma d'entrée (validation)
// - Le schéma de sortie (vérification)
// - Les étapes d'exécution (séquentielles ou parallèles)
// - Le niveau de risque
// - Les scopes OAuth requis
// ============================================================

import { prisma } from '@/lib/prisma';
import { createLogger } from '@/lib/logger';

const log = createLogger('action-templates');

// ============================================================
// Types
// ============================================================

export type TemplateCategory = 'communication' | 'productivity' | 'crm' | 'dev_tools' | 'finance' | 'social' | 'file_management';
export type TemplateActionType = 'api_call' | 'browser_automation' | 'hybrid';

export interface ActionTemplateDefinition {
  name: string;
  description: string;
  provider: string;
  operation: string;
  category: TemplateCategory;
  actionType: TemplateActionType;
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  steps: ActionStep[];
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  requiredScopes: string[];
  estimatedTimeMs: number;
}

export interface ActionStep {
  id: string;
  name: string;
  type: 'api_call' | 'browser_action' | 'transform' | 'condition' | 'loop';
  config: Record<string, unknown>;
  onError?: 'abort' | 'skip' | 'retry';
  maxRetries?: number;
}

// ============================================================
// BUILT-IN TEMPLATES
// ============================================================

const BUILTIN_TEMPLATES: ActionTemplateDefinition[] = [
  // === GMAIL ===
  {
    name: 'Envoyer un email',
    description: 'Envoyer un email via Gmail avec support HTML, pièces jointes, CC/BCC',
    provider: 'google_gmail',
    operation: 'gmail.send_email',
    category: 'communication',
    actionType: 'api_call',
    inputSchema: {
      type: 'object',
      properties: {
        to: { type: 'string', format: 'email', description: 'Destinataire' },
        subject: { type: 'string', description: 'Objet de l\'email' },
        body: { type: 'string', description: 'Corps de l\'email (HTML)' },
        cc: { type: 'array', items: { type: 'string', format: 'email' } },
        bcc: { type: 'array', items: { type: 'string', format: 'email' } },
        replyToMessageId: { type: 'string', description: 'ID du message auquel répondre' },
      },
      required: ['to', 'subject', 'body'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        messageId: { type: 'string' },
        threadId: { type: 'string' },
        labelIds: { type: 'array', items: { type: 'string' } },
      },
    },
    steps: [
      { id: 'send', name: 'Envoyer l\'email', type: 'api_call', config: { method: 'POST', url: 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send' }, onError: 'retry', maxRetries: 2 },
    ],
    riskLevel: 'high',
    requiredScopes: ['https://www.googleapis.com/auth/gmail.send'],
    estimatedTimeMs: 3000,
  },
  {
    name: 'Lister les emails',
    description: 'Lister les emails de la boîte de réception avec filtres',
    provider: 'google_gmail',
    operation: 'gmail.list_emails',
    category: 'communication',
    actionType: 'api_call',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Recherche Gmail (ex: "is:unread from:boss")' },
        maxResults: { type: 'number', default: 20 },
        labelIds: { type: 'array', items: { type: 'string' } },
      },
    },
    steps: [
      { id: 'list', name: 'Lister les messages', type: 'api_call', config: { method: 'GET', url: 'https://gmail.googleapis.com/gmail/v1/users/me/messages' }, onError: 'retry', maxRetries: 2 },
    ],
    riskLevel: 'low',
    requiredScopes: ['https://www.googleapis.com/auth/gmail.readonly'],
    estimatedTimeMs: 2000,
  },
  {
    name: 'Lire un email',
    description: 'Récupérer le contenu complet d\'un email spécifique',
    provider: 'google_gmail',
    operation: 'gmail.read_email',
    category: 'communication',
    actionType: 'api_call',
    inputSchema: {
      type: 'object',
      properties: { messageId: { type: 'string', description: 'ID du message' }, format: { type: 'string', enum: ['full', 'minimal', 'raw'], default: 'full' } },
      required: ['messageId'],
    },
    steps: [
      { id: 'get', name: 'Récupérer le message', type: 'api_call', config: { method: 'GET', url: 'https://gmail.googleapis.com/gmail/v1/users/me/messages/{messageId}' }, onError: 'retry', maxRetries: 2 },
    ],
    riskLevel: 'low',
    requiredScopes: ['https://www.googleapis.com/auth/gmail.readonly'],
    estimatedTimeMs: 1500,
  },

  // === SLACK ===
  {
    name: 'Envoyer un message Slack',
    description: 'Envoyer un message dans un canal ou en DM',
    provider: 'slack',
    operation: 'slack.post_message',
    category: 'communication',
    actionType: 'api_call',
    inputSchema: {
      type: 'object',
      properties: {
        channel: { type: 'string', description: 'Canal ou ID utilisateur' },
        text: { type: 'string', description: 'Texte du message' },
        blocks: { type: 'array', description: 'Block Kit blocks' },
        threadTs: { type: 'string', description: 'Timestamp du thread parent' },
      },
      required: ['channel', 'text'],
    },
    steps: [
      { id: 'post', name: 'Poster le message', type: 'api_call', config: { method: 'POST', url: 'https://slack.com/api/chat.postMessage' }, onError: 'retry', maxRetries: 2 },
    ],
    riskLevel: 'medium',
    requiredScopes: ['chat:write'],
    estimatedTimeMs: 1500,
  },
  {
    name: 'Lister les canaux Slack',
    description: 'Lister tous les canaux accessibles',
    provider: 'slack',
    operation: 'slack.list_channels',
    category: 'communication',
    actionType: 'api_call',
    inputSchema: {
      type: 'object',
      properties: { types: { type: 'string', default: 'public_channel,private_channel' } },
    },
    steps: [
      { id: 'list', name: 'Lister les canaux', type: 'api_call', config: { method: 'GET', url: 'https://slack.com/api/conversations.list' } },
    ],
    riskLevel: 'low',
    requiredScopes: ['channels:read'],
    estimatedTimeMs: 2000,
  },

  // === NOTION ===
  {
    name: 'Créer une page Notion',
    description: 'Créer une nouvelle page dans une base de données ou comme sous-page',
    provider: 'notion',
    operation: 'notion.create_page',
    category: 'productivity',
    actionType: 'api_call',
    inputSchema: {
      type: 'object',
      properties: {
        parent: { type: 'object', description: 'Parent (database_id ou page_id)' },
        properties: { type: 'object', description: 'Propriétés de la page' },
        children: { type: 'array', description: 'Blocs de contenu' },
      },
      required: ['parent', 'properties'],
    },
    steps: [
      { id: 'create', name: 'Créer la page', type: 'api_call', config: { method: 'POST', url: 'https://api.notion.com/v1/pages' }, onError: 'retry', maxRetries: 2 },
    ],
    riskLevel: 'medium',
    requiredScopes: [],
    estimatedTimeMs: 3000,
  },
  {
    name: 'Rechercher dans Notion',
    description: 'Rechercher des pages ou bases de données Notion',
    provider: 'notion',
    operation: 'notion.search',
    category: 'productivity',
    actionType: 'api_call',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Texte de recherche' },
        filter: { type: 'object', description: 'Filtre (property, value)' },
        sort: { type: 'object', description: 'Tri' },
        startCursor: { type: 'string' },
        pageSize: { type: 'number', default: 10 },
      },
    },
    steps: [
      { id: 'search', name: 'Rechercher', type: 'api_call', config: { method: 'POST', url: 'https://api.notion.com/v1/search' } },
    ],
    riskLevel: 'low',
    requiredScopes: [],
    estimatedTimeMs: 2000,
  },
  {
    name: 'Mettre à jour une page Notion',
    description: 'Modifier les propriétés ou le contenu d\'une page existante',
    provider: 'notion',
    operation: 'notion.update_page',
    category: 'productivity',
    actionType: 'api_call',
    inputSchema: {
      type: 'object',
      properties: {
        pageId: { type: 'string', description: 'ID de la page' },
        properties: { type: 'object', description: 'Propriétés à mettre à jour' },
        archived: { type: 'boolean', description: 'Archiver la page' },
      },
      required: ['pageId'],
    },
    steps: [
      { id: 'update', name: 'Mettre à jour la page', type: 'api_call', config: { method: 'PATCH', url: 'https://api.notion.com/v1/pages/{pageId}' }, onError: 'retry', maxRetries: 2 },
    ],
    riskLevel: 'medium',
    requiredScopes: [],
    estimatedTimeMs: 2500,
  },

  // === GOOGLE CALENDAR ===
  {
    name: 'Créer un événement Calendar',
    description: 'Créer un événement dans Google Calendar',
    provider: 'google_calendar',
    operation: 'calendar.create_event',
    category: 'productivity',
    actionType: 'api_call',
    inputSchema: {
      type: 'object',
      properties: {
        summary: { type: 'string', description: 'Titre de l\'événement' },
        start: { type: 'object', description: 'Date/heure de début' },
        end: { type: 'object', description: 'Date/heure de fin' },
        description: { type: 'string' },
        attendees: { type: 'array', items: { type: 'object' } },
        location: { type: 'string' },
      },
      required: ['summary', 'start', 'end'],
    },
    steps: [
      { id: 'create', name: 'Créer l\'événement', type: 'api_call', config: { method: 'POST', url: 'https://www.googleapis.com/calendar/v3/calendars/primary/events' }, onError: 'retry', maxRetries: 2 },
    ],
    riskLevel: 'medium',
    requiredScopes: ['https://www.googleapis.com/auth/calendar.events'],
    estimatedTimeMs: 2000,
  },
  {
    name: 'Lister les événements Calendar',
    description: 'Lister les événements à venir',
    provider: 'google_calendar',
    operation: 'calendar.list_events',
    category: 'productivity',
    actionType: 'api_call',
    inputSchema: {
      type: 'object',
      properties: {
        timeMin: { type: 'string', format: 'date-time' },
        timeMax: { type: 'string', format: 'date-time' },
        maxResults: { type: 'number', default: 10 },
        singleEvents: { type: 'boolean', default: true },
      },
    },
    steps: [
      { id: 'list', name: 'Lister les événements', type: 'api_call', config: { method: 'GET', url: 'https://www.googleapis.com/calendar/v3/calendars/primary/events' } },
    ],
    riskLevel: 'low',
    requiredScopes: ['https://www.googleapis.com/auth/calendar'],
    estimatedTimeMs: 2000,
  },

  // === GITHUB ===
  {
    name: 'Créer une issue GitHub',
    description: 'Créer une issue dans un dépôt GitHub',
    provider: 'github',
    operation: 'github.create_issue',
    category: 'dev_tools',
    actionType: 'api_call',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Propriétaire du repo' },
        repo: { type: 'string', description: 'Nom du repo' },
        title: { type: 'string', description: 'Titre de l\'issue' },
        body: { type: 'string', description: 'Description' },
        labels: { type: 'array', items: { type: 'string' } },
        assignees: { type: 'array', items: { type: 'string' } },
      },
      required: ['owner', 'repo', 'title'],
    },
    steps: [
      { id: 'create', name: 'Créer l\'issue', type: 'api_call', config: { method: 'POST', url: 'https://api.github.com/repos/{owner}/{repo}/issues' }, onError: 'retry', maxRetries: 2 },
    ],
    riskLevel: 'medium',
    requiredScopes: ['repo'],
    estimatedTimeMs: 2000,
  },
  {
    name: 'Lister les PRs GitHub',
    description: 'Lister les pull requests d\'un dépôt',
    provider: 'github',
    operation: 'github.list_prs',
    category: 'dev_tools',
    actionType: 'api_call',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string' },
        repo: { type: 'string' },
        state: { type: 'string', enum: ['open', 'closed', 'all'], default: 'open' },
        per_page: { type: 'number', default: 30 },
      },
      required: ['owner', 'repo'],
    },
    steps: [
      { id: 'list', name: 'Lister les PRs', type: 'api_call', config: { method: 'GET', url: 'https://api.github.com/repos/{owner}/{repo}/pulls' } },
    ],
    riskLevel: 'low',
    requiredScopes: ['repo'],
    estimatedTimeMs: 2000,
  },

  // === SALESFORCE ===
  {
    name: 'Créer un contact Salesforce',
    description: 'Créer un nouveau contact dans Salesforce',
    provider: 'salesforce',
    operation: 'salesforce.create_contact',
    category: 'crm',
    actionType: 'api_call',
    inputSchema: {
      type: 'object',
      properties: {
        FirstName: { type: 'string' },
        LastName: { type: 'string' },
        Email: { type: 'string', format: 'email' },
        Phone: { type: 'string' },
        Company: { type: 'string' },
      },
      required: ['LastName'],
    },
    steps: [
      { id: 'create', name: 'Créer le contact', type: 'api_call', config: { method: 'POST', url: 'https://yourinstance.salesforce.com/services/data/v58.0/sobjects/Contact' }, onError: 'retry', maxRetries: 2 },
    ],
    riskLevel: 'medium',
    requiredScopes: ['api'],
    estimatedTimeMs: 3000,
  },

  // === HUBSPOT ===
  {
    name: 'Créer un contact HubSpot',
    description: 'Créer un nouveau contact dans HubSpot CRM',
    provider: 'hubspot',
    operation: 'hubspot.create_contact',
    category: 'crm',
    actionType: 'api_call',
    inputSchema: {
      type: 'object',
      properties: {
        email: { type: 'string', format: 'email' },
        firstname: { type: 'string' },
        lastname: { type: 'string' },
        phone: { type: 'string' },
        company: { type: 'string' },
      },
      required: ['email'],
    },
    steps: [
      { id: 'create', name: 'Créer le contact', type: 'api_call', config: { method: 'POST', url: 'https://api.hubapi.com/crm/v3/objects/contacts' }, onError: 'retry', maxRetries: 2 },
    ],
    riskLevel: 'medium',
    requiredScopes: ['crm.objects.contacts.write'],
    estimatedTimeMs: 2500,
  },

  // === GOOGLE DRIVE ===
  {
    name: 'Lister les fichiers Drive',
    description: 'Lister les fichiers Google Drive',
    provider: 'google_drive',
    operation: 'drive.list_files',
    category: 'file_management',
    actionType: 'api_call',
    inputSchema: {
      type: 'object',
      properties: {
        q: { type: 'string', description: 'Requête Drive' },
        pageSize: { type: 'number', default: 20 },
        orderBy: { type: 'string', default: 'modifiedByMeTime desc' },
      },
    },
    steps: [
      { id: 'list', name: 'Lister les fichiers', type: 'api_call', config: { method: 'GET', url: 'https://www.googleapis.com/drive/v3/files' } },
    ],
    riskLevel: 'low',
    requiredScopes: ['https://www.googleapis.com/auth/drive.readonly'],
    estimatedTimeMs: 2000,
  },

  // === JIRA ===
  {
    name: 'Créer un ticket Jira',
    description: 'Créer un ticket dans un projet Jira',
    provider: 'jira',
    operation: 'jira.create_issue',
    category: 'dev_tools',
    actionType: 'api_call',
    inputSchema: {
      type: 'object',
      properties: {
        projectKey: { type: 'string' },
        summary: { type: 'string' },
        description: { type: 'string' },
        issuetype: { type: 'string', default: 'Task' },
        priority: { type: 'string', default: 'Medium' },
        assignee: { type: 'string' },
      },
      required: ['projectKey', 'summary'],
    },
    steps: [
      { id: 'create', name: 'Créer le ticket', type: 'api_call', config: { method: 'POST', url: 'https://yourdomain.atlassian.net/rest/api/3/issue' }, onError: 'retry', maxRetries: 2 },
    ],
    riskLevel: 'medium',
    requiredScopes: ['write:jira-work'],
    estimatedTimeMs: 3000,
  },

  // === LINKEDIN ===
  {
    name: 'Publier sur LinkedIn',
    description: 'Publier un post ou un article sur LinkedIn',
    provider: 'linkedin',
    operation: 'linkedin.create_post',
    category: 'social',
    actionType: 'api_call',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Texte du post' },
        visibility: { type: 'string', enum: ['PUBLIC', 'CONNECTIONS'], default: 'PUBLIC' },
      },
      required: ['text'],
    },
    steps: [
      { id: 'post', name: 'Publier le post', type: 'api_call', config: { method: 'POST', url: 'https://api.linkedin.com/v2/ugcPosts' }, onError: 'retry', maxRetries: 2 },
    ],
    riskLevel: 'high',
    requiredScopes: ['w_member_social'],
    estimatedTimeMs: 2000,
  },

  // === COMPOSITE / HYBRID ===
  {
    name: 'Résumer et envoyer par email',
    description: 'Résumer un contenu (via IA) puis l\'envoyer par email Gmail',
    provider: 'google_gmail',
    operation: 'gmail.summarize_and_send',
    category: 'communication',
    actionType: 'hybrid',
    inputSchema: {
      type: 'object',
      properties: {
        contentToSummarize: { type: 'string', description: 'Contenu à résumer' },
        to: { type: 'string', format: 'email' },
        subject: { type: 'string' },
        maxLength: { type: 'number', default: 500 },
      },
      required: ['contentToSummarize', 'to', 'subject'],
    },
    steps: [
      { id: 'summarize', name: 'Résumer via IA', type: 'transform', config: { model: 'gpt-4o-mini', prompt: 'Résume le contenu suivant de manière concise et professionnelle en moins de {maxLength} caractères:\n\n{contentToSummarize}' } },
      { id: 'send', name: 'Envoyer par email', type: 'api_call', config: { method: 'POST', url: 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send' }, onError: 'retry', maxRetries: 2 },
    ],
    riskLevel: 'high',
    requiredScopes: ['https://www.googleapis.com/auth/gmail.send'],
    estimatedTimeMs: 8000,
  },
  {
    name: 'Créer issue + notifier Slack',
    description: 'Créer une issue GitHub puis notifier l\'équipe sur Slack',
    provider: 'github',
    operation: 'github.create_issue_and_notify',
    category: 'dev_tools',
    actionType: 'hybrid',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string' },
        repo: { type: 'string' },
        title: { type: 'string' },
        body: { type: 'string' },
        slackChannel: { type: 'string' },
      },
      required: ['owner', 'repo', 'title', 'slackChannel'],
    },
    steps: [
      { id: 'create_issue', name: 'Créer l\'issue GitHub', type: 'api_call', config: { method: 'POST', url: 'https://api.github.com/repos/{owner}/{repo}/issues' }, onError: 'abort', maxRetries: 2 },
      { id: 'notify', name: 'Notifier sur Slack', type: 'api_call', config: { method: 'POST', url: 'https://slack.com/api/chat.postMessage' }, onError: 'skip' },
    ],
    riskLevel: 'medium',
    requiredScopes: ['repo', 'chat:write'],
    estimatedTimeMs: 4000,
  },
];

// ============================================================
// TEMPLATE MANAGER
// ============================================================

export class ActionTemplateManager {
  private templates: Map<string, ActionTemplateDefinition> = new Map();

  constructor() {
    // Charger les templates built-in
    for (const template of BUILTIN_TEMPLATES) {
      this.templates.set(template.operation, template);
    }
  }

  /**
   * Obtenir un template par opération
   */
  getTemplate(operation: string): ActionTemplateDefinition | undefined {
    return this.templates.get(operation);
  }

  /**
   * Lister tous les templates, filtrables
   */
  listTemplates(filters?: {
    provider?: string;
    category?: TemplateCategory;
    riskLevel?: string;
    actionType?: TemplateActionType;
  }): ActionTemplateDefinition[] {
    let templates = Array.from(this.templates.values());

    if (filters?.provider) {
      templates = templates.filter(t => t.provider === filters.provider);
    }
    if (filters?.category) {
      templates = templates.filter(t => t.category === filters.category);
    }
    if (filters?.riskLevel) {
      templates = templates.filter(t => t.riskLevel === filters.riskLevel);
    }
    if (filters?.actionType) {
      templates = templates.filter(t => t.actionType === filters.actionType);
    }

    return templates;
  }

  /**
   * Lister les templates groupés par provider
   */
  listByProvider(): Record<string, ActionTemplateDefinition[]> {
    const grouped: Record<string, ActionTemplateDefinition[]> = {};
    for (const template of this.templates.values()) {
      if (!grouped[template.provider]) grouped[template.provider] = [];
      grouped[template.provider].push(template);
    }
    return grouped;
  }

  /**
   * Lister les templates groupés par catégorie
   */
  listByCategory(): Record<string, ActionTemplateDefinition[]> {
    const grouped: Record<string, ActionTemplateDefinition[]> = {};
    for (const template of this.templates.values()) {
      if (!grouped[template.category]) grouped[template.category] = [];
      grouped[template.category].push(template);
    }
    return grouped;
  }

  /**
   * Ajouter un template personnalisé
   */
  addCustomTemplate(template: ActionTemplateDefinition): void {
    this.templates.set(template.operation, template);
    log.info('Custom template added', { operation: template.operation, provider: template.provider });
  }

  /**
   * Supprimer un template personnalisé
   */
  removeCustomTemplate(operation: string): boolean {
    return this.templates.delete(operation);
  }

  /**
   * Synchroniser les templates built-in en DB
   */
  async syncToDatabase(): Promise<number> {
    let synced = 0;
    for (const template of BUILTIN_TEMPLATES) {
      try {
        await prisma.actionTemplate.upsert({
          where: { id: `builtin_${template.operation}` },
          create: {
            id: `builtin_${template.operation}`,
            name: template.name,
            description: template.description,
            provider: template.provider,
            operation: template.operation,
            category: template.category,
            actionType: template.actionType,
            inputSchema: JSON.stringify(template.inputSchema),
            outputSchema: template.outputSchema ? JSON.stringify(template.outputSchema) : null,
            steps: JSON.stringify(template.steps),
            riskLevel: template.riskLevel,
            requiredScopes: JSON.stringify(template.requiredScopes),
            estimatedTimeMs: template.estimatedTimeMs,
            isBuiltIn: true,
          },
          update: {
            name: template.name,
            description: template.description,
            inputSchema: JSON.stringify(template.inputSchema),
            outputSchema: template.outputSchema ? JSON.stringify(template.outputSchema) : null,
            steps: JSON.stringify(template.steps),
            riskLevel: template.riskLevel,
            requiredScopes: JSON.stringify(template.requiredScopes),
            estimatedTimeMs: template.estimatedTimeMs,
          },
        });
        synced++;
      } catch (error) {
        log.warn('Failed to sync template to DB', { operation: template.operation, error: String(error) });
      }
    }
    log.info('Templates synced to database', { synced, total: BUILTIN_TEMPLATES.length });
    return synced;
  }

  /**
   * Obtenir les statistiques
   */
  getStats(): {
    totalTemplates: number;
    byProvider: Record<string, number>;
    byCategory: Record<string, number>;
    byRiskLevel: Record<string, number>;
  } {
    const byProvider: Record<string, number> = {};
    const byCategory: Record<string, number> = {};
    const byRiskLevel: Record<string, number> = {};

    for (const t of this.templates.values()) {
      byProvider[t.provider] = (byProvider[t.provider] || 0) + 1;
      byCategory[t.category] = (byCategory[t.category] || 0) + 1;
      byRiskLevel[t.riskLevel] = (byRiskLevel[t.riskLevel] || 0) + 1;
    }

    return {
      totalTemplates: this.templates.size,
      byProvider,
      byCategory,
      byRiskLevel,
    };
  }
}

// ============================================================
// Singleton
// ============================================================

let templateManagerInstance: ActionTemplateManager | null = null;

export function getActionTemplateManager(): ActionTemplateManager {
  if (!templateManagerInstance) {
    templateManagerInstance = new ActionTemplateManager();
  }
  return templateManagerInstance;
}
