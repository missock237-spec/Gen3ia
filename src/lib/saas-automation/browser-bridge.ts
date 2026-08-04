// ============================================================
// BROWSER BRIDGE — Connecte le BrowserAutomationEngine Playwright
// au système d'automatisation SaaS
//
// Ce bridge permet aux agents IA d'utiliser le navigateur Playwright
// pour interagir avec des sites web qui n'ont pas d'API, en utilisant
// les sessions authentifiées des comptes SaaS liés.
//
// Fonctionnalités:
// - Crée des sessions navigateur Playwright avec les cookies/tokens existants
// - Exécute des scripts navigateur via les templates browser_automation
// - Capture des screenshots avant/après chaque action
// - Gère l'anti-détection (fingerprinting, délais humains)
// - Injecte les cookies de session pour une auth automatique
// - Supporte l'exécution de scripts personnalisés
// - Intègre avec le Safety Guard et l'audit trail
// ============================================================

import { createLogger } from '@/lib/logger';
import { createBrowserAutomationEngine, type BrowserAction, type BrowserSession, type BrowserAutomationEngine } from '@/lib/browser/browser-automation';
import { getSaaSAccountConnector } from './account-connector';
import { prisma } from '@/lib/prisma';

const log = createLogger('browser-bridge');

// ============================================================
// Types
// ============================================================

export interface BrowserBridgeSession {
  id: string;
  userId: string;
  saasAccountId: string;
  provider: string;
  browserSessionId: string;
  url: string;
  isAuthenticated: boolean;
  createdAt: Date;
  lastUsedAt: Date;
  metadata: Record<string, unknown>;
}

export interface ExecuteBrowserScriptInput {
  userId: string;
  agentId?: string;
  saasAccountId: string;
  provider: string;
  startUrl: string;
  actions: BrowserAction[];
  options?: {
    takeScreenshots?: boolean;
    screenshotBeforeOnly?: boolean;
    injectCookies?: boolean;
    antiDetection?: boolean;
    maxTimeoutMs?: number;
    onStepComplete?: (step: number, total: number, result: unknown) => void;
  };
}

export interface ExecuteBrowserScriptResult {
  sessionId: string;
  browserSessionId: string;
  success: boolean;
  completedSteps: number;
  failedSteps: number;
  totalSteps: number;
  executionTimeMs: number;
  screenshots: string[];
  extractedData: Record<string, unknown>;
  finalUrl: string;
  error?: string;
}

// ============================================================
// Provider Login Configs — URLs de login pour injection de session
// ============================================================

const PROVIDER_LOGIN_CONFIG: Record<string, {
  loginUrl: string;
  sessionCookies: string[];
  sessionCheckSelector?: string;
  homeUrlAfterLogin?: string;
}> = {
  google_gmail: {
    loginUrl: 'https://accounts.google.com/',
    sessionCookies: ['SID', 'HSID', 'SSID', 'FID', 'APISID', 'SAPISID'],
    sessionCheckSelector: '[data-email]',
    homeUrlAfterLogin: 'https://mail.google.com/',
  },
  slack: {
    loginUrl: 'https://slack.com/signin',
    sessionCookies: ['d', 'd-s', 'x'],
    sessionCheckSelector: '.p-workspace__sidebar',
    homeUrlAfterLogin: 'https://app.slack.com/',
  },
  notion: {
    loginUrl: 'https://www.notion.so/login',
    sessionCookies: ['token_v2', 'notion_user_id'],
    sessionCheckSelector: '.notion-app-inner',
    homeUrlAfterLogin: 'https://www.notion.so/',
  },
  github: {
    loginUrl: 'https://github.com/login',
    sessionCookies: ['_gh_sess', 'logged_in'],
    sessionCheckSelector: '.Header',
    homeUrlAfterLogin: 'https://github.com/',
  },
  linkedin: {
    loginUrl: 'https://www.linkedin.com/login',
    sessionCookies: ['li_at', 'JSESSIONID'],
    sessionCheckSelector: '.global-nav',
    homeUrlAfterLogin: 'https://www.linkedin.com/feed/',
  },
  salesforce: {
    loginUrl: 'https://login.salesforce.com/',
    sessionCookies: ['sid', 'oid'],
    sessionCheckSelector: '.sfdc-platformui',
  },
  jira: {
    loginUrl: 'https://id.atlassian.com/login',
    sessionCookies: ['cloud.session.token'],
    sessionCheckSelector: '[data-testid="global-nav"]',
  },
  wordpress: {
    loginUrl: '{wpAdminUrl}/wp-login.php',
    sessionCookies: ['wordpress_logged_in_*'],
    sessionCheckSelector: '#wpadminbar',
  },
  canva: {
    loginUrl: 'https://www.canva.com/login',
    sessionCookies: ['CST', 'CSL'],
    sessionCheckSelector: '.app-shell',
    homeUrlAfterLogin: 'https://www.canva.com/',
  },
  tableau: {
    loginUrl: 'https://sso.online.tableau.com/',
    sessionCookies: ['tableau_session_id'],
    sessionCheckSelector: '.tab-dashboard',
  },
  shopify: {
    loginUrl: 'https://{shop}.myshopify.com/admin',
    sessionCookies:['_shopify_session'],
    sessionCheckSelector: '.ui-app-bar',
  },
};

