/**
 * Agent Autonome Multi-Plateforme
 * Actions web et comptes personnels via OAuth + permissions
 */

type Platform = 'gmail' | 'google_calendar' | 'google_drive' | 'slack' | 'discord' | 'github' | 'notion' | 'twitter' | 'linkedin' | 'shopify' | 'stripe' | 'supabase' | 'web_browser';
type PermissionLevel = 'read' | 'write' | 'admin';

interface PlatformPermission { platform: Platform; level: PermissionLevel; scopes: string[]; expiresAt?: Date; }
interface UserAuthorization { userId: string; permissions: PlatformPermission[]; oauthTokens: Record<string, OAuthToken>; createdAt: Date; updatedAt: Date; }
interface OAuthToken { accessToken: string; refreshToken?: string; expiresAt?: Date; scope: string[]; platform: Platform; }
interface AgentAction { id: string; type: string; platform: Platform; params: Record<string, any>; status: 'pending' | 'running' | 'completed' | 'failed' | 'blocked'; result?: any; error?: string; requiresApproval: boolean; approvedBy?: string; executedAt?: Date; }

const SCOPES: Record<Platform, string[]> = {
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

const RISKY: string[] = ['email_send', 'payment', 'database_write', 'github_pr', 'drive_write', 'form_fill', 'tweet', 'slack_message'];

function genId(p: string): string {
  const a = new Uint8Array(8); crypto.getRandomValues(a);
  return p + '_' + Array.from(a, b => b.toString(16).padStart(2, '0')).join('');
}

class AuthzManager {
  private auths = new Map<string, UserAuthorization>();
  private pending = new Map<string, AgentAction>();

  async register(userId: string, platform: Platform, token: OAuthToken, level: PermissionLevel = 'read') {
    let a = this.auths.get(userId);
    if (!a) a = { userId, permissions: [], oauthTokens: {}, createdAt: new Date(), updatedAt: new Date() };
    a.oauthTokens[platform] = token;
    const idx = a.permissions.findIndex(p => p.platform === platform);
    const perm: PlatformPermission = { platform, level, scopes: token.scope, expiresAt: token.expiresAt };
    if (idx >= 0) a.permissions[idx] = perm; else a.permissions.push(perm);
    a.updatedAt = new Date(); this.auths.set(userId, a);
  }

  async check(userId: string, platform: Platform, type: string) {
    const a = this.auths.get(userId);
    if (!a) return { ok: false, reason: 'Connexion requise.' };
    const p = a.permissions.find(x => x.platform === platform);
    if (!p) return { ok: false, reason: 'Permission ' + platform + ' non accordee.' };
    if (RISKY.includes(type) && p.level === 'read') return { ok: false, reason: 'Ecriture requise.' };
    const t = a.oauthTokens[platform];
    if (t?.expiresAt && new Date() > t.expiresAt) return { ok: false, reason: 'Token expire.' };
    return { ok: true, needsApproval: RISKY.includes(type) && type !== 'email_read' };
  }

  async requestApproval(userId: string, action: AgentAction) {
    const id = genId('app'); action.requiresApproval = true; action.status = 'blocked';
    this.pending.set(id, action); return id;
  }

  async handleApproval(id: string, userId: string, yes: boolean) {
    const a = this.pending.get(id); if (!a) return null;
    if (yes) { a.status = 'pending'; a.approvedBy = userId; }
    else { a.status = 'blocked'; a.error = 'Rejete'; }
    this.pending.delete(id); return a;
  }

  list(userId: string) { return this.auths.get(userId)?.permissions || []; }

  async revoke(userId: string, platform: Platform) {
    const a = this.auths.get(userId); if (!a) return;
    a.permissions = a.permissions.filter(p => p.platform !== platform);
    delete a.oauthTokens[platform]; a.updatedAt = new Date();
  }
}

class Executor {
  constructor(private authz: AuthzManager) {}

  async run(userId: string, action: Omit<AgentAction, 'id' | 'status'>): Promise<AgentAction> {
    const fa: AgentAction = { ...action, id: genId('act'), status: 'pending', requiresApproval: false };
    const c = await this.authz.check(userId, action.platform, action.type);
    if (!c.ok) { fa.status = 'blocked'; fa.error = c.reason; return fa; }
    if (c.needsApproval) { const id = await this.authz.requestApproval(userId, fa); fa.status = 'blocked'; return { ...fa, id }; }
    fa.status = 'running';
    try { fa.result = await this.exec(action); fa.status = 'completed'; fa.executedAt = new Date(); }
    catch (e: any) { fa.status = 'failed'; fa.error = e.message; }
    return fa;
  }

  private async exec(a: AgentAction): Promise<any> {
    const p = a.params;
    switch (a.platform) {
      case 'web_browser':
        if (a.type === 'search') return { results: 'Resultats: ' + p.query };
        if (a.type === 'browse') return { page: 'Contenu de ' + p.url };
        if (a.type === 'extract') return { data: '[extrait]' };
        if (a.type === 'form_fill') return { status: 'Rempli', url: p.url };
        break;
      case 'gmail':
        if (a.type === 'email_read') return { count: 5, subjects: ['Facture', 'Rapport', 'Newsletter', 'Notif', 'Autre'] };
        if (a.type === 'email_send') return { sent: true, to: p.to, subject: p.subject };
        break;
      case 'google_calendar': return { created: true, title: p.title, date: p.date };
      case 'google_drive': return a.type === 'drive_read' ? { files: 3 } : { created: true, name: p.fileName };
      case 'slack': case 'discord': return { sent: true, channel: p.channel };
      case 'github': return { url: 'https://github.com/' + p.repo + '/pull/1' };
      case 'supabase': return { executed: true, rows: 0 };
      case 'stripe': return { charge: genId('ch'), amount: p.amount, status: 'ok' };
    }
    throw new Error('Action ' + a.type + ' non supportee');
  }
}

export class Orchestrator {
  private authz = new AuthzManager();
  private exec = new Executor(this.authz);

  async connect(userId: string, platform: Platform) {
    try {
      const token: OAuthToken = { accessToken: 't_' + Date.now(), refreshToken: 'r_' + Date.now(), scope: SCOPES[platform], platform, expiresAt: new Date(Date.now() + 30*86400000) };
      await this.authz.register(userId, platform, token, 'write'); return true;
    } catch { return false; }
  }

  getOAuthURL(platform: Platform, redirectUri: string): string {
    const g = process.env.GOOGLE_CLIENT_ID ?? ''; const s = process.env.SLACK_CLIENT_ID ?? '';
    const gh = process.env.GITHUB_CLIENT_ID ?? ''; const d = process.env.DISCORD_CLIENT_ID ?? '';
    const st = process.env.STRIPE_CLIENT_ID ?? '';
    const urls: Record<string, string> = {
      gmail: 'https://accounts.google.com/o/oauth2/v2/auth?client_id=' + g + '&redirect_uri=' + redirectUri + '&response_type=code&scope=' + SCOPES.gmail.join(' ') + '&access_type=offline',
      slack: 'https://slack.com/oauth/v2/authorize?client_id=' + s + '&scope=' + SCOPES.slack.join(',') + '&redirect_uri=' + redirectUri,
      github: 'https://github.com/login/oauth/authorize?client_id=' + gh + '&scope=' + SCOPES.github.join(',') + '&redirect_uri=' + redirectUri,
      discord: 'https://discord.com/api/oauth2/authorize?client_id=' + d + '&permissions=8&scope=bot%20applications.commands&redirect_uri=' + redirectUri,
      stripe: 'https://connect.stripe.com/oauth/authorize?client_id=' + st + '&redirect_uri=' + redirectUri + '&response_type=code&scope=read_write',
      web_browser: '/agent/connect/browser',
    };
    return urls[platform] || '/agent/connect/manual';
  }

  async instruct(userId: string, instruction: string): Promise<any> {
    const intent = this.parse(instruction);
    if (!intent) return { error: 'Instruction non comprise' };
    const c = await this.authz.check(userId, intent.platform, intent.actionType);
    if (!c.ok) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      return { requiresAuth: true, platform: intent.platform, reason: c.reason, oauthUrl: this.getOAuthURL(intent.platform, appUrl + '/api/agent/oauth/callback') };
    }
    const action: Omit<AgentAction, 'id' | 'status'> = { type: intent.actionType, platform: intent.platform, params: intent.params, requiresApproval: false };
    const result = await this.exec.run(userId, action);
    if (result.status === 'blocked' && result.requiresApproval) {
      return { requiresApproval: true, approvalId: result.id, action: result.type, platform: result.platform, details: result.params };
    }
    return result;
  }

  async approve(userId: string, approvalId: string, approved: boolean) {
    const a = await this.authz.handleApproval(approvalId, userId, approved);
    if (!a) return { error: 'ID invalide' };
    if (approved) return await this.exec.run(userId, a);
    return { status: 'rejected' };
  }

  async disconnect(userId: string, platform: Platform) { await this.authz.revoke(userId, platform); }

  private parse(instruction: string): { platform: Platform; actionType: string; params: Record<string, any> } | null {
    const l = instruction.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (l.includes('email') || l.includes('mail') || l.includes('gmail')) {
      if (l.includes('envoyer') || l.includes('send') || l.includes('ecrire')) {
        const m = l.match(/a\s+([\w@.]+)/); return { platform: 'gmail', actionType: 'email_send', params: { to: m?.[1] || '', subject: instruction.substring(0, 50), body: instruction } };
      }
      return { platform: 'gmail', actionType: 'email_read', params: { q: instruction } };
    }
    if (l.includes('cherche') || l.includes('search') || l.includes('trouve') || l.includes('google')) {
      return { platform: 'web_browser', actionType: 'search', params: { query: instruction.replace(/cherche|search|trouve|google/gi, '').trim() } };
    }
    if (l.includes('va sur') || l.includes('ouvre') || l.includes('navigate')) {
      const url = instruction.match(/https?:\/\/[^\s]+/)?.[0] || instruction.replace(/va\s+sur|ouvre|navigate/gi, '').trim();
      return { platform: 'web_browser', actionType: 'browse', params: { url: url.startsWith('http') ? url : 'https://' + url } };
    }
    if (l.includes('extra')) return { platform: 'web_browser', actionType: 'extract', params: { url: '', selector: instruction } };
    if (l.includes('slack')) return { platform: 'slack', actionType: 'slack_message', params: { channel: 'general', message: instruction } };
    if (l.includes('discord')) return { platform: 'discord', actionType: 'slack_message', params: { channel: 'general', message: instruction } };
    if (l.includes('github') || l.includes('pull request') || l.includes('pr')) return { platform: 'github', actionType: 'github_pr', params: { repo: 'missock237-spec/Genova', title: instruction.substring(0, 50), body: instruction } };
    if (l.includes('calendrier') || l.includes('calendar') || l.includes('rdv') || l.includes('evenement')) return { platform: 'google_calendar', actionType: 'calendar_create', params: { title: instruction, date: new Date().toISOString() } };
    if (l.includes('drive') || l.includes('fichier') || l.includes('document')) return { platform: 'google_drive', actionType: 'drive_write', params: { fileName: 'Doc Genova', content: instruction } };
    if (l.includes('base') || l.includes('database') || l.includes('supabase') || l.includes('sql')) return { platform: 'supabase', actionType: 'database_query', params: { query: instruction } };
    if (l.includes('paiement') || l.includes('payer') || l.includes('orange') || l.includes('mtn')) return { platform: 'stripe', actionType: 'payment', params: { amount: 0, description: instruction } };
    return null;
  }
}

export const agentOrchestrator = new Orchestrator();
export { AuthzManager as AuthorizationManager, Executor as ActionExecutor, Orchestrator as AgentOrchestrator };
export type { Platform, PermissionLevel, PlatformPermission, UserAuthorization, OAuthToken, AgentAction };
export { SCOPES as PLATFORM_SCOPES, RISKY as RISKY_ACTIONS };
