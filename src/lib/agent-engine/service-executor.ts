// Agent Service Executor — permet aux agents IA d'executer des actions via les tokens OAuth stockes

import { prisma } from '@/lib/prisma';

interface ServiceAction {
  service: string;
  action: string;
  params: Record<string, unknown>;
  userId: string;
  agentId?: string;
}

interface ServiceActionResult {
  success: boolean;
  data?: unknown;
  error?: string;
  statusCode?: number;
}

const SERVICE_APIS: Record<string, { baseUrl: string; actions: Record<string, { method: string; path: string; auth: 'header' | 'query' }> }> = {
  github: {
    baseUrl: 'https://api.github.com',
    actions: {
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
    },
  },
  gmail: {
    baseUrl: 'https://gmail.googleapis.com/gmail/v1/users/me',
    actions: {
      list_messages: { method: 'GET', path: '/messages', auth: 'header' },
      get_message: { method: 'GET', path: '/messages/{id}', auth: 'header' },
      send_message: { method: 'POST', path: '/messages/send', auth: 'header' },
      list_labels: { method: 'GET', path: '/labels', auth: 'header' },
      modify_message: { method: 'POST', path: '/messages/{id}/modify', auth: 'header' },
      trash_message: { method: 'POST', path: '/messages/{id}/trash', auth: 'header' },
      untrash_message: { method: 'POST', path: '/messages/{id}/untrash', auth: 'header' },
      get_profile: { method: 'GET', path: '/profile', auth: 'header' },
      create_draft: { method: 'POST', path: '/drafts', auth: 'header' },
      list_drafts: { method: 'GET', path: '/drafts', auth: 'header' },
      search_messages: { method: 'GET', path: '/messages', auth: 'header' },
    },
  },
  google_calendar: {
    baseUrl: 'https://www.googleapis.com/calendar/v3',
    actions: {
      list_events: { method: 'GET', path: '/calendars/primary/events', auth: 'header' },
      create_event: { method: 'POST', path: '/calendars/primary/events', auth: 'header' },
      update_event: { method: 'PUT', path: '/calendars/primary/events/{eventId}', auth: 'header' },
      delete_event: { method: 'DELETE', path: '/calendars/primary/events/{eventId}', auth: 'header' },
      get_event: { method: 'GET', path: '/calendars/primary/events/{eventId}', auth: 'header' },
      list_calendars: { method: 'GET', path: '/users/me/calendarList', auth: 'header' },
      quick_add: { method: 'POST', path: '/calendars/primary/events/quickAdd', auth: 'header' },
      get_freebusy: { method: 'POST', path: '/freeBusy', auth: 'header' },
      import_event: { method: 'POST', path: '/calendars/primary/events/import', auth: 'header' },
    },
  },
  google_drive: {
    baseUrl: 'https://www.googleapis.com/drive/v3',
    actions: {
      list_files: { method: 'GET', path: '/files', auth: 'header' },
      get_file: { method: 'GET', path: '/files/{fileId}', auth: 'header' },
      create_file: { method: 'POST', path: '/files', auth: 'header' },
      delete_file: { method: 'DELETE', path: '/files/{fileId}', auth: 'header' },
      search_files: { method: 'GET', path: '/files', auth: 'header' },
      export_file: { method: 'GET', path: '/files/{fileId}/export', auth: 'header' },
      copy_file: { method: 'POST', path: '/files/{fileId}/copy', auth: 'header' },
      list_permissions: { method: 'GET', path: '/files/{fileId}/permissions', auth: 'header' },
      create_permission: { method: 'POST', path: '/files/{fileId}/permissions', auth: 'header' },
      get_about: { method: 'GET', path: '/about', auth: 'header' },
    },
  },
  slack: {
    baseUrl: 'https://slack.com/api',
    actions: {
      list_channels: { method: 'GET', path: '/conversations.list', auth: 'header' },
      post_message: { method: 'POST', path: '/chat.postMessage', auth: 'header' },
      get_channel_history: { method: 'GET', path: '/conversations.history', auth: 'header' },
      list_users: { method: 'GET', path: '/users.list', auth: 'header' },
      create_channel: { method: 'POST', path: '/conversations.create', auth: 'header' },
      archive_channel: { method: 'POST', path: '/conversations.archive', auth: 'header' },
      invite_user: { method: 'POST', path: '/conversations.invite', auth: 'header' },
      get_user_info: { method: 'GET', path: '/users.info', auth: 'header' },
      search_messages: { method: 'GET', path: '/search.messages', auth: 'header' },
      upload_file: { method: 'POST', path: '/files.upload', auth: 'header' },
      add_reaction: { method: 'POST', path: '/reactions.add', auth: 'header' },
    },
  },
  twitter: {
    baseUrl: 'https://api.twitter.com/2',
    actions: {
      get_user: { method: 'GET', path: '/users/me', auth: 'header' },
      post_tweet: { method: 'POST', path: '/tweets', auth: 'header' },
      delete_tweet: { method: 'DELETE', path: '/tweets/{id}', auth: 'header' },
      get_tweet: { method: 'GET', path: '/tweets/{id}', auth: 'header' },
      search_tweets: { method: 'GET', path: '/tweets/search/recent', auth: 'header' },
      list_user_tweets: { method: 'GET', path: '/users/{id}/tweets', auth: 'header' },
      like_tweet: { method: 'POST', path: '/users/{id}/likes', auth: 'header' },
      list_likes: { method: 'GET', path: '/users/{id}/likes', auth: 'header' },
      follow_user: { method: 'POST', path: '/users/{id}/following', auth: 'header' },
      list_followers: { method: 'GET', path: '/users/{id}/followers', auth: 'header' },
      get_timeline: { method: 'GET', path: '/users/{id}/timelines/reverse_chronological', auth: 'header' },
      send_dm: { method: 'POST', path: '/dm_conversations/with/{participant_id}/messages', auth: 'header' },
      list_dms: { method: 'GET', path: '/dm_conversations/{dm_conversation_id}/messages', auth: 'header' },
    },
  },
  linkedin: {
    baseUrl: 'https://api.linkedin.com/v2',
    actions: {
      get_profile: { method: 'GET', path: '/userinfo', auth: 'header' },
      create_post: { method: 'POST', path: '/ugcPosts', auth: 'header' },
      list_posts: { method: 'GET', path: '/me/author/comments', auth: 'header' },
      get_company: { method: 'GET', path: '/organizations/{id}', auth: 'header' },
      search_people: { method: 'GET', path: '/search', auth: 'header' },
      send_message: { method: 'POST', path: '/messages', auth: 'header' },
    },
  },
  notion: {
    baseUrl: 'https://api.notion.com/v1',
    actions: {
      search: { method: 'POST', path: '/search', auth: 'header' },
      get_page: { method: 'GET', path: '/pages/{page_id}', auth: 'header' },
      create_page: { method: 'POST', path: '/pages', auth: 'header' },
      update_page: { method: 'PATCH', path: '/pages/{page_id}', auth: 'header' },
      get_database: { method: 'GET', path: '/databases/{database_id}', auth: 'header' },
      query_database: { method: 'POST', path: '/databases/{database_id}/query', auth: 'header' },
      create_database: { method: 'POST', path: '/databases', auth: 'header' },
      append_block: { method: 'PATCH', path: '/blocks/{block_id}/children', auth: 'header' },
      get_user: { method: 'GET', path: '/users/me', auth: 'header' },
      list_users: { method: 'GET', path: '/users', auth: 'header' },
      get_comments: { method: 'GET', path: '/comments', auth: 'header' },
      create_comment: { method: 'POST', path: '/comments', auth: 'header' },
    },
  },
  discord: {
    baseUrl: 'https://discord.com/api/v10',
    actions: {
      get_user: { method: 'GET', path: '/users/@me', auth: 'header' },
      get_guilds: { method: 'GET', path: '/users/@me/guilds', auth: 'header' },
      get_channels: { method: 'GET', path: '/guilds/{guild_id}/channels', auth: 'header' },
      send_message: { method: 'POST', path: '/channels/{channel_id}/messages', auth: 'header' },
      get_messages: { method: 'GET', path: '/channels/{channel_id}/messages', auth: 'header' },
      delete_message: { method: 'DELETE', path: '/channels/{channel_id}/messages/{message_id}', auth: 'header' },
      create_dm: { method: 'POST', path: '/users/@me/channels', auth: 'header' },
      get_guild_member: { method: 'GET', path: '/guilds/{guild_id}/members/{user_id}', auth: 'header' },
      add_reaction: { method: 'PUT', path: '/channels/{channel_id}/messages/{message_id}/reactions/{emoji}/@me', auth: 'header' },
      remove_reaction: { method: 'DELETE', path: '/channels/{channel_id}/messages/{message_id}/reactions/{emoji}', auth: 'header' },
    },
  },
  dropbox: {
    baseUrl: 'https://api.dropboxapi.com/2',
    actions: {
      get_account: { method: 'POST', path: '/users/get_current_account', auth: 'header' },
      list_folder: { method: 'POST', path: '/files/list_folder', auth: 'header' },
      download_file: { method: 'POST', path: '/files/download', auth: 'header' },
      upload_file: { method: 'POST', path: '/files/upload', auth: 'header' },
      delete_file: { method: 'POST', path: '/files/delete_v2', auth: 'header' },
      search_files: { method: 'POST', path: '/files/search_v2', auth: 'header' },
      create_folder: { method: 'POST', path: '/files/create_folder_v2', auth: 'header' },
      copy_file: { method: 'POST', path: '/files/copy_v2', auth: 'header' },
      move_file: { method: 'POST', path: '/files/move_v2', auth: 'header' },
      get_file_metadata: { method: 'POST', path: '/files/get_metadata', auth: 'header' },
      list_revisions: { method: 'POST', path: '/files/list_revisions', auth: 'header' },
    },
  },
  stripe: {
    baseUrl: 'https://api.stripe.com/v1',
    actions: {
      list_customers: { method: 'GET', path: '/customers', auth: 'header' },
      get_customer: { method: 'GET', path: '/customers/{id}', auth: 'header' },
      list_charges: { method: 'GET', path: '/charges', auth: 'header' },
      list_invoices: { method: 'GET', path: '/invoices', auth: 'header' },
      list_payment_intents: { method: 'GET', path: '/payment_intents', auth: 'header' },
      list_products: { method: 'GET', path: '/products', auth: 'header' },
      list_prices: { method: 'GET', path: '/prices', auth: 'header' },
      list_subscriptions: { method: 'GET', path: '/subscriptions', auth: 'header' },
      create_customer: { method: 'POST', path: '/customers', auth: 'header' },
      create_invoice: { method: 'POST', path: '/invoices', auth: 'header' },
      create_refund: { method: 'POST', path: '/refunds', auth: 'header' },
    },
  },
  shopify: {
    baseUrl: 'https://{shop}.myshopify.com/admin/api/2024-01',
    actions: {
      list_products: { method: 'GET', path: '/products.json', auth: 'header' },
      get_product: { method: 'GET', path: '/products/{id}.json', auth: 'header' },
      create_product: { method: 'POST', path: '/products.json', auth: 'header' },
      update_product: { method: 'PUT', path: '/products/{id}.json', auth: 'header' },
      delete_product: { method: 'DELETE', path: '/products/{id}.json', auth: 'header' },
      list_orders: { method: 'GET', path: '/orders.json', auth: 'header' },
      get_order: { method: 'GET', path: '/orders/{id}.json', auth: 'header' },
      list_customers: { method: 'GET', path: '/customers.json', auth: 'header' },
      get_customer: { method: 'GET', path: '/customers/{id}.json', auth: 'header' },
      list_inventory: { method: 'GET', path: '/inventory_items.json', auth: 'header' },
      list_collections: { method: 'GET', path: '/custom_collections.json', auth: 'header' },
    },
  },
};

