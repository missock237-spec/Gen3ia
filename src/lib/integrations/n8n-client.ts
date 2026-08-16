// ============================================================
// n8n Client — Integration automatique des connecteurs
// via l'API n8n pour connecter les comptes utilisateurs
// ============================================================
// Ce système permet aux utilisateurs de Genova de connecter
// leurs comptes (Gmail, Slack, Notion, Google Drive, etc.)
// via OAuth. n8n sert de moteur d'automatisation avec
// ses 400+ connecteurs natifs.
// ============================================================

import { db } from '@/lib/db';

// ============================================================
// Types
// ============================================================

export interface N8nConfig {
  baseUrl: string;
  apiKey: string;
}

export interface N8nCredentialType {
  id: string;
  name: string;
  displayName: string;
  properties: N8nCredentialProperty[];
}

export interface N8nCredentialProperty {
  name: string;
  displayName: string;
  type: string;
  required: boolean;
  default?: unknown;
}

export interface N8nCredential {
  id: string;
  name: string;
  type: string;
  createdAt: string;
  updatedAt: string;
}

export interface N8nWorkflow {
  id: string;
  name: string;
  active: boolean;
  nodes: unknown[];
  connections: unknown;
  createdAt: string;
  updatedAt: string;
}

export interface N8nExecution {
  id: string;
  workflowId: string;
  status: 'success' | 'error' | 'waiting';
  startedAt: string;
  finishedAt: string | null;
  data: unknown;
}

export interface ConnectedIntegration {
  id: string;
  userId: string;
  service: string;
  credentialId: string;
  credentialName: string;
  status: 'connected' | 'disconnected' | 'error';
  lastTestedAt: Date | null;
  lastTestResult: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

export interface IntegrationTemplate {
  id: string;
  service: string;
  workflowName: string;
  workflowTemplate: string;
  description: string;
  triggers: string[];
  actions: string[];
  category: string;
}

// ============================================================
// Connecteurs disponibles via n8n
// ============================================================

const N8N_INTEGRATIONS = [
  { service: 'gmail', displayName: 'Gmail', category: 'communication', icon: 'mail', authType: 'oauth2' },
  { service: 'google-calendar', displayName: 'Google Calendar', category: 'productivity', icon: 'calendar', authType: 'oauth2' },
  { service: 'google-drive', displayName: 'Google Drive', category: 'storage', icon: 'cloud', authType: 'oauth2' },
  { service: 'google-sheets', displayName: 'Google Sheets', category: 'productivity', icon: 'grid', authType: 'oauth2' },
  { service: 'slack', displayName: 'Slack', category: 'communication', icon: 'message-square', authType: 'oauth2' },
  { service: 'notion', displayName: 'Notion', category: 'productivity', icon: 'file-text', authType: 'oauth2' },
  { service: 'github', displayName: 'GitHub', category: 'development', icon: 'github', authType: 'oauth2' },
  { service: 'gitlab', displayName: 'GitLab', category: 'development', icon: 'gitlab', authType: 'oauth2' },
  { service: 'jira', displayName: 'Jira', category: 'project-management', icon: 'trello', authType: 'oauth2' },
  { service: 'linear', displayName: 'Linear', category: 'project-management', icon: 'trello', authType: 'oauth2' },
  { service: 'asana', displayName: 'Asana', category: 'project-management', icon: 'trello', authType: 'oauth2' },
  { service: 'trello', displayName: 'Trello', category: 'project-management', icon: 'trello', authType: 'oauth2' },
  { service: 'discord', displayName: 'Discord', category: 'communication', icon: 'message-circle', authType: 'webhook' },
  { service: 'telegram', displayName: 'Telegram', category: 'communication', icon: 'send', authType: 'webhook' },
  { service: 'twitter', displayName: 'X / Twitter', category: 'social', icon: 'twitter', authType: 'oauth2' },
  { service: 'linkedin', displayName: 'LinkedIn', category: 'social', icon: 'linkedin', authType: 'oauth2' },
  { service: 'dropbox', displayName: 'Dropbox', category: 'storage', icon: 'cloud', authType: 'oauth2' },
  { service: 'onedrive', displayName: 'OneDrive', category: 'storage', icon: 'cloud', authType: 'oauth2' },
  { service: 'stripe', displayName: 'Stripe', category: 'finance', icon: 'credit-card', authType: 'oauth2' },
  { service: 'hubspot', displayName: 'HubSpot', category: 'crm', icon: 'users', authType: 'oauth2' },
  { service: 'salesforce', displayName: 'Salesforce', category: 'crm', icon: 'users', authType: 'oauth2' },
  { service: 'shopify', displayName: 'Shopify', category: 'ecommerce', icon: 'shopping-cart', authType: 'oauth2' },
  { service: 'woocommerce', displayName: 'WooCommerce', category: 'ecommerce', icon: 'shopping-cart', authType: 'oauth2' },
  { service: 'openai', displayName: 'OpenAI', category: 'ai', icon: 'brain', authType: 'apiKey' },
  { service: 'anthropic', displayName: 'Anthropic Claude', category: 'ai', icon: 'brain', authType: 'apiKey' },
  { service: 'huggingface', displayName: 'Hugging Face', category: 'ai', icon: 'brain', authType: 'apiKey' },
  { service: 'supabase', displayName: 'Supabase', category: 'database', icon: 'database', authType: 'apiKey' },
  { service: 'postgres', displayName: 'PostgreSQL', category: 'database', icon: 'database', authType: 'connectionString' },
  { service: 'redis', displayName: 'Redis', category: 'database', icon: 'database', authType: 'connectionString' },
  { service: 'aws-s3', displayName: 'AWS S3', category: 'storage', icon: 'cloud', authType: 'accessKey' },
  { service: 'digital-ocean', displayName: 'DigitalOcean', category: 'cloud', icon: 'cloud', authType: 'apiKey' },
  { service: 'sentry', displayName: 'Sentry', category: 'monitoring', icon: 'activity', authType: 'apiKey' },
  { service: 'datadog', displayName: 'Datadog', category: 'monitoring', icon: 'activity', authType: 'apiKey' },
  { service: 'pipedrive', displayName: 'Pipedrive', category: 'crm', icon: 'users', authType: 'oauth2' },
  { service: 'calendly', displayName: 'Calendly', category: 'productivity', icon: 'calendar', authType: 'oauth2' },
  { service: 'zoom', displayName: 'Zoom', category: 'communication', icon: 'video', authType: 'oauth2' },
  { service: 'microsoft-teams', displayName: 'Microsoft Teams', category: 'communication', icon: 'message-square', authType: 'oauth2' },
  { service: 'figma', displayName: 'Figma', category: 'design', icon: 'figma', authType: 'oauth2' },
  { service: 'vercel', displayName: 'Vercel', category: 'development', icon: 'triangle', authType: 'apiKey' },
];

// ============================================================
// N8nClient — Wrapper autour de l'API REST n8n
// ============================================================

export class N8nClient {
  private baseUrl: string;
  private apiKey: string;

