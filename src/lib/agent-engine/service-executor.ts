import { prisma } from '@/lib/prisma';
import { decryptField } from '@/lib/security/token-encryption';
import { detectAnomalies, recordFailure, recordSuccess } from '@/lib/security/anomaly-detector';

interface ServiceAction { service: string; action: string; params: Record<string, unknown>; userId: string; agentId?: string; }
interface ServiceActionResult { success: boolean; data?: unknown; error?: string; statusCode?: number; }

const SERVICE_APIS: Record<string, { baseUrl: string; actions: Record<string, { method: string; path: string; auth: 'header' | 'query' }> }> = {
  github: { baseUrl: 'https://api.github.com', actions: {
    list_repos: { method: 'GET', path: '/user/repos', auth: 'header' },
    create_issue: { method: 'POST', path: '/repos/{owner}/{repo}/issues', auth: 'header' },
    list_issues: { method: 'GET', path: '/repos/{owner}/{repo}/issues', auth: 'header' },
    create_pr: { method: 'POST', path: '/repos/{owner}/{repo}/pulls', auth: 'header' },
    get_repo: { method: 'GET', path: '/repos/{owner}/{repo}', auth: 'header' },
    list_commits: { method: 'GET', path: '/repos/{owner}/{repo}/commits', auth: 'header' },
    create_branch: { method: 'POST', path: '/repos/{owner}/{repo}/git/refs', auth: 'header' },
    get_user: { method: 'GET', path: '/user', auth: 'header' },
    create_gist: { method: 'POST', path: '/gists', auth: 'header' },
    list_workflows: { method: 'GET', path: '/repos/{owner}/{repo}/actions/workflows', auth: 'header' },
    trigger_workflow: { method: 'POST', path: '/repos/{owner}/{repo}/actions/workflows/{workflow_id}/dispatches', auth: 'header' },
  }},
  gmail: { baseUrl: 'https://gmail.googleapis.com/gmail/v1/users/me', actions: {
    list_messages: { method: 'GET', path: '/messages', auth: 'header' },
    get_message: { method: 'GET', path: '/messages/{id}', auth: 'header' },
    send_message: { method: 'POST', path: '/messages/send', auth: 'header' },
    search_messages: { method: 'GET', path: '/messages', auth: 'header' },
    create_draft: { method: 'POST', path: '/drafts', auth: 'header' },
  }},
  google_calendar: { baseUrl: 'https://www.googleapis.com/calendar/v3', actions: {
    list_events: { method: 'GET', path: '/calendars/primary/events', auth: 'header' },
    create_event: { method: 'POST', path: '/calendars/primary/events', auth: 'header' },
    update_event: { method: 'PUT', path: '/calendars/primary/events/{eventId}', auth: 'header' },
    delete_event: { method: 'DELETE', path: '/calendars/primary/events/{eventId}', auth: 'header' },
    get_freebusy: { method: 'POST', path: '/freeBusy', auth: 'header' },
  }},
  google_drive: { baseUrl: 'https://www.googleapis.com/drive/v3', actions: {
    list_files: { method: 'GET', path: '/files', auth: 'header' },
    get_file: { method: 'GET', path: '/files/{fileId}', auth: 'header' },
    create_file: { method: 'POST', path: '/files', auth: 'header' },
    search_files: { method: 'GET', path: '/files', auth: 'header' },
    export_file: { method: 'GET', path: '/files/{fileId}/export', auth: 'header' },
  }},
  slack: { baseUrl: 'https://slack.com/api', actions: {
    list_channels: { method: 'GET', path: '/conversations.list', auth: 'header' },
    post_message: { method: 'POST', path: '/chat.postMessage', auth: 'header' },
    get_channel_history: { method: 'GET', path: '/conversations.history', auth: 'header' },
    list_users: { method: 'GET', path: '/users.list', auth: 'header' },
    upload_file: { method: 'POST', path: '/files.upload', auth: 'header' },
  }},
  twitter: { baseUrl: 'https://api.twitter.com/2', actions: {
    get_user: { method: 'GET', path: '/users/me', auth: 'header' },
    post_tweet: { method: 'POST', path: '/tweets', auth: 'header' },
    delete_tweet: { method: 'DELETE', path: '/tweets/{id}', auth: 'header' },
    search_tweets: { method: 'GET', path: '/tweets/search/recent', auth: 'header' },
    send_dm: { method: 'POST', path: '/dm_conversations/with/{participant_id}/messages', auth: 'header' },
    like_tweet: { method: 'POST', path: '/users/{id}/likes', auth: 'header' },
    follow_user: { method: 'POST', path: '/users/{id}/following', auth: 'header' },
  }},
  notion: { baseUrl: 'https://api.notion.com/v1', actions: {
    search: { method: 'POST', path: '/search', auth: 'header' },
    get_page: { method: 'GET', path: '/pages/{page_id}', auth: 'header' },
    create_page: { method: 'POST', path: '/pages', auth: 'header' },
    query_database: { method: 'POST', path: '/databases/{database_id}/query', auth: 'header' },
    append_block: { method: 'PATCH', path: '/blocks/{block_id}/children', auth: 'header' },
    create_comment: { method: 'POST', path: '/comments', auth: 'header' },
  }},
  discord: { baseUrl: 'https://discord.com/api/v10', actions: {
    get_user: { method: 'GET', path: '/users/@me', auth: 'header' },
    get_guilds: { method: 'GET', path: '/users/@me/guilds', auth: 'header' },
    send_message: { method: 'POST', path: '/channels/{channel_id}/messages', auth: 'header' },
    get_messages: { method: 'GET', path: '/channels/{channel_id}/messages', auth: 'header' },
    create_dm: { method: 'POST', path: '/users/@me/channels', auth: 'header' },
    add_reaction: { method: 'PUT', path: '/channels/{channel_id}/messages/{message_id}/reactions/{emoji}/@me', auth: 'header' },
  }},
  stripe: { baseUrl: 'https://api.stripe.com/v1', actions: {
    list_customers: { method: 'GET', path: '/customers', auth: 'header' },
    list_charges: { method: 'GET', path: '/charges', auth: 'header' },
    list_invoices: { method: 'GET', path: '/invoices', auth: 'header' },
    list_products: { method: 'GET', path: '/products', auth: 'header' },
    create_customer: { method: 'POST', path: '/customers', auth: 'header' },
    create_refund: { method: 'POST', path: '/refunds', auth: 'header' },
  }},
  shopify: { baseUrl: 'https://{shop}.myshopify.com/admin/api/2024-01', actions: {
    list_products: { method: 'GET', path: '/products.json', auth: 'header' },
    get_product: { method: 'GET', path: '/products/{id}.json', auth: 'header' },
    create_product: { method: 'POST', path: '/products.json', auth: 'header' },
    list_orders: { method: 'GET', path: '/orders.json', auth: 'header' },
    get_customer: { method: 'GET', path: '/customers/{id}.json', auth: 'header' },
  }},
};

