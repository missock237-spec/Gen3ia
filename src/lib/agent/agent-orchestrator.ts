/**
 * 🧠 Agent Autonome Multi-Plateforme
 * Permet aux agents IA d'agir sur le web et dans les comptes personnels
 * via OAuth et système de permissions granulaire
 */

type Platform =
  | 'gmail' | 'google_calendar' | 'google_drive'
  | 'slack' | 'discord' | 'github' | 'notion'
  | 'twitter' | 'linkedin' | 'shopify' | 'stripe'
  | 'supabase' | 'web_browser';

type PermissionLevel = 'read' | 'write' | 'admin';

interface PlatformPermission {
  platform: Platform;
  level: PermissionLevel;
  scopes: string[];
  expiresAt?: Date;
}

interface UserAuthorization {
  userId: string;
  permissions: PlatformPermission[];
  oauthTokens: Record<string, OAuthToken>;
  createdAt: Date;
  updatedAt: Date;
}

interface OAuthToken {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
  scope: string[];
  platform: Platform;
}

interface AgentAction {
  id: string;
  type: string;
  platform: Platform;
  params: Record<string, any>;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'blocked';
  result?: any;
  error?: string;
  requiresApproval: boolean;
  approvedBy?: string;
  executedAt?: Date;
}

const PLATFORM_SCOPES: Record<Platform, string[]> = {
  gmail: ['https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/gmail.send', 'https://www.googleapis.com/auth/gmail.modify'],
  google_calendar: ['https://www.googleapis.com/auth/calendar.readonly', 'https://www.googleapis.com/auth/calendar.events'],
  google_drive: ['https://www.googleapis.com/auth/drive.readonly', 'https://www.googleapis.com/auth/drive.file'],
  slack: ['channels:history', 'channels:read', 'chat:write', 'users:read', 'files:read', 'files:write'],
  discord: ['bot', 'messages.read', 'messages.write', 'guilds.members.read'],
  github: ['repo', 'user', 'workflow'],
  notion: ['read', 'write', 'blocks'],
  twitter: ['tweet.read', 'tweet.write', 'users.read'],
  linkedin: ['profile', 'email', 'openid'],
  shopify: ['read_products', 'write_products', 'read_orders', 'write_orders'],
  stripe: ['charges.read', 'charges.write', 'customers.read', 'customers.write'],
  supabase: ['database.read', 'database.write', 'storage.read', 'storage.write'],
  web_browser: ['navigate', 'click', 'extract', 'form_fill', 'screenshot'],
};

const RISKY_ACTIONS: string[] = [
  'email_send', 'payment', 'database_write', 'github_pr',
  'drive_write', 'form_fill', 'tweet', 'slack_message',
];