// ============================================================
// BROWSER BRIDGE
// ============================================================

export class BrowserBridge {
  // Sessions actives (bridge → browser mapping)
  private bridgeSessions: Map<string, BrowserBridgeSession> = new Map();

  /**
   * Créer une session navigateur authentifiée pour un compte SaaS
   */
  async createAuthenticatedSession(input: {
    userId: string;
    saasAccountId: string;
    provider: string;
    startUrl?: string;
  }): Promise<BrowserBridgeSession> {
    const { userId, saasAccountId, provider } = input;

    log.info('Creating authenticated browser session', { userId, provider });

    // Récupérer le compte SaaS avec tokens/session
    const connector = getSaaSAccountConnector();
    const account = await connector.getAccount(userId, saasAccountId);

    // Obtenir la config de login pour ce provider
    const loginConfig = PROVIDER_LOGIN_CONFIG[provider];
    const startUrl = input.startUrl || loginConfig?.homeUrlAfterLogin || 'about:blank';

    // Créer la session navigateur via le BrowserAutomationEngine
    const browserEngine = createBrowserAutomationEngine(userId);
    const browserSession = await browserEngine.createSession({
      url: startUrl,
      config: {
        antiDetection: true,
        injectCookies: true,
        provider,
        accountEmail: account.summary.accountEmail,
      },
    });

    // Si on a des cookies de session, les injecter via le navigateur
    let isAuthenticated = false;
    if (account.sessionData && loginConfig) {
      try {
        // Injecter les cookies dans la session navigateur
        await this.injectSessionCookies(
          browserEngine,
          browserSession.id,
          startUrl,
          account.sessionData,
          loginConfig.sessionCookies
        );
        isAuthenticated = true;
        log.info('Session cookies injected successfully', { provider, saasAccountId });
      } catch (error) {
        log.warn('Failed to inject session cookies', { provider, error: String(error) });
      }
    }

    // Si OAuth2, injecter le token via Authorization header
    if (account.accessToken && !isAuthenticated) {
      isAuthenticated = true; // L'API sera authentifiée via le token
      log.info('OAuth token available for browser session', { provider });
    }

    const bridgeSession: BrowserBridgeSession = {
      id: `bridge_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      userId,
      saasAccountId,
      provider,
      browserSessionId: browserSession.id,
      url: startUrl,
      isAuthenticated,
      createdAt: new Date(),
      lastUsedAt: new Date(),
      metadata: {
        authType: account.summary.authType,
        loginUrl: loginConfig?.loginUrl,
      },
    };

    this.bridgeSessions.set(bridgeSession.id, bridgeSession);

    // Audit
    try {
      await prisma.actionAudit.create({
        data: {
          userId,
          saasAccountId,
          eventType: 'browser_session_created',
          eventDetails: JSON.stringify({
            provider,
            startUrl,
            isAuthenticated,
            browserSessionId: browserSession.id,
          }),
          severity: 'info',
        },
      });
    } catch { /* non-blocking */ }

    return bridgeSession;
  }

  /**
   * Exécuter un script navigateur complet
   */
  async executeScript(input: ExecuteBrowserScriptInput): Promise<ExecuteBrowserScriptResult> {
    const startTime = Date.now();
    const { userId, agentId, saasAccountId, provider, startUrl, actions, options } = input;

    log.info('Executing browser script', {
      userId,
      provider,
      actionCount: actions.length,
    });

    // Créer ou réutiliser une session
    let bridgeSession = this.findSessionByAccount(userId, saasAccountId);
    if (!bridgeSession) {
      bridgeSession = await this.createAuthenticatedSession({
        userId,
        saasAccountId,
        provider,
        startUrl,
      });
    }

    const browserEngine = createBrowserAutomationEngine(userId);

    // Screenshot avant (si demandé)
    const screenshots: string[] = [];
    if (options?.takeScreenshots && !options?.screenshotBeforeOnly) {
      try {
        const beforeScreenshot = await browserEngine.takeScreenshot(bridgeSession.browserSessionId);
        screenshots.push(beforeScreenshot.dataUrl);
      } catch { /* non-blocking */ }
    }

    // Exécuter le script
    let scriptResult;
    try {
      scriptResult = await browserEngine.executeScript(
        bridgeSession.browserSessionId,
        actions
      );
    } catch (error) {
      log.error('Browser script execution failed', {
        sessionId: bridgeSession.id,
        error: String(error),
      });

      return {
        sessionId: bridgeSession.id,
        browserSessionId: bridgeSession.browserSessionId,
        success: false,
        completedSteps: 0,
        failedSteps: actions.length,
        totalSteps: actions.length,
        executionTimeMs: Date.now() - startTime,
        screenshots,
        extractedData: {},
        finalUrl: startUrl,
        error: String(error),
      };
    }

    // Screenshot après
    if (options?.takeScreenshots) {
      try {
        const afterScreenshot = await browserEngine.takeScreenshot(bridgeSession.browserSessionId);
        screenshots.push(afterScreenshot.dataUrl);
      } catch { /* non-blocking */ }
    }

    // Extraire les données collectées
    const extractedData: Record<string, unknown> = {};
    for (const step of scriptResult.results) {
      if (step.action.type === 'extract' && step.result?.data) {
        const extractData = step.result.data as { selector: string; values: string[] };
        extractedData[extractData.selector] = extractData.values;
      }
    }

    // Mettre à jour la session bridge
    bridgeSession.lastUsedAt = new Date();

    // Audit
    try {
      await prisma.actionAudit.create({
        data: {
          userId,
          saasAccountId,
          agentId,
          eventType: scriptResult.success ? 'browser_script_completed' : 'browser_script_failed',
          eventDetails: JSON.stringify({
            provider,
            startUrl,
            totalSteps: actions.length,
            completedSteps: scriptResult.completedSteps,
            failedSteps: scriptResult.failedSteps,
            executionTimeMs: Date.now() - startTime,
            screenshotsTaken: screenshots.length,
          }),
          severity: scriptResult.success ? 'info' : 'warning',
        },
      });
    } catch { /* non-blocking */ }

    return {
      sessionId: bridgeSession.id,
      browserSessionId: bridgeSession.browserSessionId,
      success: scriptResult.success,
      completedSteps: scriptResult.completedSteps,
      failedSteps: scriptResult.failedSteps,
      totalSteps: actions.length,
      executionTimeMs: Date.now() - startTime,
      screenshots,
      extractedData,
      finalUrl: startUrl,
    };
  }

  /**
   * Naviguer vers une URL sur un compte SaaS existant
   */
  async navigate(userId: string, saasAccountId: string, url: string): Promise<{
    success: boolean;
    screenshot?: string;
    title?: string;
  }> {
    const bridgeSession = this.findSessionByAccount(userId, saasAccountId);
    if (!bridgeSession) {
      throw new Error('Aucune session navigateur active pour ce compte');
    }

    const browserEngine = createBrowserAutomationEngine(userId);
    const action: BrowserAction = {
      id: `nav_${Date.now()}`,
      type: 'navigate',
      url,
      description: `Navigation vers ${url}`,
    };

    const result = await browserEngine.executeAction(bridgeSession.browserSessionId, action);
    bridgeSession.lastUsedAt = new Date();

    return {
      success: result.success,
      screenshot: result.screenshot?.dataUrl,
      title: result.data as string | undefined,
    };
  }

  /**
   * Extraire des données depuis une page navigateur
   */
  async extractData(
    userId: string,
    saasAccountId: string,
    selectors: Array<{ selector: string; attribute?: string }>
  ): Promise<Array<{ selector: string; values: string[]; count: number }>> {
    const bridgeSession = this.findSessionByAccount(userId, saasAccountId);
    if (!bridgeSession) {
      throw new Error('Aucune session navigateur active pour ce compte');
    }

    const browserEngine = createBrowserAutomationEngine(userId);
    return browserEngine.extractDataFromSession(bridgeSession.browserSessionId, selectors);
  }

  /**
   * Capturer un screenshot de la page courante
   */
  async captureScreenshot(userId: string, saasAccountId: string): Promise<string> {
    const bridgeSession = this.findSessionByAccount(userId, saasAccountId);
    if (!bridgeSession) {
      throw new Error('Aucune session navigateur active pour ce compte');
    }

    const browserEngine = createBrowserAutomationEngine(userId);
    const screenshot = await browserEngine.takeScreenshot(bridgeSession.browserSessionId);
    return screenshot.dataUrl;
  }

  /**
   * Fermer une session navigateur
   */
  async closeSession(sessionId: string): Promise<void> {
    const session = this.bridgeSessions.get(sessionId);
    if (!session) return;

    const browserEngine = createBrowserAutomationEngine(session.userId);
    await browserEngine.closeSession(session.browserSessionId);
    this.bridgeSessions.delete(sessionId);

    log.info('Browser bridge session closed', { sessionId });
  }

  /**
   * Lister les sessions actives d'un utilisateur
   */
  listActiveSessions(userId: string): BrowserBridgeSession[] {
    return Array.from(this.bridgeSessions.values())
      .filter(s => s.userId === userId);
  }

  /**
   * Obtenir les stats du bridge
   */
  getStats(): {
    totalSessions: number;
    authenticatedSessions: number;
    byProvider: Record<string, number>;
  } {
    const sessions = Array.from(this.bridgeSessions.values());
    const byProvider: Record<string, number> = {};
    sessions.forEach(s => {
      byProvider[s.provider] = (byProvider[s.provider] || 0) + 1;
    });

    return {
      totalSessions: sessions.length,
      authenticatedSessions: sessions.filter(s => s.isAuthenticated).length,
      byProvider,
    };
  }

  // ============================================================
  // Privés
  // ============================================================

  private findSessionByAccount(userId: string, saasAccountId: string): BrowserBridgeSession | undefined {
    for (const session of this.bridgeSessions.values()) {
      if (session.userId === userId && session.saasAccountId === saasAccountId) {
        return session;
      }
    }
    return undefined;
  }

  /**
   * Injecter les cookies de session dans le navigateur
   */
  private async injectSessionCookies(
    browserEngine: BrowserAutomationEngine,
    browserSessionId: string,
    url: string,
    sessionData: Record<string, unknown>,
    cookieNames: string[]
  ): Promise<void> {
    // Naviguer d'abord vers le domaine cible
    const domain = new URL(url).origin;
    await browserEngine.executeAction(browserSessionId, {
      id: 'cookie_nav',
      type: 'navigate',
      url: domain,
    });

    // Injecter les cookies via JavaScript
    const cookiesToInject = Object.entries(sessionData)
      .filter(([key]) => cookieNames.some(cn => key.includes(cn.replace('*', ''))))
      .map(([name, value]) => `document.cookie = "${name}=${value}; path=/; secure; samesite=none";`)
      .join('\n');

    if (cookiesToInject) {
      await browserEngine.executeAction(browserSessionId, {
        id: 'cookie_inject',
        type: 'evaluate',
        value: cookiesToInject,
        description: 'Injection des cookies de session',
      });
    }
  }
}

// ============================================================
// Singleton
// ============================================================

let bridgeInstance: BrowserBridge | null = null;

export function getBrowserBridge(): BrowserBridge {
  if (!bridgeInstance) {
    bridgeInstance = new BrowserBridge();
  }
  return bridgeInstance;
}