export async function executeServiceAction(action: ServiceAction): Promise<ServiceActionResult> {
  try {
    const auth = await prisma.workflowAuthorization.findFirst({
      where: { userId: action.userId, service: action.service, isActive: true },
    });
    if (!auth) {
      return { success: false, error: 'Aucune autorisation pour ' + action.service + '. Connectez votre compte.' };
    }

    // Anomaly detection avant execution
    if (action.agentId) {
      const detection = await detectAnomalies({
        agentId: action.agentId,
        userId: action.userId,
        action: action.action,
        service: action.service,
        params: action.params as Record<string, unknown>,
        timestamp: new Date(),
      });
      if (detection.blocked) {
        return { success: false, error: 'Action bloquee par securite: ' + detection.reason };
      }
    }

    // Dechiffrer le token
    const accessToken = decryptField(auth.accessToken);
    if (!accessToken) {
      return { success: false, error: 'Token corrompu ou impossible a dechiffrer' };
    }

    const apiDef = SERVICE_APIS[action.service];
    if (!apiDef) return { success: false, error: 'Service non configure' };

    const actionDef = apiDef.actions[action.action];
    if (!actionDef) {
      return { success: false, error: 'Action "' + action.action + '" non supportee' };
    }

    let urlPath = actionDef.path;
    if (action.params) {
      for (const [key, value] of Object.entries(action.params)) {
        urlPath = urlPath.replace('{' + key + '}', String(value));
      }
    }

    let baseUrl = apiDef.baseUrl;
    if (baseUrl.includes('{shop}')) {
      baseUrl = baseUrl.replace('{shop}', (auth.accountName || '').toLowerCase().replace(/[^a-z0-9-]/g, '') + '.myshopify.com');
    }

    const url = baseUrl + urlPath;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };

    if (action.service === 'stripe') headers['Authorization'] = 'Bearer ' + accessToken;
    else if (action.service === 'shopify') headers['X-Shopify-Access-Token'] = accessToken;
    else if (action.service === 'discord') headers['Authorization'] = 'Bot ' + accessToken;
    else headers['Authorization'] = 'Bearer ' + accessToken;

    if (action.service === 'notion') headers['Notion-Version'] = '2022-06-28';

    const fetchOptions: RequestInit = { method: actionDef.method, headers };

    if (['POST', 'PUT', 'PATCH'].includes(actionDef.method)) {
      const body: Record<string, unknown> = {};
      if (action.params) {
        for (const [key, value] of Object.entries(action.params)) {
          if (!urlPath.includes('{' + key + '}')) body[key] = value;
        }
      }
      if (Object.keys(body).length > 0) fetchOptions.body = JSON.stringify(body);
    }

    const fullUrl = actionDef.method === 'GET' && action.params
      ? url + '?' + new URLSearchParams(
          Object.entries(action.params)
            .filter(([k]) => !urlPath.includes('{' + k + '}'))
            .map(([k, v]) => [k, String(v)])
        ).toString()
      : url;

    const response = await fetch(fullUrl, fetchOptions);
    const data = await response.json();

    await prisma.workflowAuthorization.update({
      where: { id: auth.id },
      data: { lastUsedAt: new Date() },
    });

    if (!response.ok) {
      if (action.agentId) recordFailure(action.agentId, action.service);
      return { success: false, error: 'Erreur ' + response.status + ': ' + JSON.stringify(data), statusCode: response.status, data };
    }

    if (action.agentId) recordSuccess(action.agentId, action.service);
    return { success: true, data, statusCode: response.status };
  } catch (error) {
    return { success: false, error: 'Erreur: ' + (error instanceof Error ? error.message : 'Inconnue') };
  }
}

export function getAvailableActions(service: string): Array<{ name: string; method: string }> {
  const apiDef = SERVICE_APIS[service];
  if (!apiDef) return [];
  return Object.entries(apiDef.actions).map(([name, def]) => ({ name, method: def.method }));
}

export function getSupportedServices(): string[] {
  return Object.keys(SERVICE_APIS);
}
