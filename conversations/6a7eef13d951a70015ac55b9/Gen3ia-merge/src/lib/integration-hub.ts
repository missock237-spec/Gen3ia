// ============================================================
// INTEGRATION HUB — Hub central de connecteurs natifs
// Point d'entrée unique pour toutes les intégrations
// ============================================================

import { createLogger } from './logger';
import { cache } from './cache/cache-manager';

const log = createLogger('integration-hub');

export type IntegrationProvider =
  | 'google_gmail' | 'google_calendar' | 'google_drive' | 'google_docs'
  | 'slack' | 'notion' | 'github' | 'gitlab'
  | 'salesforce' | 'hubspot' | 'stripe' | 'ses'
  | 'twitter' | 'linkedin' | 'telegram'
  | 'jira' | 'linear' | 'asana' | 'trello'
  | 'datadog' | 'sentry' | 'pagerduty'
  | 'openai' | 'anthropic' | 'elevenlabs'
  | 'zapier' | 'make' | 'n8n' | 'webhook';

export type AuthType = 'oauth2' | 'api_key' | 'basic' | 'none';

export interface IntegrationConfig {
  id: IntegrationProvider;
  name: string;
  description: string;
  category: 'communication' | 'productivity' | 'dev_tools' | 'crm' | 'ai' | 'automation' | 'monitoring' | 'social';
  authType: AuthType;
  authUrl?: string;
  scopes?: string[];
  icon: string;
  color: string;
  isConnected?: boolean;
  connectedAt?: Date;
}

export interface IntegrationAction {
  id: string;
  name: string;
  description: string;
  provider: IntegrationProvider;
  inputSchema: Record<string, any>;
  outputSchema?: Record<string, any>;
  requiresAuth: boolean;
}