  constructor(config?: Partial<N8nConfig>) {
    this.baseUrl = config?.baseUrl || process.env.N8N_BASE_URL || 'http://localhost:5678';
    this.apiKey = config?.apiKey || process.env.N8N_API_KEY || '';
  }

  private get headers(): Record<string, string> {
    const h: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.apiKey) {
      h['X-N8N-API-KEY'] = this.apiKey;
    }
    return h;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const url = `${this.baseUrl}/api/v1${path}`;
    const response = await fetch(url, {
      method,
      headers: this.headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`n8n API error (${response.status}): ${errorText}`);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return response.json() as Promise<T>;
  }

  // ---- Credentials ----

  async getCredentialTypes(): Promise<N8nCredentialType[]> {
    return this.request<N8nCredentialType[]>('GET', '/credentials/types');
  }

  async getCredentials(): Promise<N8nCredential[]> {
    return this.request<N8nCredential[]>('GET', '/credentials');
  }

  async createCredential(
    name: string,
    type: string,
    data: Record<string, unknown>
  ): Promise<N8nCredential> {
    return this.request<N8nCredential>('POST', '/credentials', {
      name,
      type,
      data,
    });
  }

  async deleteCredential(credentialId: string): Promise<void> {
    return this.request<void>('DELETE', `/credentials/${credentialId}`);
  }

  async testCredential(credentialId: string): Promise<{ status: string; message?: string }> {
    return this.request('POST', `/credentials/${credentialId}/test`);
  }

  // ---- Workflows ----

  async getWorkflows(): Promise<N8nWorkflow[]> {
    return this.request<N8nWorkflow[]>('GET', '/workflows');
  }

  async getWorkflow(workflowId: string): Promise<N8nWorkflow> {
    return this.request<N8nWorkflow>('GET', `/workflows/${workflowId}`);
  }

  async createWorkflow(
    name: string,
    nodes: unknown[],
    connections: unknown,
    active: boolean = false
  ): Promise<N8nWorkflow> {
    return this.request<N8nWorkflow>('POST', '/workflows', {
      name,
      nodes,
      connections,
      active,
      settings: {
        timezone: 'Africa/Douala',
        saveManualExecutions: true,
        callerPolicy: 'workflowsFromSameOwner',
      },
    });
  }

