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

export type TemplateCategory = 'communication' | 'productivity' | 'crm' | 'dev_tools' | 'finance' | 'social' | 'file_management' | 'hr' | 'marketing' | 'support' | 'analytics' | 'ecommerce' | 'project_management' | 'data_entry';
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

  // ==========================================================
  // TEMPLATES MÉTIER — Finance, E-commerce, RH, Marketing, Support, Analytics, ERP
  // ==========================================================

  // === STRIPE (Finance) ===
  {
    name: 'Créer un client Stripe',
    description: 'Créer un nouveau customer dans Stripe avec email, nom et métadonnées',
    provider: 'stripe',
    operation: 'stripe.create_customer',
    category: 'finance',
    actionType: 'api_call',
    inputSchema: {
      type: 'object',
      properties: {
        email: { type: 'string', format: 'email', description: 'Email du client' },
        name: { type: 'string', description: 'Nom du client' },
        phone: { type: 'string' },
        metadata: { type: 'object', description: 'Métadonnées personnalisées' },
      },
      required: ['email'],
    },
    steps: [
      { id: 'create', name: 'Créer le customer', type: 'api_call', config: { method: 'POST', url: 'https://api.stripe.com/v1/customers' }, onError: 'retry', maxRetries: 2 },
    ],
    riskLevel: 'medium',
    requiredScopes: [],
    estimatedTimeMs: 2000,
  },
  {
    name: 'Lister les paiements Stripe',
    description: 'Récupérer la liste des paiements avec filtres (statut, date, montant)',
    provider: 'stripe',
    operation: 'stripe.list_payments',
    category: 'finance',
    actionType: 'api_call',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['succeeded', 'pending', 'failed'], description: 'Filtrer par statut' },
        limit: { type: 'number', default: 25 },
        created_after: { type: 'string', format: 'date' },
      },
    },
    steps: [
      { id: 'list', name: 'Lister les charges', type: 'api_call', config: { method: 'GET', url: 'https://api.stripe.com/v1/charges' } },
    ],
    riskLevel: 'low',
    requiredScopes: [],
    estimatedTimeMs: 2000,
  },
  {
    name: 'Créer un abonnement Stripe',
    description: 'Souscrire un client à un plan récurrent',
    provider: 'stripe',
    operation: 'stripe.create_subscription',
    category: 'finance',
    actionType: 'api_call',
    inputSchema: {
      type: 'object',
      properties: {
        customerId: { type: 'string', description: 'ID du customer Stripe' },
        priceId: { type: 'string', description: 'ID du price/plan' },
        trialPeriodDays: { type: 'number' },
        metadata: { type: 'object' },
      },
      required: ['customerId', 'priceId'],
    },
    steps: [
      { id: 'create', name: 'Créer l\'abonnement', type: 'api_call', config: { method: 'POST', url: 'https://api.stripe.com/v1/subscriptions' }, onError: 'retry', maxRetries: 2 },
    ],
    riskLevel: 'high',
    requiredScopes: [],
    estimatedTimeMs: 3000,
  },
  {
    name: 'Émettre un remboursement Stripe',
    description: 'Rembourser partiellement ou totalement un paiement',
    provider: 'stripe',
    operation: 'stripe.refund_payment',
    category: 'finance',
    actionType: 'api_call',
    inputSchema: {
      type: 'object',
      properties: {
        chargeId: { type: 'string', description: 'ID du charge à rembourser' },
        amount: { type: 'number', description: 'Montant en centimes (vide = total)' },
        reason: { type: 'string', enum: ['duplicate', 'fraudulent', 'requested_by_customer'] },
      },
      required: ['chargeId'],
    },
    steps: [
      { id: 'refund', name: 'Émettre le remboursement', type: 'api_call', config: { method: 'POST', url: 'https://api.stripe.com/v1/refunds' }, onError: 'retry', maxRetries: 2 },
    ],
    riskLevel: 'critical',
    requiredScopes: [],
    estimatedTimeMs: 3000,
  },

  // === SHOPIFY (E-commerce) ===
  {
    name: 'Lister les commandes Shopify',
    description: 'Récupérer les commandes avec filtres (statut, date, montant)',
    provider: 'shopify',
    operation: 'shopify.list_orders',
    category: 'ecommerce',
    actionType: 'api_call',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['open', 'closed', 'cancelled', 'any'], default: 'open' },
        limit: { type: 'number', default: 50 },
        created_at_min: { type: 'string', format: 'date' },
      },
    },
    steps: [
      { id: 'list', name: 'Lister les orders', type: 'api_call', config: { method: 'GET', url: 'https://{shop}.myshopify.com/admin/api/2024-01/orders.json' } },
    ],
    riskLevel: 'low',
    requiredScopes: [],
    estimatedTimeMs: 3000,
  },
  {
    name: 'Mettre à jour le stock Shopify',
    description: 'Ajuster le niveau de stock d\'une variante de produit',
    provider: 'shopify',
    operation: 'shopify.update_inventory',
    category: 'ecommerce',
    actionType: 'api_call',
    inputSchema: {
      type: 'object',
      properties: {
        inventoryItemId: { type: 'string' },
        locationId: { type: 'string' },
        available: { type: 'number', description: 'Nouvelle quantité disponible' },
      },
      required: ['inventoryItemId', 'locationId', 'available'],
    },
    steps: [
      { id: 'set', name: 'Mettre à jour le stock', type: 'api_call', config: { method: 'POST', url: 'https://{shop}.myshopify.com/admin/api/2024-01/inventory_levels/set.json' }, onError: 'retry', maxRetries: 2 },
    ],
    riskLevel: 'high',
    requiredScopes: [],
    estimatedTimeMs: 3000,
  },
  {
    name: 'Créer un produit Shopify',
    description: 'Ajouter un nouveau produit au catalogue avec titre, prix, description et images',
    provider: 'shopify',
    operation: 'shopify.create_product',
    category: 'ecommerce',
    actionType: 'api_call',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        body_html: { type: 'string', description: 'Description HTML' },
        vendor: { type: 'string' },
        product_type: { type: 'string' },
        variants: { type: 'array', items: { type: 'object' } },
      },
      required: ['title'],
    },
    steps: [
      { id: 'create', name: 'Créer le produit', type: 'api_call', config: { method: 'POST', url: 'https://{shop}.myshopify.com/admin/api/2024-01/products.json' }, onError: 'retry', maxRetries: 2 },
    ],
    riskLevel: 'medium',
    requiredScopes: [],
    estimatedTimeMs: 4000,
  },

  // === HUBSPOT CRM Avancé ===
  {
    name: 'Créer un deal HubSpot',
    description: 'Créer une opportunité commerciale avec pipeline, montant et étape',
    provider: 'hubspot',
    operation: 'hubspot.create_deal',
    category: 'crm',
    actionType: 'api_call',
    inputSchema: {
      type: 'object',
      properties: {
        dealname: { type: 'string', description: 'Nom du deal' },
        amount: { type: 'string', description: 'Montant' },
        pipeline: { type: 'string' },
        dealstage: { type: 'string', description: 'ID de l\'étape du pipeline' },
        closedate: { type: 'string', format: 'date' },
      },
      required: ['dealname'],
    },
    steps: [
      { id: 'create', name: 'Créer le deal', type: 'api_call', config: { method: 'POST', url: 'https://api.hubapi.com/crm/v3/objects/deals' }, onError: 'retry', maxRetries: 2 },
    ],
    riskLevel: 'medium',
    requiredScopes: ['crm.objects.deals.write'],
    estimatedTimeMs: 2500,
  },
  {
    name: 'Mettre à jour le pipeline HubSpot',
    description: 'Déplacer un deal d\'une étape à l\'autre dans le pipeline CRM',
    provider: 'hubspot',
    operation: 'hubspot.update_deal_stage',
    category: 'crm',
    actionType: 'api_call',
    inputSchema: {
      type: 'object',
      properties: {
        dealId: { type: 'string' },
        dealstage: { type: 'string', description: 'Nouvelle étape' },
        probability: { type: 'number' },
      },
      required: ['dealId', 'dealstage'],
    },
    steps: [
      { id: 'update', name: 'Mettre à jour l\'étape', type: 'api_call', config: { method: 'PATCH', url: 'https://api.hubapi.com/crm/v3/objects/deals/{dealId}' }, onError: 'retry', maxRetries: 2 },
    ],
    riskLevel: 'medium',
    requiredScopes: ['crm.objects.deals.write'],
    estimatedTimeMs: 2000,
  },

  // === SALESFORCE Avancé ===
  {
    name: 'Créer une opportunité Salesforce',
    description: 'Créer une opportunity avec montant, étape et date de clôture',
    provider: 'salesforce',
    operation: 'salesforce.create_opportunity',
    category: 'crm',
    actionType: 'api_call',
    inputSchema: {
      type: 'object',
      properties: {
        Name: { type: 'string' },
        Amount: { type: 'number' },
        StageName: { type: 'string', default: 'Prospecting' },
        CloseDate: { type: 'string', format: 'date' },
        AccountId: { type: 'string' },
      },
      required: ['Name', 'CloseDate'],
    },
    steps: [
      { id: 'create', name: 'Créer l\'opportunité', type: 'api_call', config: { method: 'POST', url: 'https://yourinstance.salesforce.com/services/data/v58.0/sobjects/Opportunity' }, onError: 'retry', maxRetries: 2 },
    ],
    riskLevel: 'medium',
    requiredScopes: ['api'],
    estimatedTimeMs: 3000,
  },
  {
    name: 'Mettre à jour un lead Salesforce',
    description: 'Modifier le statut et les informations d\'un lead (conversion, qualification)',
    provider: 'salesforce',
    operation: 'salesforce.update_lead',
    category: 'crm',
    actionType: 'api_call',
    inputSchema: {
      type: 'object',
      properties: {
        leadId: { type: 'string' },
        Status: { type: 'string', enum: ['Open - Not Contacted', 'Working - Contacted', 'Closed - Converted', 'Closed - Not Converted'] },
        Company: { type: 'string' },
        Rating: { type: 'string' },
      },
      required: ['leadId'],
    },
    steps: [
      { id: 'update', name: 'Mettre à jour le lead', type: 'api_call', config: { method: 'PATCH', url: 'https://yourinstance.salesforce.com/services/data/v58.0/sobjects/Lead/{leadId}' }, onError: 'retry', maxRetries: 2 },
    ],
    riskLevel: 'medium',
    requiredScopes: ['api'],
    estimatedTimeMs: 2500,
  },

  // === GMAIL Avancé (Support client) ===
  {
    name: 'Répondre à un email avec modèle',
    description: 'Répondre à un thread email existant en utilisant un template de réponse (support client, notification, etc.)',
    provider: 'google_gmail',
    operation: 'gmail.reply_with_template',
    category: 'support',
    actionType: 'hybrid',
    inputSchema: {
      type: 'object',
      properties: {
        messageId: { type: 'string', description: 'ID du message auquel répondre' },
        templateId: { type: 'string', description: 'ID du template de réponse' },
        variables: { type: 'object', description: 'Variables à injecter dans le template' },
      },
      required: ['messageId', 'templateId'],
    },
    steps: [
      { id: 'get_original', name: 'Récupérer l\'email original', type: 'api_call', config: { method: 'GET', url: 'https://gmail.googleapis.com/gmail/v1/users/me/messages/{messageId}' } },
      { id: 'apply_template', name: 'Appliquer le template', type: 'transform', config: { model: 'gpt-4o-mini', prompt: 'Applique le template de réponse au contenu de l\'email original' } },
      { id: 'send_reply', name: 'Envoyer la réponse', type: 'api_call', config: { method: 'POST', url: 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send' }, onError: 'retry', maxRetries: 2 },
    ],
    riskLevel: 'high',
    requiredScopes: ['https://www.googleapis.com/auth/gmail.modify'],
    estimatedTimeMs: 10000,
  },
  {
    name: 'Classer les emails par catégorie',
    description: 'Analyser les emails non lus et les classer automatiquement (support, notification, spam, urgent)',
    provider: 'google_gmail',
    operation: 'gmail.auto_classify',
    category: 'support',
    actionType: 'hybrid',
    inputSchema: {
      type: 'object',
      properties: {
        maxEmails: { type: 'number', default: 20 },
        categories: { type: 'array', items: { type: 'string' }, default: ['urgent', 'support', 'notification', 'newsletter', 'internal'] },
      },
    },
    steps: [
      { id: 'list', name: 'Lister les emails non lus', type: 'api_call', config: { method: 'GET', url: 'https://gmail.googleapis.com/gmail/v1/users/me/messages' } },
      { id: 'classify', name: 'Classifier par IA', type: 'transform', config: { model: 'gpt-4o-mini', prompt: 'Classifie chaque email dans la catégorie appropriée' } },
      { id: 'label', name: 'Appliquer les labels', type: 'api_call', config: { method: 'POST', url: 'https://gmail.googleapis.com/gmail/v1/users/me/messages/{messageId}/modify' }, onError: 'skip' },
    ],
    riskLevel: 'medium',
    requiredScopes: ['https://www.googleapis.com/auth/gmail.modify'],
    estimatedTimeMs: 15000,
  },

  // === SLACK Avancé (Communication d\'équipe) ===
  {
    name: 'Envoyer un rapport quotidien Slack',
    description: 'Compiler les métriques du jour et poster un rapport formaté sur un canal',
    provider: 'slack',
    operation: 'slack.post_daily_report',
    category: 'communication',
    actionType: 'hybrid',
    inputSchema: {
      type: 'object',
      properties: {
        channel: { type: 'string', description: 'Canal de destination' },
        reportType: { type: 'string', enum: ['sales', 'engineering', 'support', 'marketing'], description: 'Type de rapport' },
        date: { type: 'string', format: 'date' },
      },
      required: ['channel', 'reportType'],
    },
    steps: [
      { id: 'gather', name: 'Collecter les données', type: 'api_call', config: { method: 'GET', url: '/api/metrics' } },
      { id: 'format', name: 'Formater le rapport', type: 'transform', config: { model: 'gpt-4o-mini', prompt: 'Formate les métriques en rapport Slack lisible avec Block Kit' } },
      { id: 'post', name: 'Poster le rapport', type: 'api_call', config: { method: 'POST', url: 'https://slack.com/api/chat.postMessage' }, onError: 'retry', maxRetries: 2 },
    ],
    riskLevel: 'medium',
    requiredScopes: ['chat:write'],
    estimatedTimeMs: 8000,
  },
  {
    name: 'Créer un sondage Slack',
    description: 'Créer et poster un sondage interactif avec emoji reactions comme votes',
    provider: 'slack',
    operation: 'slack.create_poll',
    category: 'communication',
    actionType: 'api_call',
    inputSchema: {
      type: 'object',
      properties: {
        channel: { type: 'string' },
        question: { type: 'string' },
        options: { type: 'array', items: { type: 'string' }, description: 'Options du sondage' },
        anonymous: { type: 'boolean', default: false },
      },
      required: ['channel', 'question', 'options'],
    },
    steps: [
      { id: 'post', name: 'Poster le sondage', type: 'api_call', config: { method: 'POST', url: 'https://slack.com/api/chat.postMessage' }, onError: 'retry', maxRetries: 2 },
    ],
    riskLevel: 'low',
    requiredScopes: ['chat:write', 'reactions:write'],
    estimatedTimeMs: 2000,
  },

  // === NOTION Avancé (Gestion de projet) ===
  {
    name: 'Créer un ticket de projet Notion',
    description: 'Créer une page dans une base de données projet avec titre, assigné, priorité et échéance',
    provider: 'notion',
    operation: 'notion.create_project_ticket',
    category: 'project_management',
    actionType: 'api_call',
    inputSchema: {
      type: 'object',
      properties: {
        databaseId: { type: 'string', description: 'ID de la base de données Notion' },
        title: { type: 'string' },
        assignee: { type: 'string' },
        priority: { type: 'string', enum: ['P0', 'P1', 'P2', 'P3'], default: 'P2' },
        dueDate: { type: 'string', format: 'date' },
        labels: { type: 'array', items: { type: 'string' } },
        description: { type: 'string' },
      },
      required: ['databaseId', 'title'],
    },
    steps: [
      { id: 'create', name: 'Créer le ticket', type: 'api_call', config: { method: 'POST', url: 'https://api.notion.com/v1/pages' }, onError: 'retry', maxRetries: 2 },
    ],
    riskLevel: 'medium',
    requiredScopes: [],
    estimatedTimeMs: 3000,
  },
  {
    name: 'Mettre à jour le statut Notion',
    description: 'Changer le statut d\'un ticket (Todo → In Progress → Done)',
    provider: 'notion',
    operation: 'notion.update_ticket_status',
    category: 'project_management',
    actionType: 'api_call',
    inputSchema: {
      type: 'object',
      properties: {
        pageId: { type: 'string' },
        status: { type: 'string', enum: ['Todo', 'In Progress', 'In Review', 'Done', 'Cancelled'] },
      },
      required: ['pageId', 'status'],
    },
    steps: [
      { id: 'update', name: 'Mettre à jour le statut', type: 'api_call', config: { method: 'PATCH', url: 'https://api.notion.com/v1/pages/{pageId}' }, onError: 'retry', maxRetries: 2 },
    ],
    riskLevel: 'low',
    requiredScopes: [],
    estimatedTimeMs: 2000,
  },
  {
    name: 'Récupérer le board Kanban Notion',
    description: 'Récupérer toutes les pages d\'une base groupées par statut',
    provider: 'notion',
    operation: 'notion.get_kanban_board',
    category: 'project_management',
    actionType: 'api_call',
    inputSchema: {
      type: 'object',
      properties: {
        databaseId: { type: 'string' },
        groupBy: { type: 'string', default: 'Status' },
        pageSize: { type: 'number', default: 100 },
      },
      required: ['databaseId'],
    },
    steps: [
      { id: 'query', name: 'Requêter la base', type: 'api_call', config: { method: 'POST', url: 'https://api.notion.com/v1/databases/{databaseId}/query' } },
    ],
    riskLevel: 'low',
    requiredScopes: [],
    estimatedTimeMs: 3000,
  },

  // === GITHUB Avancé ===
  {
    name: 'Créer une Pull Request GitHub',
    description: 'Créer une PR avec titre, description, reviewers et labels',
    provider: 'github',
    operation: 'github.create_pr',
    category: 'dev_tools',
    actionType: 'api_call',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string' },
        repo: { type: 'string' },
        title: { type: 'string' },
        body: { type: 'string' },
        head: { type: 'string', description: 'Branche source' },
        base: { type: 'string', default: 'main', description: 'Branche cible' },
        reviewers: { type: 'array', items: { type: 'string' } },
      },
      required: ['owner', 'repo', 'title', 'head'],
    },
    steps: [
      { id: 'create', name: 'Créer la PR', type: 'api_call', config: { method: 'POST', url: 'https://api.github.com/repos/{owner}/{repo}/pulls' }, onError: 'retry', maxRetries: 2 },
    ],
    riskLevel: 'medium',
    requiredScopes: ['repo'],
    estimatedTimeMs: 3000,
  },
  {
    name: 'Merger une Pull Request GitHub',
    description: 'Merger une PR après vérification des checks CI',
    provider: 'github',
    operation: 'github.merge_pr',
    category: 'dev_tools',
    actionType: 'api_call',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string' },
        repo: { type: 'string' },
        pullNumber: { type: 'number' },
        mergeMethod: { type: 'string', enum: ['merge', 'squash', 'rebase'], default: 'squash' },
      },
      required: ['owner', 'repo', 'pullNumber'],
    },
    steps: [
      { id: 'check', name: 'Vérifier les checks CI', type: 'api_call', config: { method: 'GET', url: 'https://api.github.com/repos/{owner}/{repo}/commits/{ref}/check-runs' } },
      { id: 'merge', name: 'Merger la PR', type: 'api_call', config: { method: 'PUT', url: 'https://api.github.com/repos/{owner}/{repo}/pulls/{pullNumber}/merge' }, onError: 'retry', maxRetries: 2 },
    ],
    riskLevel: 'high',
    requiredScopes: ['repo'],
    estimatedTimeMs: 5000,
  },

  // === GOOGLE DRIVE / DOCS (Gestion de fichiers) ===
  {
    name: 'Créer un document Google Docs',
    description: 'Créer un nouveau document Google Docs avec contenu initial',
    provider: 'google_docs',
    operation: 'docs.create_document',
    category: 'file_management',
    actionType: 'api_call',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        content: { type: 'string', description: 'Contenu initial du document' },
        folderId: { type: 'string', description: 'ID du dossier parent Drive' },
      },
      required: ['title'],
    },
    steps: [
      { id: 'create', name: 'Créer le document', type: 'api_call', config: { method: 'POST', url: 'https://docs.googleapis.com/v1/documents' }, onError: 'retry', maxRetries: 2 },
    ],
    riskLevel: 'medium',
    requiredScopes: ['https://www.googleapis.com/auth/documents'],
    estimatedTimeMs: 3000,
  },
  {
    name: 'Partager un fichier Drive',
    description: 'Partager un fichier ou dossier Google Drive avec permissions spécifiques',
    provider: 'google_drive',
    operation: 'drive.share_file',
    category: 'file_management',
    actionType: 'api_call',
    inputSchema: {
      type: 'object',
      properties: {
        fileId: { type: 'string' },
        emailAddress: { type: 'string', format: 'email' },
        role: { type: 'string', enum: ['reader', 'writer', 'commenter', 'owner'] },
        type: { type: 'string', enum: ['user', 'group', 'domain', 'anyone'], default: 'user' },
      },
      required: ['fileId', 'emailAddress', 'role'],
    },
    steps: [
      { id: 'share', name: 'Créer la permission', type: 'api_call', config: { method: 'POST', url: 'https://www.googleapis.com/drive/v3/files/{fileId}/permissions' }, onError: 'retry', maxRetries: 2 },
    ],
    riskLevel: 'high',
    requiredScopes: ['https://www.googleapis.com/auth/drive'],
    estimatedTimeMs: 2000,
  },

  // === JIRA Avancé ===
  {
    name: 'Transitions de ticket Jira',
    description: 'Changer le statut d\'un ticket Jira via les transitions disponibles',
    provider: 'jira',
    operation: 'jira.transition_issue',
    category: 'project_management',
    actionType: 'api_call',
    inputSchema: {
      type: 'object',
      properties: {
        issueKey: { type: 'string' },
        transitionId: { type: 'string', description: 'ID de la transition (ex: 31 = Done)' },
        comment: { type: 'string' },
      },
      required: ['issueKey', 'transitionId'],
    },
    steps: [
      { id: 'transition', name: 'Appliquer la transition', type: 'api_call', config: { method: 'POST', url: 'https://yourdomain.atlassian.net/rest/api/3/issue/{issueKey}/transitions' }, onError: 'retry', maxRetries: 2 },
    ],
    riskLevel: 'medium',
    requiredScopes: ['write:jira-work'],
    estimatedTimeMs: 2500,
  },

  // === LINKEDIN Avancé (Marketing social) ===
  {
    name: 'Analyser les métriques LinkedIn',
    description: 'Récupérer les statistiques d\'engagement des posts LinkedIn',
    provider: 'linkedin',
    operation: 'linkedin.get_analytics',
    category: 'marketing',
    actionType: 'api_call',
    inputSchema: {
      type: 'object',
      properties: {
        urn: { type: 'string', description: 'URN du post ou de la page' },
        timeRange: { type: 'object', properties: { start: { type: 'string' }, end: { type: 'string' } } },
      },
    },
    steps: [
      { id: 'stats', name: 'Récupérer les stats', type: 'api_call', config: { method: 'GET', url: 'https://api.linkedin.com/v2/organizationalEntityShareStatistics' } },
    ],
    riskLevel: 'low',
    requiredScopes: ['r_organization_social'],
    estimatedTimeMs: 3000,
  },

  // === TRELLO (Gestion de projet) ===
  {
    name: 'Créer une carte Trello',
    description: 'Ajouter une carte sur un board Trello avec labels, assigné et échéance',
    provider: 'trello',
    operation: 'trello.create_card',
    category: 'project_management',
    actionType: 'api_call',
    inputSchema: {
      type: 'object',
      properties: {
        idList: { type: 'string', description: 'ID de la liste' },
        name: { type: 'string' },
        desc: { type: 'string' },
        due: { type: 'string', format: 'date' },
        idLabels: { type: 'array', items: { type: 'string' } },
        idMembers: { type: 'array', items: { type: 'string' } },
      },
      required: ['idList', 'name'],
    },
    steps: [
      { id: 'create', name: 'Créer la carte', type: 'api_call', config: { method: 'POST', url: 'https://api.trello.com/1/cards' }, onError: 'retry', maxRetries: 2 },
    ],
    riskLevel: 'low',
    requiredScopes: [],
    estimatedTimeMs: 2000,
  },
  {
    name: 'Déplacer une carte Trello',
    description: 'Déplacer une carte vers une autre liste (changement de colonne Kanban)',
    provider: 'trello',
    operation: 'trello.move_card',
    category: 'project_management',
    actionType: 'api_call',
    inputSchema: {
      type: 'object',
      properties: {
        cardId: { type: 'string' },
        idList: { type: 'string', description: 'ID de la liste de destination' },
        pos: { type: 'string', enum: ['top', 'bottom'] },
      },
      required: ['cardId', 'idList'],
    },
    steps: [
      { id: 'move', name: 'Déplacer la carte', type: 'api_call', config: { method: 'PUT', url: 'https://api.trello.com/1/cards/{cardId}' }, onError: 'retry', maxRetries: 2 },
    ],
    riskLevel: 'low',
    requiredScopes: [],
    estimatedTimeMs: 2000,
  },

  // === LINEAR (Dev Tools) ===
  {
    name: 'Créer une issue Linear',
    description: 'Créer un ticket dans un projet Linear avec priorité et assigné',
    provider: 'linear',
    operation: 'linear.create_issue',
    category: 'dev_tools',
    actionType: 'api_call',
    inputSchema: {
      type: 'object',
      properties: {
        teamId: { type: 'string' },
        title: { type: 'string' },
        description: { type: 'string' },
        priority: { type: 'number', enum: [0, 1, 2, 3, 4], description: '0=No,1=Urgent,2=High,3=Medium,4=Low' },
        assigneeId: { type: 'string' },
        labels: { type: 'array', items: { type: 'string' } },
      },
      required: ['teamId', 'title'],
    },
    steps: [
      { id: 'create', name: 'Créer l\'issue', type: 'api_call', config: { method: 'POST', url: 'https://api.linear.app/graphql' }, onError: 'retry', maxRetries: 2 },
    ],
    riskLevel: 'low',
    requiredScopes: [],
    estimatedTimeMs: 2000,
  },

  // === ASANA (Gestion de projet) ===
  {
    name: 'Créer une tâche Asana',
    description: 'Créer une tâche dans un projet Asana avec assigné, échéance et notes',
    provider: 'asana',
    operation: 'asana.create_task',
    category: 'project_management',
    actionType: 'api_call',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string' },
        name: { type: 'string' },
        notes: { type: 'string' },
        assignee: { type: 'string' },
        due_on: { type: 'string', format: 'date' },
        tags: { type: 'array', items: { type: 'string' } },
      },
      required: ['projectId', 'name'],
    },
    steps: [
      { id: 'create', name: 'Créer la tâche', type: 'api_call', config: { method: 'POST', url: 'https://app.asana.com/api/1.0/tasks' }, onError: 'retry', maxRetries: 2 },
    ],
    riskLevel: 'low',
    requiredScopes: [],
    estimatedTimeMs: 2500,
  },

  // === COMPOSÉS MÉTIER AVANCÉS ===
  {
    name: 'Pipeline de qualification lead',
    description: 'Créer un contact CRM + envoyer email de bienvenue + créer tâche de suivi + notifier l\'équipe',
    provider: 'hubspot',
    operation: 'hubspot.lead_qualification_pipeline',
    category: 'crm',
    actionType: 'hybrid',
    inputSchema: {
      type: 'object',
      properties: {
        email: { type: 'string', format: 'email' },
        firstname: { type: 'string' },
        lastname: { type: 'string' },
        company: { type: 'string' },
        phone: { type: 'string' },
        source: { type: 'string' },
        slackChannel: { type: 'string' },
      },
      required: ['email'],
    },
    steps: [
      { id: 'create_contact', name: 'Créer le contact HubSpot', type: 'api_call', config: { method: 'POST', url: 'https://api.hubapi.com/crm/v3/objects/contacts' }, onError: 'abort', maxRetries: 2 },
      { id: 'send_welcome', name: 'Envoyer email bienvenue', type: 'api_call', config: { method: 'POST', url: 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send' }, onError: 'skip' },
      { id: 'create_task', name: 'Créer tâche de suivi', type: 'api_call', config: { method: 'POST', url: 'https://api.hubapi.com/crm/v3/objects/tasks' }, onError: 'skip' },
      { id: 'notify_slack', name: 'Notifier sur Slack', type: 'api_call', config: { method: 'POST', url: 'https://slack.com/api/chat.postMessage' }, onError: 'skip' },
    ],
    riskLevel: 'high',
    requiredScopes: ['crm.objects.contacts.write', 'https://www.googleapis.com/auth/gmail.send', 'chat:write'],
    estimatedTimeMs: 12000,
  },
  {
    name: 'Onboarding employé',
    description: 'Workflow d\'onboarding: créer compte email + ajouter Slack + créer ticket Notion + configurer accès',
    provider: 'google_gmail',
    operation: 'hr.employee_onboarding',
    category: 'hr',
    actionType: 'hybrid',
    inputSchema: {
      type: 'object',
      properties: {
        employeeName: { type: 'string' },
        employeeEmail: { type: 'string', format: 'email' },
        department: { type: 'string' },
        startDate: { type: 'string', format: 'date' },
        manager: { type: 'string' },
        slackChannel: { type: 'string' },
        notionDatabaseId: { type: 'string' },
      },
      required: ['employeeName', 'employeeEmail', 'department'],
    },
    steps: [
      { id: 'send_welcome', name: 'Email de bienvenue', type: 'api_call', config: { method: 'POST', url: 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send' }, onError: 'skip' },
      { id: 'slack_invite', name: 'Notifier Slack', type: 'api_call', config: { method: 'POST', url: 'https://slack.com/api/chat.postMessage' }, onError: 'skip' },
      { id: 'notion_ticket', name: 'Créer ticket onboarding Notion', type: 'api_call', config: { method: 'POST', url: 'https://api.notion.com/v1/pages' }, onError: 'skip' },
      { id: 'calendar_event', name: 'Créer événement Calendar', type: 'api_call', config: { method: 'POST', url: 'https://www.googleapis.com/calendar/v3/calendars/primary/events' }, onError: 'skip' },
    ],
    riskLevel: 'high',
    requiredScopes: ['https://www.googleapis.com/auth/gmail.send', 'chat:write', 'https://www.googleapis.com/auth/calendar.events'],
    estimatedTimeMs: 15000,
  },
  {
    name: 'Rapport hebdomadaire multi-sources',
    description: 'Compiler métriques Stripe + GitHub + Jira → résumer via IA → poster Slack + envoyer email',
    provider: 'stripe',
    operation: 'analytics.weekly_report',
    category: 'analytics',
    actionType: 'hybrid',
    inputSchema: {
      type: 'object',
      properties: {
        slackChannel: { type: 'string' },
        emailTo: { type: 'string', format: 'email' },
        weekStart: { type: 'string', format: 'date' },
      },
      required: ['slackChannel', 'emailTo'],
    },
    steps: [
      { id: 'stripe_metrics', name: 'Métriques Stripe', type: 'api_call', config: { method: 'GET', url: 'https://api.stripe.com/v1/balance_transactions' } },
      { id: 'github_metrics', name: 'Métriques GitHub', type: 'api_call', config: { method: 'GET', url: 'https://api.github.com/repos/{owner}/{repo}/stats/commit_activity' } },
      { id: 'summarize', name: 'Résumer via IA', type: 'transform', config: { model: 'gpt-4o-mini', prompt: 'Génère un rapport hebdomadaire professionnel à partir des métriques collectées' } },
      { id: 'post_slack', name: 'Poster sur Slack', type: 'api_call', config: { method: 'POST', url: 'https://slack.com/api/chat.postMessage' }, onError: 'skip' },
      { id: 'send_email', name: 'Envoyer par email', type: 'api_call', config: { method: 'POST', url: 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send' }, onError: 'skip' },
    ],
    riskLevel: 'medium',
    requiredScopes: ['chat:write', 'https://www.googleapis.com/auth/gmail.send', 'repo'],
    estimatedTimeMs: 20000,
  },
  {
    name: 'Déploiement automatisé',
    description: 'Merger PR GitHub + vérifier CI + déployer + notifier l\'équipe + créer ticket release',
    provider: 'github',
    operation: 'devops.automated_deploy',
    category: 'dev_tools',
    actionType: 'hybrid',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string' },
        repo: { type: 'string' },
        pullNumber: { type: 'number' },
        environment: { type: 'string', enum: ['staging', 'production'] },
        slackChannel: { type: 'string' },
        notionDatabaseId: { type: 'string' },
      },
      required: ['owner', 'repo', 'pullNumber', 'environment'],
    },
    steps: [
      { id: 'check_ci', name: 'Vérifier CI', type: 'api_call', config: { method: 'GET', url: 'https://api.github.com/repos/{owner}/{repo}/commits/{ref}/check-runs' } },
      { id: 'merge', name: 'Merger la PR', type: 'api_call', config: { method: 'PUT', url: 'https://api.github.com/repos/{owner}/{repo}/pulls/{pullNumber}/merge' }, onError: 'abort' },
      { id: 'deploy', name: 'Déclencher le déploiement', type: 'api_call', config: { method: 'POST', url: 'https://api.github.com/repos/{owner}/{repo}/dispatches' }, onError: 'retry', maxRetries: 3 },
      { id: 'notify', name: 'Notifier l\'équipe', type: 'api_call', config: { method: 'POST', url: 'https://slack.com/api/chat.postMessage' }, onError: 'skip' },
      { id: 'release_ticket', name: 'Créer ticket release Notion', type: 'api_call', config: { method: 'POST', url: 'https://api.notion.com/v1/pages' }, onError: 'skip' },
    ],
    riskLevel: 'critical',
    requiredScopes: ['repo', 'chat:write'],
    estimatedTimeMs: 30000,
  },
  {
    name: 'Saisie de données depuis email',
    description: 'Extraire les données structurées d\'un email (facture, bon de commande) → insérer dans le CRM/ERP',
    provider: 'google_gmail',
    operation: 'data_entry.extract_and_insert',
    category: 'data_entry',
    actionType: 'hybrid',
    inputSchema: {
      type: 'object',
      properties: {
        messageId: { type: 'string', description: 'ID de l\'email à traiter' },
        targetSystem: { type: 'string', enum: ['hubspot', 'salesforce', 'notion'], description: 'Système cible' },
        dataMapping: { type: 'object', description: 'Mapping champ email → champ cible' },
      },
      required: ['messageId', 'targetSystem'],
    },
    steps: [
      { id: 'read_email', name: 'Lire l\'email', type: 'api_call', config: { method: 'GET', url: 'https://gmail.googleapis.com/gmail/v1/users/me/messages/{messageId}' } },
      { id: 'extract', name: 'Extraire les données via IA', type: 'transform', config: { model: 'gpt-4o', prompt: 'Extrais les données structurées de cet email (montant, date, fournisseur, articles, etc.)' } },
      { id: 'insert', name: 'Insérer dans le système cible', type: 'api_call', config: { method: 'POST', url: 'dynamic' }, onError: 'retry', maxRetries: 2 },
    ],
    riskLevel: 'high',
    requiredScopes: ['https://www.googleapis.com/auth/gmail.readonly'],
    estimatedTimeMs: 12000,
  },
  {
    name: 'Facturation automatique',
    description: 'Créer une facture Stripe + envoyer par email + créer entrée comptable Notion + mettre à jour le deal CRM',
    provider: 'stripe',
    operation: 'finance.auto_invoice',
    category: 'finance',
    actionType: 'hybrid',
    inputSchema: {
      type: 'object',
      properties: {
        customerId: { type: 'string' },
        amount: { type: 'number' },
        description: { type: 'string' },
        dueDate: { type: 'string', format: 'date' },
        emailTo: { type: 'string', format: 'email' },
        dealId: { type: 'string' },
      },
      required: ['customerId', 'amount', 'description'],
    },
    steps: [
      { id: 'create_invoice', name: 'Créer la facture Stripe', type: 'api_call', config: { method: 'POST', url: 'https://api.stripe.com/v1/invoices' }, onError: 'abort', maxRetries: 2 },
      { id: 'send_invoice', name: 'Envoyer la facture', type: 'api_call', config: { method: 'POST', url: 'https://api.stripe.com/v1/invoices/{invoiceId}/send' }, onError: 'skip' },
      { id: 'email_copy', name: 'Envoyer copie par email', type: 'api_call', config: { method: 'POST', url: 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send' }, onError: 'skip' },
      { id: 'notion_entry', name: 'Créer entrée Notion', type: 'api_call', config: { method: 'POST', url: 'https://api.notion.com/v1/pages' }, onError: 'skip' },
    ],
    riskLevel: 'high',
    requiredScopes: ['https://www.googleapis.com/auth/gmail.send'],
    estimatedTimeMs: 15000,
  },

  // === BROWSER AUTOMATION (sites sans API) ===
  {
    name: 'Naviguer et extraire (Canva)',
    description: 'Ouvrir Canva, naviguer vers un design, exporter en PNG ou PDF via browser automation',
    provider: 'canva',
    operation: 'canva.export_design',
    category: 'productivity',
    actionType: 'browser_automation',
    inputSchema: {
      type: 'object',
      properties: {
        designUrl: { type: 'string', description: 'URL du design Canva' },
        format: { type: 'string', enum: ['png', 'pdf', 'jpg'], default: 'png' },
      },
      required: ['designUrl'],
    },
    steps: [
      { id: 'navigate', name: 'Ouvrir le design', type: 'browser_action', config: { actionType: 'navigate', url: '{designUrl}' } },
      { id: 'click_export', name: 'Cliquer Exporter', type: 'browser_action', config: { actionType: 'click', selector: '[data-testid="header-export-button"]' } },
      { id: 'select_format', name: 'Sélectionner format', type: 'browser_action', config: { actionType: 'click', selector: '[data-testid="export-{format}-option"]' } },
      { id: 'download', name: 'Télécharger', type: 'browser_action', config: { actionType: 'click', selector: '[data-testid="export-download-button"]' } },
    ],
    riskLevel: 'low',
    requiredScopes: [],
    estimatedTimeMs: 15000,
  },
  {
    name: 'Publier sur WordPress',
    description: 'Se connecter au dashboard WordPress et publier un article via browser automation',
    provider: 'wordpress',
    operation: 'wordpress.publish_post',
    category: 'marketing',
    actionType: 'browser_automation',
    inputSchema: {
      type: 'object',
      properties: {
        wpAdminUrl: { type: 'string', description: 'URL du wp-admin' },
        title: { type: 'string' },
        content: { type: 'string' },
        categories: { type: 'array', items: { type: 'string' } },
        status: { type: 'string', enum: ['draft', 'publish'], default: 'draft' },
      },
      required: ['wpAdminUrl', 'title', 'content'],
    },
    steps: [
      { id: 'navigate', name: 'Aller au nouveau post', type: 'browser_action', config: { actionType: 'navigate', url: '{wpAdminUrl}/post-new.php' } },
      { id: 'fill_title', name: 'Remplir le titre', type: 'browser_action', config: { actionType: 'type', selector: '#title', value: '{title}' } },
      { id: 'fill_content', name: 'Remplir le contenu', type: 'browser_action', config: { actionType: 'type', selector: '#content', value: '{content}' } },
      { id: 'publish', name: 'Publier', type: 'browser_action', config: { actionType: 'click', selector: '#publish' } },
    ],
    riskLevel: 'high',
    requiredScopes: [],
    estimatedTimeMs: 20000,
  },
  {
    name: 'Scraping Tableau Dashboard',
    description: 'Se connecter à Tableau, naviguer vers un dashboard et extraire les données visibles',
    provider: 'tableau',
    operation: 'tableau.extract_dashboard_data',
    category: 'analytics',
    actionType: 'browser_automation',
    inputSchema: {
      type: 'object',
      properties: {
        dashboardUrl: { type: 'string', description: 'URL du dashboard Tableau' },
        selectors: { type: 'array', items: { type: 'string' }, description: 'Sélecteurs CSS des éléments à extraire' },
      },
      required: ['dashboardUrl'],
    },
    steps: [
      { id: 'navigate', name: 'Ouvrir le dashboard', type: 'browser_action', config: { actionType: 'navigate', url: '{dashboardUrl}' } },
      { id: 'wait_load', name: 'Attendre le chargement', type: 'browser_action', config: { actionType: 'wait', value: '5000' } },
      { id: 'screenshot', name: 'Capturer le dashboard', type: 'browser_action', config: { actionType: 'screenshot' } },
      { id: 'extract', name: 'Extraire les données', type: 'browser_action', config: { actionType: 'extract', selector: '.tab-data' } },
    ],
    riskLevel: 'low',
    requiredScopes: [],
    estimatedTimeMs: 25000,
  },
  {
    name: 'Naviguer sur site sans API (générique)',
    description: 'Template générique pour naviguer sur un site web arbitraire, remplir des formulaires et extraire des données',
    provider: 'generic_web',
    operation: 'browser.generic_web_automation',
    category: 'data_entry',
    actionType: 'browser_automation',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL de départ' },
        actions: { type: 'array', items: { type: 'object', properties: { type: { type: 'string' }, selector: { type: 'string' }, value: { type: 'string' } } }, description: 'Séquence d\'actions navigateur' },
        extractSelectors: { type: 'array', items: { type: 'string' } },
        takeScreenshots: { type: 'boolean', default: true },
      },
      required: ['url', 'actions'],
    },
    steps: [
      { id: 'navigate', name: 'Naviguer vers l\'URL', type: 'browser_action', config: { actionType: 'navigate', url: '{url}' } },
      { id: 'execute_actions', name: 'Exécuter les actions', type: 'browser_action', config: { actionType: 'dynamic' } },
      { id: 'extract', name: 'Extraire les données', type: 'browser_action', config: { actionType: 'extract' } },
    ],
    riskLevel: 'medium',
    requiredScopes: [],
    estimatedTimeMs: 30000,
  },
  {
    name: 'Scraping LinkedIn (recherche profils)',
    description: 'Rechercher des profils LinkedIn par mots-clés et extraire les informations publiques',
    provider: 'linkedin',
    operation: 'linkedin.search_profiles',
    category: 'hr',
    actionType: 'browser_automation',
    inputSchema: {
      type: 'object',
      properties: {
        keywords: { type: 'string', description: 'Mots-clés de recherche' },
        location: { type: 'string' },
        maxResults: { type: 'number', default: 10 },
      },
      required: ['keywords'],
    },
    steps: [
      { id: 'navigate', name: 'Aller à la recherche', type: 'browser_action', config: { actionType: 'navigate', url: 'https://www.linkedin.com/search/results/people/?keywords={keywords}' } },
      { id: 'wait', name: 'Attendre les résultats', type: 'browser_action', config: { actionType: 'wait', value: '3000' } },
      { id: 'extract', name: 'Extraire les profils', type: 'browser_action', config: { actionType: 'extract', selector: '.entity-result' } },
      { id: 'screenshot', name: 'Capturer les résultats', type: 'browser_action', config: { actionType: 'screenshot' } },
    ],
    riskLevel: 'medium',
    requiredScopes: ['r_liteprofile'],
    estimatedTimeMs: 20000,
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