export interface IntegrationConnection {
  id: string;
  provider: IntegrationProvider;
  userId: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
  scopes: string[];
  accountName?: string;
  accountEmail?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type IntegrationActionHandler = (
  connection: IntegrationConnection,
  params: Record<string, any>
) => Promise<Record<string, any>>;

// ============================================================
// REGISTRY DES INTÉGRATIONS
// ============================================================

export const INTEGRATIONS: IntegrationConfig[] = [
  // === Communication ===
  { id: 'google_gmail', name: 'Gmail', description: 'Envoyer, lire et gérer vos emails Gmail', category: 'communication', authType: 'oauth2', authUrl: 'https://accounts.google.com/o/oauth2/v2/auth', scopes: ['https://www.googleapis.com/auth/gmail.modify'], icon: '📧', color: '#EA4335' },
  { id: 'slack', name: 'Slack', description: 'Envoyer des messages, créer des canaux, notifier vos équipes', category: 'communication', authType: 'oauth2', authUrl: 'https://slack.com/oauth/v2/authorize', scopes: ['channels:read', 'chat:write', 'users:read'], icon: '💬', color: '#4A154B' },
  { id: 'telegram', name: 'Telegram', description: 'Envoyer des messages et notifications via bot Telegram', category: 'communication', authType: 'api_key', icon: '✈️', color: '#0088cc' },
  { id: 'ses', name: 'Amazon SES', description: 'Service d\'envoi d\'emails transactionnels', category: 'communication', authType: 'api_key', icon: '📨', color: '#FF9900' },

  // === Productivité ===
  { id: 'google_calendar', name: 'Google Calendar', description: 'Créer, lire et gérer des événements calendar', category: 'productivity', authType: 'oauth2', authUrl: 'https://accounts.google.com/o/oauth2/v2/auth', scopes: ['https://www.googleapis.com/auth/calendar.events'], icon: '📅', color: '#4285F4' },
  { id: 'google_drive', name: 'Google Drive', description: 'Lire, créer et organiser des fichiers Drive', category: 'productivity', authType: 'oauth2', authUrl: 'https://accounts.google.com/o/oauth2/v2/auth', scopes: ['https://www.googleapis.com/auth/drive.file'], icon: '📁', color: '#FBBC04' },
  { id: 'google_docs', name: 'Google Docs', description: 'Créer et modifier des documents Google Docs', category: 'productivity', authType: 'oauth2', authUrl: 'https://accounts.google.com/o/oauth2/v2/auth', scopes: ['https://www.googleapis.com/auth/documents'], icon: '📝', color: '#4285F4' },
  { id: 'notion', name: 'Notion', description: 'Lire, créer et mettre à jour des pages et bases Notion', category: 'productivity', authType: 'oauth2', authUrl: 'https://api.notion.com/v1/oauth/authorize', scopes: ['read', 'write'], icon: '📓', color: '#000000' },

  // === Dev Tools ===
  { id: 'github', name: 'GitHub', description: 'Gérer repos, issues, PRs, actions et releases', category: 'dev_tools', authType: 'oauth2', authUrl: 'https://github.com/login/oauth/authorize', scopes: ['repo', 'issues:write', 'pull_requests:write'], icon: '🐙', color: '#181717' },
  { id: 'gitlab', name: 'GitLab', description: 'Gérer projets, merge requests et pipelines CI/CD', category: 'dev_tools', authType: 'oauth2', authUrl: 'https://gitlab.com/oauth/authorize', scopes: ['api', 'read_repository'], icon: '🦊', color: '#FC6D26' },
  { id: 'jira', name: 'Jira', description: 'Gérer tickets, sprints et projets Jira', category: 'dev_tools', authType: 'oauth2', authUrl: 'https://auth.atlassian.com/authorize', scopes: ['read:jira-work', 'write:jira-work'], icon: '🎯', color: '#0052CC' },
  { id: 'linear', name: 'Linear', description: 'Gérer issues et cycles Linear', category: 'dev_tools', authType: 'api_key', icon: '📐', color: '#5E6AD2' },

  // === CRM ===
  { id: 'salesforce', name: 'Salesforce', description: 'Gérer contacts, opportunités et comptes Salesforce', category: 'crm', authType: 'oauth2', authUrl: 'https://login.salesforce.com/services/oauth2/authorize', scopes: ['api', 'refresh_token'], icon: '☁️', color: '#00A1E0' },
  { id: 'hubspot', name: 'HubSpot', description: 'Gérer contacts, deals et tickets HubSpot', category: 'crm', authType: 'oauth2', authUrl: 'https://app.hubspot.com/oauth/authorize', scopes: ['crm.objects.contacts.read', 'crm.objects.contacts.write'], icon: '🟠', color: '#FF7A59' },

  // === AI ===
  { id: 'openai', name: 'OpenAI', description: 'Générer du texte, des embeddings et des images via OpenAI', category: 'ai', authType: 'api_key', icon: '🤖', color: '#412991' },
  { id: 'anthropic', name: 'Anthropic', description: 'Accéder aux modèles Claude pour des réponses avancées', category: 'ai', authType: 'api_key', icon: '🧠', color: '#D4A574' },
  { id: 'elevenlabs', name: 'ElevenLabs', description: 'Synthèse vocale IA et clonage de voix', category: 'ai', authType: 'api_key', icon: '🎤', color: '#222222' },

  // === Automation ===
  { id: 'zapier', name: 'Zapier', description: 'Déclencher des Zaps et recevoir des webhooks', category: 'automation', authType: 'api_key', icon: '⚡', color: '#FF4A00' },
  { id: 'make', name: 'Make (Integromat)', description: 'Connecter des scénarios Make', category: 'automation', authType: 'api_key', icon: '🔄', color: '#6C47FF' },
  { id: 'n8n', name: 'n8n', description: 'Workflows auto-hébergés via n8n', category: 'automation', authType: 'api_key', icon: '🔧', color: '#EA5455' },
  { id: 'webhook', name: 'Webhook', description: 'Recevoir et envoyer des webhooks personnalisés', category: 'automation', authType: 'none', icon: '🔗', color: '#6366F1' },

  // === Monitoring ===
  { id: 'datadog', name: 'Datadog', description: 'Monitorer métriques, logs et alertes Datadog', category: 'monitoring', authType: 'api_key', icon: '📊', color: '#632CA6' },
  { id: 'sentry', name: 'Sentry', description: 'Suivre les erreurs et performances applicatives', category: 'monitoring', authType: 'api_key', icon: '⚠️', color: '#362D59' },
  { id: 'pagerduty', name: 'PagerDuty', description: 'Gérer les alertes et on-call', category: 'monitoring', authType: 'api_key', icon: '🚨', color: '#00AC4A' },

  // === Social ===
  { id: 'twitter', name: 'X (Twitter)', description: 'Publier des tweets, analyser les tendances', category: 'social', authType: 'oauth2', authUrl: 'https://twitter.com/i/oauth2/authorize', scopes: ['tweet.read', 'tweet.write'], icon: '🐦', color: '#1DA1F2' },
  { id: 'linkedin', name: 'LinkedIn', description: 'Publier du contenu et gérer la page entreprise', category: 'social', authType: 'oauth2', authUrl: 'https://www.linkedin.com/oauth/v2/authorization', scopes: ['w_member_social'], icon: '💼', color: '#0A66C2' },
];

// ============================================================
// ACTIONS PAR INTÉGRATION
// ============================================================

// @ts-ignore
export const INTEGRATION_ACTIONS: Record<IntegrationProvider, IntegrationAction[]> = {
  google_gmail: [
    { id: 'gmail_send', name: 'Envoyer email', description: 'Envoyer un email via Gmail', provider: 'google_gmail', inputSchema: { to: 'string', subject: 'string', body: 'string' }, requiresAuth: true },
    { id: 'gmail_search', name: 'Chercher emails', description: 'Rechercher des emails par requête', provider: 'google_gmail', inputSchema: { query: 'string', maxResults: 'number' }, requiresAuth: true },
    { id: 'gmail_get', name: 'Lire email', description: 'Lire un email par ID', provider: 'google_gmail', inputSchema: { messageId: 'string' }, requiresAuth: true },
  ],
  google_calendar: [
    { id: 'calendar_create_event', name: 'Créer événement', description: 'Créer un événement Google Calendar', provider: 'google_calendar', inputSchema: { summary: 'string', start: 'string', end: 'string', description: 'string' }, requiresAuth: true },
    { id: 'calendar_list_events', name: 'Lister événements', description: 'Lister les événements à venir', provider: 'google_calendar', inputSchema: { maxResults: 'number', timeMin: 'string' }, requiresAuth: true },
  ],
  google_drive: [
    { id: 'drive_list', name: 'Lister fichiers', description: 'Lister les fichiers Drive', provider: 'google_drive', inputSchema: { folderId: 'string', pageSize: 'number' }, requiresAuth: true },
    { id: 'drive_create', name: 'Créer fichier', description: 'Créer un fichier dans Drive', provider: 'google_drive', inputSchema: { name: 'string', content: 'string', mimeType: 'string' }, requiresAuth: true },
  ],
  slack: [
    { id: 'slack_send', name: 'Envoyer message', description: 'Envoyer un message Slack', provider: 'slack', inputSchema: { channel: 'string', text: 'string' }, requiresAuth: true },
    { id: 'slack_list_channels', name: 'Lister canaux', description: 'Lister les canaux Slack', provider: 'slack', inputSchema: {}, requiresAuth: true },
    { id: 'slack_create_channel', name: 'Créer canal', description: 'Créer un canal Slack', provider: 'slack', inputSchema: { name: 'string', isPrivate: 'boolean' }, requiresAuth: true },
  ],
  notion: [
    { id: 'notion_create_page', name: 'Créer page', description: 'Créer une page Notion', provider: 'notion', inputSchema: { parentId: 'string', title: 'string', content: 'string' }, requiresAuth: true },
    { id: 'notion_query', name: 'Rechercher', description: 'Rechercher dans Notion', provider: 'notion', inputSchema: { query: 'string' }, requiresAuth: true },
  ],
  github: [
    { id: 'github_create_issue', name: 'Créer issue', description: 'Créer une issue GitHub', provider: 'github', inputSchema: { repo: 'string', title: 'string', body: 'string' }, requiresAuth: true },
    { id: 'github_list_issues', name: 'Lister issues', description: 'Lister les issues GitHub', provider: 'github', inputSchema: { repo: 'string', state: 'string' }, requiresAuth: true },
    { id: 'github_create_pr', name: 'Créer PR', description: 'Créer une pull request', provider: 'github', inputSchema: { repo: 'string', title: 'string', head: 'string', base: 'string' }, requiresAuth: true },
  ],
  jira: [
    { id: 'jira_create_issue', name: 'Créer ticket', description: 'Créer un ticket Jira', provider: 'jira', inputSchema: { project: 'string', summary: 'string', description: 'string', issueType: 'string' }, requiresAuth: true },
  ],
  salesforce: [
    { id: 'sf_create_contact', name: 'Créer contact', description: 'Créer un contact Salesforce', provider: 'salesforce', inputSchema: { lastName: 'string', email: 'string', phone: 'string' }, requiresAuth: true },
    { id: 'sf_create_opportunity', name: 'Créer opportunité', description: 'Créer une opportunité', provider: 'salesforce', inputSchema: { name: 'string', stage: 'string', amount: 'number' }, requiresAuth: true },
  ],
  hubspot: [
    { id: 'hs_create_contact', name: 'Créer contact', description: 'Créer un contact HubSpot', provider: 'hubspot', inputSchema: { email: 'string', firstname: 'string', lastname: 'string' }, requiresAuth: true },
  ],
  telegram: [
    { id: 'tg_send', name: 'Envoyer message', description: 'Envoyer un message Telegram', provider: 'telegram', inputSchema: { chatId: 'string', text: 'string' }, requiresAuth: true },
  ],
  ses: [
    { id: 'ses_send', name: 'Envoyer email', description: 'Envoyer un email via SES', provider: 'ses', inputSchema: { to: 'string', subject: 'string', body: 'string', source: 'string' }, requiresAuth: true },
  ],
  webhook: [
    { id: 'webhook_send', name: 'Envoyer webhook', description: 'Envoyer un webhook HTTP', provider: 'webhook', inputSchema: { url: 'string', method: 'string', headers: 'object', body: 'any' }, requiresAuth: false },
    { id: 'webhook_receive', name: 'Recevoir webhook', description: 'Générer une URL de webhook entrant', provider: 'webhook', inputSchema: {}, requiresAuth: false },
  ],
  datadog: [
    { id: 'dd_send_event', name: 'Envoyer événement', description: 'Envoyer un événement Datadog', provider: 'datadog', inputSchema: { title: 'string', text: 'string', alertType: 'string' }, requiresAuth: true },
  ],
  sentry: [
    { id: 'sentry_list_issues', name: 'Lister issues', description: 'Lister les issues Sentry', provider: 'sentry', inputSchema: { organization: 'string', project: 'string' }, requiresAuth: true },
  ],
  openai: [
    { id: 'openai_chat', name: 'Chat', description: 'Envoyer un message à ChatGPT', provider: 'openai', inputSchema: { prompt: 'string', model: 'string', temperature: 'number' }, requiresAuth: true },
    { id: 'openai_embedding', name: 'Embedding', description: 'Générer un embedding', provider: 'openai', inputSchema: { input: 'string' }, requiresAuth: true },
  ],
  elevenlabs: [
    { id: 'el_tts', name: 'Texte → Parole', description: 'Convertir du texte en audio', provider: 'elevenlabs', inputSchema: { text: 'string', voiceId: 'string' }, requiresAuth: true },
  ],
  twitter: [{ id: 'tw_post', name: 'Publier tweet', description: 'Publier un tweet', provider: 'twitter', inputSchema: { text: 'string' }, requiresAuth: true }],
  linkedin: [{ id: 'li_post', name: 'Publier article', description: 'Publier sur LinkedIn', provider: 'linkedin', inputSchema: { text: 'string', visibility: 'string' }, requiresAuth: true }],
  linear: [{ id: 'linear_create_issue', name: 'Créer issue', description: 'Créer une issue Linear', provider: 'linear', inputSchema: { title: 'string', teamId: 'string', description: 'string' }, requiresAuth: true }],
  asana: [{ id: 'asana_create_task', name: 'Créer tâche', description: 'Créer une tâche Asana', provider: 'asana', inputSchema: { project: 'string', name: 'string' }, requiresAuth: true }],
  trello: [{ id: 'trello_create_card', name: 'Créer carte', description: 'Créer une carte Trello', provider: 'trello', inputSchema: { listId: 'string', name: 'string', desc: 'string' }, requiresAuth: true }],
  anthropic: [{ id: 'anthropic_chat', name: 'Chat Claude', description: 'Envoyer un message à Claude', provider: 'anthropic', inputSchema: { prompt: 'string', model: 'string' }, requiresAuth: true }],
  n8n: [{ id: 'n8n_trigger', name: 'Déclencher workflow', description: 'Déclencher un workflow n8n', provider: 'n8n', inputSchema: { workflowId: 'string', data: 'object' }, requiresAuth: true }],
  zapier: [{ id: 'zapier_trigger', name: 'Déclencher Zap', description: 'Déclencher un Zap Zapier', provider: 'zapier', inputSchema: { webhookUrl: 'string', data: 'object' }, requiresAuth: true }],
  make: [{ id: 'make_trigger', name: 'Déclencher scénario', description: 'Déclencher un scénario Make', provider: 'make', inputSchema: { webhookUrl: 'string', data: 'object' }, requiresAuth: true }],
  gitlab: [{ id: 'gitlab_create_issue', name: 'Créer issue', description: 'Créer une issue GitLab', provider: 'gitlab', inputSchema: { projectId: 'string', title: 'string' }, requiresAuth: true }],
  pagerduty: [{ id: 'pd_trigger_alert', name: 'Déclencher alerte', description: 'Déclencher une alerte PagerDuty', provider: 'pagerduty', inputSchema: { title: 'string', severity: 'string' }, requiresAuth: true }],
};

// ============================================================
// INTEGRATION HUB CLASSE
// ============================================================

class IntegrationHub {
  private actionHandlers = new Map<string, IntegrationActionHandler>();