function generateId(prefix: string): string {
  const array = new Uint8Array(8);
  crypto.getRandomValues(array);
  return prefix + '_' + Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

class AuthorizationManager {
  private authorizations: Map<string, UserAuthorization> = new Map();
  private pendingApprovals: Map<string, AgentAction> = new Map();

  async registerOAuthToken(userId: string, platform: Platform, token: OAuthToken, level: PermissionLevel = 'read'): Promise<void> {
    let auth = this.authorizations.get(userId);
    if (!auth) {
      auth = { userId, permissions: [], oauthTokens: {}, createdAt: new Date(), updatedAt: new Date() };
    }
    auth.oauthTokens[platform] = token;
    const existingPermIndex = auth.permissions.findIndex(p => p.platform === platform);
    const permission: PlatformPermission = { platform, level, scopes: token.scope, expiresAt: token.expiresAt };
    if (existingPermIndex >= 0) auth.permissions[existingPermIndex] = permission;
    else auth.permissions.push(permission);
    auth.updatedAt = new Date();
    this.authorizations.set(userId, auth);
  }

  async checkAuthorization(userId: string, platform: Platform, actionType: string): Promise<{ authorized: boolean; requiresApproval: boolean; reason?: string }> {
    const auth = this.authorizations.get(userId);
    if (!auth) return { authorized: false, requiresApproval: true, reason: 'Aucune autorisation. Connexion requise.' };
    const permission = auth.permissions.find(p => p.platform === platform);
    if (!permission) return { authorized: false, requiresApproval: true, reason: 'Permission ' + platform + ' non accordee.' };
    const needsWrite = RISKY_ACTIONS.includes(actionType);
    if (needsWrite && permission.level === 'read') return { authorized: false, requiresApproval: true, reason: 'Acces en ecriture requis.' };
    const token = auth.oauthTokens[platform];
    if (token?.expiresAt && new Date() > token.expiresAt) return { authorized: false, requiresApproval: true, reason: 'Token expire.' };
    return { authorized: true, requiresApproval: needsWrite && actionType !== 'email_read' };
  }

  async requestApproval(userId: string, action: AgentAction): Promise<string> {
    const approvalId = generateId('app');
    action.requiresApproval = true;
    action.status = 'blocked';
    this.pendingApprovals.set(approvalId, action);
    return approvalId;
  }

  async handleApproval(approvalId: string, userId: string, approved: boolean): Promise<AgentAction | null> {
    const action = this.pendingApprovals.get(approvalId);
    if (!action) return null;
    if (approved) { action.status = 'pending'; action.approvedBy = userId; }
    else { action.status = 'blocked'; action.error = 'Rejete par l utilisateur'; }
    this.pendingApprovals.delete(approvalId);
    return action;
  }

  getUserPermissions(userId: string): PlatformPermission[] { return this.authorizations.get(userId)?.permissions || []; }

  async revokePlatformAccess(userId: string, platform: Platform): Promise<void> {
    const auth = this.authorizations.get(userId);
    if (!auth) return;
    auth.permissions = auth.permissions.filter(p => p.platform !== platform);
    delete auth.oauthTokens[platform];
    auth.updatedAt = new Date();
  }
}

class ActionExecutor {
  private authManager: AuthorizationManager;
  constructor(authManager: AuthorizationManager) { this.authManager = authManager; }

  async execute(userId: string, action: Omit<AgentAction, 'id' | 'status'>): Promise<AgentAction> {
    const fullAction: AgentAction = { ...action, id: generateId('act'), status: 'pending', requiresApproval: false };
    const check = await this.authManager.checkAuthorization(userId, action.platform, action.type);
    if (!check.authorized) { fullAction.status = 'blocked'; fullAction.error = check.reason; return fullAction; }
    if (check.requiresApproval) { const approvalId = await this.authManager.requestApproval(userId, fullAction); fullAction.status = 'blocked'; return { ...fullAction, id: approvalId }; }
    fullAction.status = 'running';
    try {
      fullAction.result = await this.executeOnPlatform(fullAction);
      fullAction.status = 'completed';
      fullAction.executedAt = new Date();
    } catch (error: any) { fullAction.status = 'failed'; fullAction.error = error.message; }
    return fullAction;
  }

  private async executeOnPlatform(action: AgentAction): Promise<any> {
    const p = action.params;
    switch (action.platform) {
      case 'web_browser':
        if (action.type === 'search') return { results: 'Resultats pour: ' + p.query };
        if (action.type === 'browse') return { page: 'Contenu de ' + p.url, title: 'Page Title', text: 'Contenu de la page...' };
        if (action.type === 'extract') return { data: '[Donnees extraites]', selector: p.selector };
        if (action.type === 'form_fill') return { status: 'Formulaire rempli', url: p.url };
        if (action.type === 'click') return { clicked: p.selector, success: true };
        break;
      case 'gmail':
        if (action.type === 'email_read') return { emails: '5 nouveaux emails', subjects: ['Facture', 'Rapport', 'Newsletter', 'Notification', 'Autre'], count: 5 };
        if (action.type === 'email_send') return { sent: true, to: p.to, subject: p.subject };
        break;
      case 'google_calendar':
        return { created: true, title: p.title, date: p.date };
      case 'google_drive':
        if (action.type === 'drive_read') return { files: ['Rapport Q3.pdf', 'Budget 2026.xlsx', 'Notes.md'], count: 3 };
        if (action.type === 'drive_write') return { created: true, name: p.fileName };
        break;
      case 'slack': case 'discord':
        return { sent: true, channel: p.channel };
      case 'github':
        if (action.type === 'github_pr') return { url: 'https://github.com/' + p.repo + '/pull/1', number: 1 };
        break;
      case 'supabase':
        return { executed: true, query: p.query, rows: [], affected: 0 };
      case 'stripe':
        if (action.type === 'payment') return { charge: generateId('ch'), amount: p.amount, status: 'succeeded' };
        break;
    }
    throw new Error('Action ' + action.type + ' non supportee sur ' + action.platform);
  }
}

class AgentOrchestrator {
  private authManager: AuthorizationManager;
  private executor: ActionExecutor;

  constructor() {
    this.authManager = new AuthorizationManager();
    this.executor = new ActionExecutor(this.authManager);
  }

  async connectPlatform(userId: string, platform: Platform, authCode: string): Promise<boolean> {
    try {
      const token: OAuthToken = {
        accessToken: 'token_' + platform + '_' + Date.now(),
        refreshToken: 'refresh_' + Date.now(),
        scope: PLATFORM_SCOPES[platform],
        platform,
        expiresAt: new Date(Date.now() + 3600000 * 24 * 30),
      };
      await this.authManager.registerOAuthToken(userId, platform, token, 'write');
      return true;
    } catch { return false; }
  }

  getOAuthURL(platform: Platform, redirectUri: string): string {
    const urls: Record<string, string> = {
      gmail: 'https://accounts.google.com/o/oauth2/v2/auth?client_id=' + encodeURIComponent(process.env.GOOGLE_CLIENT_ID || '') + '&redirect_uri=' + encodeURIComponent(redirectUri) + '&response_type=code&scope=' + encodeURIComponent(PLATFORM_SCOPES.gmail.join(' ')) + '&access_type=offline',
      slack: 'https://slack.com/oauth/v2/authorize?client_id=' + encodeURIComponent(process.env.SLACK_CLIENT_ID || '') + '&scope=' + encodeURIComponent(PLATFORM_SCOPES.slack.join(',')) + '&redirect_uri=' + encodeURIComponent(redirectUri),
      github: 'https://github.com/login/oauth/authorize?client_id=' + encodeURIComponent(process.env.GITHUB_CLIENT_ID || '') + '&scope=' + encodeURIComponent(PLATFORM_SCOPES.github.join(',')) + '&redirect_uri=' + encodeURIComponent(redirectUri),
      discord: 'https://discord.com/api/oauth2/authorize?client_id=' + encodeURIComponent(process.env.DISCORD_CLIENT_ID || '') + '&permissions=8&scope=bot%20applications.commands&redirect_uri=' + encodeURIComponent(redirectUri),
      stripe: 'https://connect.stripe.com/oauth/authorize?client_id=' + encodeURIComponent(process.env.STRIPE_CLIENT_ID || '') + '&redirect_uri=' + encodeURIComponent(redirectUri) + '&response_type=code&scope=read_write',
      web_browser: '/agent/connect/browser',
    };
    return urls[platform] || '/agent/connect/manual';
  }

  async instruct(userId: string, instruction: string): Promise<any> {
    const intent = this.parseIntent(instruction);
    if (!intent) return { error: 'Instruction non comprise', instruction };
    const check = await this.authManager.checkAuthorization(userId, intent.platform, intent.actionType);
    if (!check.authorized) {
      return {
        requiresAuth: true, platform: intent.platform, reason: check.reason,
        oauthUrl: this.getOAuthURL(intent.platform, (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000') + '/api/agent/oauth/callback'),
        message: "J'ai besoin d'acceder a " + intent.platform + '. Clique sur le lien pour autoriser.',
      };
    }
    const action: Omit<AgentAction, 'id' | 'status'> = { type: intent.actionType, platform: intent.platform, params: intent.params, requiresApproval: false };
    const result = await this.executor.execute(userId, action);
    if (result.status === 'blocked' && result.requiresApproval) {
      return { requiresApproval: true, approvalId: result.id, action: result.type, platform: result.platform, details: result.params, message: 'Action risquee detectee. Approbation necessaire.' };
    }
    return result;
  }

  private parseIntent(instruction: string): { platform: Platform; actionType: string; params: Record<string, any> } | null {
    const lower = instruction.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (lower.includes('email') || lower.includes('mail') || lower.includes('gmail') || lower.includes('courrier')) {
      if (lower.includes('envoyer') || lower.includes('send') || lower.includes('ecrire') || lower.includes('envoie')) {
        const toMatch = lower.match(/a\s+([\w@.]+)/);
        return { platform: 'gmail', actionType: 'email_send', params: { to: toMatch?.[1] || '', subject: instruction.substring(0, 50), body: instruction } };
      }
      return { platform: 'gmail', actionType: 'email_read', params: { query: instruction } };
    }
    if (lower.includes('cherche') || lower.includes('search') || lower.includes('trouve') || lower.includes('google') || lower.includes('recherche')) {
      const query = instruction.replace(/cherche|search|trouve|google|recherche|moi|sur|internet/gi, '').trim();
      return { platform: 'web_browser', actionType: 'search', params: { query: query || instruction } };
    }
    if (lower.includes('va sur') || lower.includes('go to') || lower.includes('ouvre') || lower.includes('navigate') || lower.includes('va')) {
      const url = instruction.match(/https?:\/\/[^\s]+/)?.[0] || instruction.replace(/va\s+sur|ouvre|go\s+to|navigate/gi, '').trim();
      return { platform: 'web_browser', actionType: 'browse', params: { url: url.startsWith('http') ? url : 'https://' + url } };
    }
    if (lower.includes('extrait') || lower.includes('extract') || lower.includes('recupere') || lower.includes('scrape')) {
      return { platform: 'web_browser', actionType: 'extract', params: { url: instruction.match(/https?:\/\/[^\s]+/)?.[0] || '', selector: instruction } };
    }
    if (lower.includes('slack')) {
      const channelMatch = lower.match(/#(\w+)/);
      return { platform: 'slack', actionType: 'slack_message', params: { channel: channelMatch?.[1] || 'general', message: instruction } };
    }
    if (lower.includes('discord')) return { platform: 'discord', actionType: 'slack_message', params: { channel: 'general', message: instruction } };
    if (lower.includes('github') || lower.includes('pull request') || lower.includes('pr')) {
      return { platform: 'github', actionType: 'github_pr', params: { repo: 'missock237-spec/Genova', title: instruction.substring(0, 50), body: instruction } };
    }
    if (lower.includes('calendrier') || lower.includes('calendar') || lower.includes('rendez-vous') || lower.includes('rdv') || lower.includes('evenement')) {
      return { platform: 'google_calendar', actionType: 'calendar_create', params: { title: instruction, date: new Date().toISOString() } };
    }
    if (lower.includes('drive') || lower.includes('fichier') || lower.includes('document')) {
      return { platform: 'google_drive', actionType: 'drive_write', params: { fileName: 'Document Genova', content: instruction } };
    }
    if (lower.includes('base') || lower.includes('database') || lower.includes('supabase') || lower.includes('sql') || lower.includes('donnee')) {
      return { platform: 'supabase', actionType: 'database_query', params: { query: instruction } };
    }
    if (lower.includes('paiement') || lower.includes('payer') || lower.includes('payment') || lower.includes('mobile money') || lower.includes('orange') || lower.includes('mtn')) {
      return { platform: 'stripe', actionType: 'payment', params: { amount: 0, description: instruction } };
    }
    if (lower.includes('remplir') || lower.includes('formulaire') || lower.includes('form')) {
      return { platform: 'web_browser', actionType: 'form_fill', params: { url: instruction.match(/https?:\/\/[^\s]+/)?.[0] || '', formData: { value: instruction } } };
    }
    return null;
  }

  async approveAction(userId: string, approvalId: string, approved: boolean): Promise<any> {
    const action = await this.authManager.handleApproval(approvalId, userId, approved);
    if (!action) return { error: "ID d'approbation invalide" };
    if (approved) return await this.executor.execute(userId, action);
    return { status: 'rejected', message: 'Action rejetee' };
  }

  async disconnectPlatform(userId: string, platform: Platform): Promise<void> {
    await this.authManager.revokePlatformAccess(userId, platform);
  }

  getAuthManager(): AuthorizationManager { return this.authManager; }
}

export const agentOrchestrator = new AgentOrchestrator();
export { AuthorizationManager, ActionExecutor, AgentOrchestrator };
export type { Platform, PermissionLevel, PlatformPermission, UserAuthorization, OAuthToken, AgentAction };
export { PLATFORM_SCOPES, RISKY_ACTIONS };