  async updateWorkflow(
    workflowId: string,
    data: Partial<{
      name: string;
      nodes: unknown[];
      connections: unknown;
      active: boolean;
    }>
  ): Promise<N8nWorkflow> {
    return this.request<N8nWorkflow>('PUT', `/workflows/${workflowId}`, data);
  }

  async activateWorkflow(workflowId: string): Promise<N8nWorkflow> {
    return this.updateWorkflow(workflowId, { active: true });
  }

  async deactivateWorkflow(workflowId: string): Promise<N8nWorkflow> {
    return this.updateWorkflow(workflowId, { active: false });
  }

  async deleteWorkflow(workflowId: string): Promise<void> {
    return this.request<void>('DELETE', `/workflows/${workflowId}`);
  }

  // ---- Executions ----

  async getExecutions(workflowId?: string, limit: number = 20): Promise<N8nExecution[]> {
    let path = `/executions?limit=${limit}`;
    if (workflowId) path += `&workflowId=${workflowId}`;
    return this.request<N8nExecution[]>('GET', path);
  }

  async executeWorkflow(workflowId: string, data?: unknown): Promise<N8nExecution> {
    return this.request<N8nExecution>('POST', `/workflows/${workflowId}/execute`, data);
  }

  // ---- Webhooks ----

  async getWebhookUrl(workflowId: string, webhookName: string): Promise<string> {
    const workflow = await this.getWorkflow(workflowId);
    const webhookNode = (workflow.nodes as Array<{ type: string; parameters?: { path?: string; httpMethod?: string } }>)
      .find(n => n.type === 'n8n-nodes-base.webhook' && n.parameters?.path === webhookName);
    if (webhookNode?.parameters) {
      return `${this.baseUrl}/webhook/${webhookNode.parameters.path || webhookName}`;
    }
    return `${this.baseUrl}/webhook/${webhookName}`;
  }

  // ---- Health ----

  async healthCheck(): Promise<{ status: string; version?: string }> {
    try {
      const res = await fetch(`${this.baseUrl}/healthz`, { method: 'GET' });
      if (res.ok) {
        const text = await res.text();
        return { status: 'ok', version: text };
      }
      return { status: 'error' };
    } catch {
      return { status: 'unreachable' };
    }
  }
}

// ============================================================
// IntegrationManager — Gère les connexions utilisateur
// ============================================================

export class IntegrationManager {
  private n8n: N8nClient;

  constructor(n8nClient?: N8nClient) {
    this.n8n = n8nClient || new N8nClient();
  }

  /**
   * Liste tous les connecteurs disponibles
   */
  getAvailableIntegrations() {
    return N8N_INTEGRATIONS;
  }

  /**
   * Connecte un service via n8n (OAuth ou API Key)
   */
  async connectService(
    userId: string,
    service: string,
    credentials: Record<string, unknown>,
    credentialName?: string
  ): Promise<ConnectedIntegration> {
    const integration = N8N_INTEGRATIONS.find(i => i.service === service);
    if (!integration) {
      throw new Error(`Service '${service}' non supporté`);
    }

    const name = credentialName || `${integration.displayName} - ${userId.slice(0, 8)}`;
    const credentialType = this.mapServiceToCredentialType(service);

    // Créer le credential dans n8n
    const n8nCredential = await this.n8n.createCredential(name, credentialType, credentials);

    // Tester la connexion
    let status: ConnectedIntegration['status'] = 'connected';
    let lastTestResult: string | null = null;

    try {
      const testResult = await this.n8n.testCredential(n8nCredential.id);
      if (testResult.status !== 'ok') {
        status = 'error';
        lastTestResult = testResult.message || 'Échec du test de connexion';
      }
    } catch (error) {
      status = 'error';
      lastTestResult = error instanceof Error ? error.message : 'Erreur inconnue';
    }

    // Sauvegarder dans la base de données Genova
    const connected = await db.connectedIntegration.upsert({
      where: {
        userId_service: {
          userId,
          service,
        },
      },
      create: {
        userId,
        service,
        credentialId: n8nCredential.id,
        credentialName: name,
        status,
        lastTestResult,
        metadata: {},
      },
      update: {
        credentialId: n8nCredential.id,
        credentialName: name,
        status,
        lastTestedAt: new Date(),
        lastTestResult,
        updatedAt: new Date(),
      },
    });

    return connected;
  }

  /**
   * Déconnecte un service
   */
  async disconnectService(userId: string, service: string): Promise<void> {
    const connected = await db.connectedIntegration.findUnique({
      where: { userId_service: { userId, service } },
    });

    if (connected?.credentialId) {
      try {
        await this.n8n.deleteCredential(connected.credentialId);
      } catch {
        // Ignorer les erreurs de suppression
      }
    }

    await db.connectedIntegration.update({
      where: { userId_service: { userId, service } },
      data: {
        status: 'disconnected',
        credentialId: '',
        updatedAt: new Date(),
      },
    });
  }