export async function executeServiceAction(action: ServiceAction): Promise<ServiceActionResult> {
  try {
    const auth = await prisma.workflowAuthorization.findFirst({
      where: {
        userId: action.userId,
        service: action.service,
        isActive: true,
      },
    });

    if (!auth) {
      return { success: false, error: `Aucune autorisation trouvee pour ${action.service}. Connecte d'abord ton compte.` };
    }

    const apiDef = SERVICE_APIS[action.service];
    if (!apiDef) {
      return { success: false, error: `Le service ${action.service} n'a pas d'API executeur configuree.` };
    }

    const actionDef = apiDef.actions[action.action];
    if (!actionDef) {
      const availableActions = Object.keys(apiDef.actions).join(', ');
      return { success: false, error: `Action "${action.action}" non supportee pour ${action.service}. Actions disponibles: ${availableActions}` };
    }

    let urlPath = actionDef.path;
    if (action.params) {
      for (const [key, value] of Object.entries(action.params)) {
        urlPath = urlPath.replace(`{${key}}`, String(value));
      }
    }

    let baseUrl = apiDef.baseUrl;
    if (action.params && baseUrl.includes('{shop}')) {
      const shop = auth.accountName.toLowerCase().replace(/[^a-z0-9-]/g, '') + '.myshopify.com';
      baseUrl = baseUrl.replace('{shop}', shop);
    }

    const url = `${baseUrl}${urlPath}`;
    const headers: Record<string, string> = {};

    if (actionDef.auth === 'header') {
      if (action.service === 'stripe') {
        headers['Authorization'] = `Bearer ${auth.accessToken}`;
      } else if (action.service === 'shopify') {
        headers['X-Shopify-Access-Token'] = auth.accessToken;
      } else if (action.service === 'discord') {
        headers['Authorization'] = `Bot ${auth.accessToken}`;
      } else {
        headers['Authorization'] = `Bearer ${auth.accessToken}`;
      }
    }

    if (action.service === 'notion') {
      headers['Notion-Version'] = '2022-06-28';
    }

    const fetchOptions: RequestInit = {
      method: actionDef.method,
      headers: {
        ...headers,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    };

    if (['POST', 'PUT', 'PATCH'].includes(actionDef.method)) {
      const body: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(action.params as Record<string, unknown>)) {
        if (!urlPath.includes(`{${key}}`)) {
          body[key] = value;
        }
      }
      if (Object.keys(body).length > 0) {
        fetchOptions.body = JSON.stringify(body);
      }
    }

    const queryParams = new URLSearchParams();
    if (actionDef.method === 'GET' && action.params) {
      for (const [key, value] of Object.entries(action.params)) {
        if (!urlPath.includes(`{${key}}`)) {
          queryParams.set(key, String(value));
        }
      }
    }

    const fullUrl = queryParams.toString() ? `${url}?${queryParams.toString()}` : url;

    const response = await fetch(fullUrl, fetchOptions);
    const data = await response.json();

    await prisma.workflowAuthorization.update({
      where: { id: auth.id },
      data: { lastUsedAt: new Date() },
    });

    if (!response.ok) {
      return {
        success: false,
        error: `API ${action.service} a retourne une erreur ${response.status}: ${JSON.stringify(data)}`,
        statusCode: response.status,
        data,
      };
    }

    return { success: true, data, statusCode: response.status };
  } catch (error) {
    return { success: false, error: `Erreur execution: ${error instanceof Error ? error.message : 'Inconnue'}` };
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