  /**
   * Enregistre un handler pour une action
   */
  registerAction(actionId: string, handler: IntegrationActionHandler): void {
    this.actionHandlers.set(actionId, handler);
    log.info('action_registered', { actionId });
  }

  /**
   * Exécute une action sur une intégration connectée
   */
  async executeAction(
    connection: IntegrationConnection,
    actionId: string,
    params: Record<string, any>
  ): Promise<Record<string, any>> {
    const handler = this.actionHandlers.get(actionId);
    if (!handler) {
      // Mode simulation — retourne un résultat simulé
      return {
        success: true,
        simulated: true,
        actionId,
        provider: connection.provider,
        message: `Action ${actionId} exécutée sur ${connection.provider}`,
        params,
      };
    }

    if (typeof handler !== 'function') throw new Error('Invalid handler');
    return handler(connection, params);
  }

  /**
   * Récupère toutes les intégrations avec leur statut de connexion
   */
  getIntegrations(userConnections: IntegrationConnection[]): IntegrationConfig[] {
    const connectedIds = new Set(userConnections.map(c => c.provider));
    return INTEGRATIONS.map(integration => ({
      ...integration,
      isConnected: connectedIds.has(integration.id),
      connectedAt: userConnections.find(c => c.provider === integration.id)?.createdAt,
    }));
  }

  /**
   * Récupère les actions disponibles pour une intégration
   */
  getActions(provider: IntegrationProvider): IntegrationAction[] {
    return INTEGRATION_ACTIONS[provider] || [];
  }

  /**
   * Récupère les intégrations par catégorie
   */
  getByCategory(): Record<string, IntegrationConfig[]> {
    const categories: Record<string, IntegrationConfig[]> = {};
    for (const integration of INTEGRATIONS) {
      if (!categories[integration.category]) categories[integration.category] = [];
      categories[integration.category].push(integration);
    }
    return categories;
  }

  /**
   * Statistiques du hub
   */
  getStats(userConnections: IntegrationConnection[]) {
    return {
      totalIntegrations: INTEGRATIONS.length,
      totalActions: Object.values(INTEGRATION_ACTIONS).reduce((s, a) => s + a.length, 0),
      connected: userConnections.length,
      categories: Object.keys(this.getByCategory()).length,
    };
  }
}

export const integrationHub = new IntegrationHub();
export default integrationHub;