  /**
   * Récupère les intégrations connectées d'un utilisateur
   */
  async getUserIntegrations(userId: string): Promise<ConnectedIntegration[]> {
    return db.connectedIntegration.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Teste une connexion existante
   */
  async testConnection(userId: string, service: string): Promise<{ status: string; message?: string }> {
    const connected = await db.connectedIntegration.findUnique({
      where: { userId_service: { userId, service } },
    });

    if (!connected || !connected.credentialId) {
      throw new Error(`Aucune connexion trouvée pour ${service}`);
    }

    const result = await this.n8n.testCredential(connected.credentialId);

    await db.connectedIntegration.update({
      where: { userId_service: { userId, service } },
      data: {
        lastTestedAt: new Date(),
        lastTestResult: result.message || null,
        status: result.status === 'ok' ? 'connected' : 'error',
        updatedAt: new Date(),
      },
    });

    return result;
  }

  /**
   * Crée un workflow n8n pour un utilisateur
   */
  async createUserWorkflow(
    userId: string,
    name: string,
    template: {
      nodes: unknown[];
      connections: unknown;
    },
    activate: boolean = false
  ): Promise<N8nWorkflow> {
    const workflowName = `[Genova] ${name} - ${userId.slice(0, 8)}`;
    return this.n8n.createWorkflow(workflowName, template.nodes, template.connections, activate);
  }

  /**
   * Récupère les logs d'exécution pour une intégration
   */
  async getExecutionLogs(
    userId: string,
    service: string,
    limit: number = 50
  ): Promise<unknown[]> {
    const connected = await db.connectedIntegration.findUnique({
      where: { userId_service: { userId, service } },
    });

    if (!connected) return [];

    return db.connectorExecution.findMany({
      where: {
        userId,
        connectorType: service,
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  /**
   * Vérifie l'état de santé du serveur n8n
   */
  async healthCheck() {
    return this.n8n.healthCheck();
  }

  /**
   * Mappe un service Genova vers le type de credential n8n
   */
  private mapServiceToCredentialType(service: string): string {
    const mapping: Record<string, string> = {
      gmail: 'gmailOAuth2Api',
      'google-calendar': 'googleCalendarOAuth2Api',
      'google-drive': 'googleDriveOAuth2Api',
      'google-sheets': 'googleSheetsOAuth2Api',
      slack: 'slackApi',
      notion: 'notionApi',
      github: 'githubApi',
      gitlab: 'gitlabApi',
      jira: 'jiraSoftwareCloudApi',
      linear: 'linearApi',
      asana: 'asanaApi',
      trello: 'trelloApi',
      discord: 'discordApi',
      telegram: 'telegramApi',
      twitter: 'twitterOAuth2Api',
      linkedin: 'linkedInOAuth2Api',
      dropbox: 'dropboxApi',
      onedrive: 'microsoftOneDriveOAuth2Api',
      stripe: 'stripeApi',
      hubspot: 'hubspotApi',
      salesforce: 'salesforceApi',
      shopify: 'shopifyApi',
      woocommerce: 'wooCommerceApi',
      openai: 'openAiApi',
      anthropic: 'anthropicApi',
      huggingface: 'huggingFaceApi',
      supabase: 'supabaseApi',
      postgres: 'postgres',
      redis: 'redis',
      'aws-s3': 'awsS3Api',
      'digital-ocean': 'digitalOceanApi',
      sentry: 'sentryApi',
      datadog: 'datadogApi',
      pipedrive: 'pipedriveApi',
      calendly: 'calendlyApi',
      zoom: 'zoomApi',
      'microsoft-teams': 'microsoftTeamsApi',
      figma: 'figmaApi',
      vercel: 'vercelApi',
    };

    const type = mapping[service];
    if (!type) {
      throw new Error(`Aucun type de credential n8n pour le service: ${service}`);
    }
    return type;
  }
}

// ============================================================
// Factory & Singleton
// ============================================================

let defaultN8nClient: N8nClient | null = null;
let defaultIntegrationManager: IntegrationManager | null = null;

export function getN8nClient(): N8nClient {
  if (!defaultN8nClient) {
    defaultN8nClient = new N8nClient();
  }
  return defaultN8nClient;
}

export function getIntegrationManager(): IntegrationManager {
  if (!defaultIntegrationManager) {
    defaultIntegrationManager = new IntegrationManager(getN8nClient());
  }
  return defaultIntegrationManager;
}
