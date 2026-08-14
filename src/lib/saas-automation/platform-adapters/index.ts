// ============================================================
// PLATFORM ADAPTER — Interface commune pour les adaptations par plateforme
//
// Chaque provider SaaS peut avoir un adapter qui gère:
// - La traduction des opérations génériques en appels spécifiques
// - Le formatage des requêtes/réponses
// - La gestion des particularités de l'API
// - Les rate limits spécifiques
// ============================================================

import { createLogger } from '@/lib/logger';

const log = createLogger('platform-adapter');

// ============================================================
// Types
// ============================================================

export interface PlatformAdapter {
  provider: string;
  name: string;
  baseUrl: string;
  apiVersion?: string;
  rateLimits: {
    requestsPerMinute: number;
    requestsPerDay: number;
  };
  authHeaders: (token: string) => Record<string, string>;
  transformRequest: (operation: string, params: Record<string, unknown>) => {
    method: string;
    path: string;
    body?: unknown;
    query?: Record<string, string>;
  };
  transformResponse: (operation: string, response: unknown) => Record<string, unknown>;
  handleError: (error: { status: number; body: unknown }) => {
    retryable: boolean;
    message: string;
  };
}

// ============================================================
// ADAPTER REGISTRY
// ============================================================

const ADAPTERS: Record<string, PlatformAdapter> = {
  // === Gmail ===
  google_gmail: {
    provider: 'google_gmail',
    name: 'Gmail',
    baseUrl: 'https://gmail.googleapis.com',
    apiVersion: 'v1',
    rateLimits: { requestsPerMinute: 200, requestsPerDay: 1000000 },
    authHeaders: (token) => ({ Authorization: `Bearer ${token}` }),
// @ts-ignore
    transformRequest: (operation, params) => {
      switch (operation) {
        case 'gmail.send_email':
          return { method: 'POST', path: '/gmail/v1/users/me/messages/send', body: { raw: Buffer.from(`To: ${params.to}\nSubject: ${params.subject}\nContent-Type: text/html; charset=utf-8\n\n${params.body}`).toString('base64url') } };
        case 'gmail.list_emails':
          return { method: 'GET', path: '/gmail/v1/users/me/messages', query: { q: params.query as string, maxResults: String(params.maxResults || 20) } };
        case 'gmail.read_email':
          return { method: 'GET', path: `/gmail/v1/users/me/messages/${params.messageId}`, query: { format: (params.format as string) || 'full' } };
        default:
          return { method: 'GET', path: '/gmail/v1/users/me/profile' };
      }
    },
    transformResponse: (operation, response) => response as Record<string, unknown>,
    handleError: (error) => ({
      retryable: error.status === 429 || error.status >= 500,
      message: error.status === 429 ? 'Rate limit Gmail atteint' : `Erreur Gmail: ${error.status}`,
    }),
  },

  // === Slack ===
  slack: {
    provider: 'slack',
    name: 'Slack',
    baseUrl: 'https://slack.com/api',
    rateLimits: { requestsPerMinute: 60, requestsPerDay: 100000 },
    authHeaders: (token) => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }),
    transformRequest: (operation, params) => {
      switch (operation) {
        case 'slack.post_message':
          return { method: 'POST', path: '/chat.postMessage', body: { channel: params.channel, text: params.text, blocks: params.blocks, thread_ts: params.threadTs } };
        case 'slack.list_channels':
          return { method: 'GET', path: '/conversations.list', query: { types: (params.types as string) || 'public_channel,private_channel' } };
        default:
          return { method: 'GET', path: '/auth.test' };
      }
    },
    transformResponse: (operation, response) => {
      const data = response as Record<string, unknown>;
      if (!data.ok) throw new Error(`Slack error: ${data.error}`);
      return data;
    },
    handleError: (error) => ({
      retryable: error.status === 429,
      message: error.status === 429 ? 'Rate limit Slack atteint — réessayez plus tard' : `Erreur Slack: ${error.status}`,
    }),
  },

  // === Notion ===
  notion: {
    provider: 'notion',
    name: 'Notion',
    baseUrl: 'https://api.notion.com',
    apiVersion: 'v1',
    rateLimits: { requestsPerMinute: 3, requestsPerDay: 10000 },
    authHeaders: (token) => ({
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Notion-Version': '2022-06-28',
    }),
    transformRequest: (operation, params) => {
      switch (operation) {
        case 'notion.create_page':
          return { method: 'POST', path: '/v1/pages', body: { parent: params.parent, properties: params.properties, children: params.children } };
        case 'notion.search':
          return { method: 'POST', path: '/v1/search', body: { query: params.query, filter: params.filter, sort: params.sort, start_cursor: params.startCursor, page_size: params.pageSize || 10 } };
        case 'notion.update_page':
          return { method: 'PATCH', path: `/v1/pages/${params.pageId}`, body: { properties: params.properties, archived: params.archived } };
        default:
          return { method: 'GET', path: '/v1/users/me' };
      }
    },
    transformResponse: (operation, response) => response as Record<string, unknown>,
    handleError: (error) => ({
      retryable: error.status === 429 || error.status >= 500,
      message: error.status === 429 ? 'Rate limit Notion atteint (3 req/min)' : `Erreur Notion: ${error.status}`,
    }),
  },

  // === GitHub ===
  github: {
    provider: 'github',
    name: 'GitHub',
    baseUrl: 'https://api.github.com',
    rateLimits: { requestsPerMinute: 60, requestsPerDay: 5000 },
    authHeaders: (token) => ({
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'Gen3ia-Agent',
    }),
    transformRequest: (operation, params) => {
      switch (operation) {
        case 'github.create_issue':
          return { method: 'POST', path: `/repos/${params.owner}/${params.repo}/issues`, body: { title: params.title, body: params.body, labels: params.labels, assignees: params.assignees } };
        case 'github.list_prs':
          return { method: 'GET', path: `/repos/${params.owner}/${params.repo}/pulls`, query: { state: (params.state as string) || 'open', per_page: String(params.per_page || 30) } };
        default:
          return { method: 'GET', path: '/user' };
      }
    },
    transformResponse: (operation, response) => response as Record<string, unknown>,
    handleError: (error) => ({
      retryable: error.status === 429 || error.status >= 500,
      message: error.status === 429 ? 'Rate limit GitHub atteint' : `Erreur GitHub: ${error.status}`,
    }),
  },

  // === Google Calendar ===
  google_calendar: {
    provider: 'google_calendar',
    name: 'Google Calendar',
    baseUrl: 'https://www.googleapis.com',
    apiVersion: 'v3',
    rateLimits: { requestsPerMinute: 200, requestsPerDay: 1000000 },
    authHeaders: (token) => ({ Authorization: `Bearer ${token}` }),
    transformRequest: (operation, params) => {
      switch (operation) {
        case 'calendar.create_event':
          return { method: 'POST', path: '/calendar/v3/calendars/primary/events', body: { summary: params.summary, start: params.start, end: params.end, description: params.description, attendees: params.attendees, location: params.location } };
        case 'calendar.list_events':
          return { method: 'GET', path: '/calendar/v3/calendars/primary/events', query: { timeMin: params.timeMin as string, timeMax: params.timeMax as string, maxResults: String(params.maxResults || 10), singleEvents: String(params.singleEvents ?? true) } };
        default:
          return { method: 'GET', path: '/calendar/v3/calendars/primary' };
      }
    },
    transformResponse: (operation, response) => response as Record<string, unknown>,
    handleError: (error) => ({
      retryable: error.status === 429 || error.status >= 500,
      message: error.status === 429 ? 'Rate limit Google Calendar atteint' : `Erreur Calendar: ${error.status}`,
    }),
  },

  // === HubSpot ===
  hubspot: {
    provider: 'hubspot',
    name: 'HubSpot',
    baseUrl: 'https://api.hubapi.com',
    rateLimits: { requestsPerMinute: 100, requestsPerDay: 250000 },
    authHeaders: (token) => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }),
    transformRequest: (operation, params) => {
      switch (operation) {
        case 'hubspot.create_contact':
          return { method: 'POST', path: '/crm/v3/objects/contacts', body: { properties: params } };
        default:
          return { method: 'GET', path: '/crm/v3/objects/contacts' };
      }
    },
    transformResponse: (operation, response) => response as Record<string, unknown>,
    handleError: (error) => ({
      retryable: error.status === 429 || error.status >= 500,
      message: error.status === 429 ? 'Rate limit HubSpot atteint' : `Erreur HubSpot: ${error.status}`,
    }),
  },

  // === Salesforce ===
  salesforce: {
    provider: 'salesforce',
    name: 'Salesforce',
    baseUrl: 'https://login.salesforce.com',
    rateLimits: { requestsPerMinute: 100, requestsPerDay: 1000000 },
    authHeaders: (token) => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }),
    transformRequest: (operation, params) => {
      switch (operation) {
        case 'salesforce.create_contact':
          return { method: 'POST', path: '/services/data/v58.0/sobjects/Contact', body: params };
        default:
          return { method: 'GET', path: '/services/data/v58.0/sobjects' };
      }
    },
    transformResponse: (operation, response) => response as Record<string, unknown>,
    handleError: (error) => ({
      retryable: error.status === 429 || error.status >= 500,
      message: error.status === 429 ? 'Rate limit Salesforce atteint' : `Erreur Salesforce: ${error.status}`,
    }),
  },

  // === Google Drive ===
  google_drive: {
    provider: 'google_drive',
    name: 'Google Drive',
    baseUrl: 'https://www.googleapis.com',
    apiVersion: 'v3',
    rateLimits: { requestsPerMinute: 200, requestsPerDay: 1000000 },
    authHeaders: (token) => ({ Authorization: `Bearer ${token}` }),
    transformRequest: (operation, params) => {
      switch (operation) {
        case 'drive.list_files':
          return { method: 'GET', path: '/drive/v3/files', query: { q: params.q as string, pageSize: String(params.pageSize || 20), orderBy: (params.orderBy as string) || 'modifiedByMeTime desc' } };
        default:
          return { method: 'GET', path: '/drive/v3/about' };
      }
    },
    transformResponse: (operation, response) => response as Record<string, unknown>,
    handleError: (error) => ({
      retryable: error.status === 429 || error.status >= 500,
      message: error.status === 429 ? 'Rate limit Drive atteint' : `Erreur Drive: ${error.status}`,
    }),
  },

  // === Jira ===
  jira: {
    provider: 'jira',
    name: 'Jira',
    baseUrl: 'https://yourdomain.atlassian.net',
    rateLimits: { requestsPerMinute: 60, requestsPerDay: 10000 },
    authHeaders: (token) => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }),
    transformRequest: (operation, params) => {
      switch (operation) {
        case 'jira.create_issue':
          return { method: 'POST', path: '/rest/api/3/issue', body: { fields: { project: { key: params.projectKey }, summary: params.summary, description: params.description, issuetype: { name: params.issuetype || 'Task' } } } };
        default:
          return { method: 'GET', path: '/rest/api/3/myself' };
      }
    },
    transformResponse: (operation, response) => response as Record<string, unknown>,
    handleError: (error) => ({
      retryable: error.status === 429 || error.status >= 500,
      message: error.status === 429 ? 'Rate limit Jira atteint' : `Erreur Jira: ${error.status}`,
    }),
  },
};

// ============================================================
// ADAPTER MANAGER
// ============================================================

export function getPlatformAdapter(provider: string): PlatformAdapter | undefined {
  return ADAPTERS[provider];
}

export function getAllAdapters(): Record<string, PlatformAdapter> {
  return { ...ADAPTERS };
}

export function getSupportedProviders(): string[] {
  return Object.keys(ADAPTERS);
}

export function registerAdapter(adapter: PlatformAdapter): void {
  ADAPTERS[adapter.provider] = adapter;
  log.info('Platform adapter registered', { provider: adapter.provider });
}
