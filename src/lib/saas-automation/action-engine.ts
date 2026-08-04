// ============================================================
// AUTONOMOUS ACTION ENGINE — Moteur d'exécution d'actions autonomes
//
// Le cœur du système d'automatisation. Permet aux agents IA de:
// - Exécuter des actions sur les comptes SaaS liés
// - Utiliser les templates d'actions pré-construits
// - Combiner des actions en workflows composés
// - Gérer le cycle de vie complet (consent → execute → validate → audit)
// - Revenir en arrière (rollback) en cas d'échec
// - Planifier des actions différées
// ============================================================

import { prisma } from '@/lib/prisma';
import { createLogger } from '@/lib/logger';
import { getSaaSAccountConnector, type SaaSAccountSummary } from './account-connector';
import { getSaaSSessionManager } from './session-manager';
import { getSafetyGuard, type RiskLevel, type ExecutionMode } from './safety-guard';
import { getActionTemplateManager, type ActionTemplateDefinition } from './action-templates';
import { requestConsent } from '@/lib/agent-engine/consent-manager';

const log = createLogger('autonomous-action-engine');

// ============================================================
// Types
// ============================================================

export interface ExecuteActionInput {
  userId: string;
  agentId?: string;
  saasAccountId: string;
  operation: string;
  inputParams: Record<string, unknown>;
  options?: {
    templateId?: string;
    riskLevel?: RiskLevel;
    executionMode?: ExecutionMode;
    timeoutMs?: number;
    maxRetries?: number;
    agentConfidence?: number;
    screenshotBefore?: boolean;
    screenshotAfter?: boolean;
  };
}

export interface ExecuteActionResult {
  actionId: string;
  status: 'completed' | 'failed' | 'consent_required' | 'cancelled';
  operation: string;
  provider: string;
  riskLevel: RiskLevel;
  executionMode: ExecutionMode;
  outputResult?: Record<string, unknown>;
  executionTimeMs?: number;
  retryCount: number;
  screenshots?: { before?: string; after?: string };
  audit: {
    consentRequested: boolean;
    consentId?: string;
    safetyCheckPassed: boolean;
    postValidationPassed?: boolean;
  };
  error?: string;
}

export interface ComposedActionInput {
  userId: string;
  agentId?: string;
  name: string;
  steps: ExecuteActionInput[];
  failureStrategy: 'abort' | 'skip' | 'continue';
}

// ============================================================
// AUTONOMOUS ACTION ENGINE
// ============================================================

export class AutonomousActionEngine {
  private connector = getSaaSAccountConnector();
  private sessionManager = getSaaSSessionManager();
  private safetyGuard = getSafetyGuard();
  private templateManager = getActionTemplateManager();

  /**
   * Exécuter une action autonome sur un compte SaaS
   *
   * Pipeline:
   * 1. Safety check (pre-action)
   * 2. Consent (si nécessaire)
   * 3. Résoudre le template (si applicable)
   * 4. Créer l'enregistrement d'action
   * 5. Exécuter via session (API ou navigateur)
   * 6. Post-validation
   * 7. Audit
   */
  async executeAction(input: ExecuteActionInput): Promise<ExecuteActionResult> {
    const startTime = Date.now();

    log.info('Action execution requested', {
      userId: input.userId,
      operation: input.operation,
      agentId: input.agentId,
    });

    // 1. Récupérer le compte SaaS
    let account: SaaSAccountSummary;
    try {
      const fullAccount = await this.connector.getAccount(input.userId, input.saasAccountId);
      account = fullAccount.summary;
    } catch (error) {
      return {
        actionId: '',
        status: 'failed',
        operation: input.operation,
        provider: 'unknown',
        riskLevel: 'critical',
        executionMode: 'manual',
        retryCount: 0,
        audit: { consentRequested: false, safetyCheckPassed: false },
        error: `Compte SaaS non trouvé: ${String(error)}`,
      };
    }

    // 2. Pre-action safety check
    const safetyCheck = await this.safetyGuard.preActionCheck({
      userId: input.userId,
      agentId: input.agentId,
      saasAccountId: input.saasAccountId,
      operation: input.operation,
      inputParams: input.inputParams,
      riskLevel: input.options?.riskLevel,
      executionMode: input.options?.executionMode,
      agentConfidence: input.options?.agentConfidence,
    });

    if (!safetyCheck.allowed) {
      log.warn('Action blocked by safety guard', { operation: input.operation, reason: safetyCheck.reason });
      return {
        actionId: '',
        status: 'cancelled',
        operation: input.operation,
        provider: account.provider,
        riskLevel: safetyCheck.riskLevel,
        executionMode: safetyCheck.executionMode,
        retryCount: 0,
        audit: {
          consentRequested: safetyCheck.requiresConsent,
          consentId: safetyCheck.consentId,
          safetyCheckPassed: false,
        },
        error: safetyCheck.reason,
      };
    }

    // 3. Consentement requis mais en attente
    if (safetyCheck.requiresConsent && safetyCheck.consentId && input.agentId) {
      const consent = await requestConsent(
        input.userId,
        input.agentId,
        'SaaS Automation',
        input.operation,
        input.inputParams
      );

      if (consent.status === 'pending') {
        // Créer l'action en statut consent_requested
        const action = await prisma.autonomousAction.create({
          data: {
            userId: input.userId,
            agentId: input.agentId,
            saasAccountId: input.saasAccountId,
            templateId: input.options?.templateId,
            actionType: this.resolveActionType(input.operation),
            operation: input.operation,
            inputParams: JSON.stringify(input.inputParams),
            status: 'consent_requested',
            consentId: consent.id,
            riskLevel: safetyCheck.riskLevel,
            executionMode: safetyCheck.executionMode,
            maxRetries: input.options?.maxRetries || 3,
            timeoutMs: input.options?.timeoutMs || 30000,
          },
        });

        return {
          actionId: action.id,
          status: 'consent_required',
          operation: input.operation,
          provider: account.provider,
          riskLevel: safetyCheck.riskLevel,
          executionMode: safetyCheck.executionMode,
          retryCount: 0,
          audit: {
            consentRequested: true,
            consentId: consent.id,
            safetyCheckPassed: true,
          },
        };
      }

      if (consent.status === 'denied') {
        return {
          actionId: '',
          status: 'cancelled',
          operation: input.operation,
          provider: account.provider,
          riskLevel: safetyCheck.riskLevel,
          executionMode: safetyCheck.executionMode,
          retryCount: 0,
          audit: { consentRequested: true, consentId: consent.id, safetyCheckPassed: true },
          error: 'Consentement refusé par l\'utilisateur',
        };
      }
    }

    // 4. Créer l'enregistrement d'action
    const action = await prisma.autonomousAction.create({
      data: {
        userId: input.userId,
        agentId: input.agentId,
        saasAccountId: input.saasAccountId,
        templateId: input.options?.templateId,
        actionType: this.resolveActionType(input.operation),
        operation: input.operation,
        inputParams: JSON.stringify(input.inputParams),
        status: 'approved',
        consentId: safetyCheck.consentId,
        riskLevel: safetyCheck.riskLevel,
        executionMode: safetyCheck.executionMode,
        maxRetries: input.options?.maxRetries || 3,
        timeoutMs: input.options?.timeoutMs || 30000,
      },
    });

    // 5. Exécuter l'action
    let result: ExecuteActionResult;
    try {
      await prisma.autonomousAction.update({
        where: { id: action.id },
        data: { status: 'executing', startedAt: new Date() },
      });

      const executionResult = await this.executeViaSession(input, account);

      const executionTimeMs = Date.now() - startTime;

      // 6. Post-validation
      const postValidation = await this.safetyGuard.postActionValidation({
        userId: input.userId,
        actionId: action.id,
        operation: input.operation,
        result: executionResult,
      });

      // 7. Mettre à jour l'action
      await prisma.autonomousAction.update({
        where: { id: action.id },
        data: {
          status: 'completed',
          outputResult: JSON.stringify(executionResult),
          executionTimeMs,
          completedAt: new Date(),
          screenshotAfter: input.options?.screenshotAfter ? 'captured' : null,
        },
      });

      // Incrémenter le compteur d'utilisation du template
      if (input.options?.templateId) {
        await prisma.actionTemplate.update({
          where: { id: input.options.templateId },
          data: { usageCount: { increment: 1 } },
        }).catch(() => {});
      }

      result = {
        actionId: action.id,
        status: 'completed',
        operation: input.operation,
        provider: account.provider,
        riskLevel: safetyCheck.riskLevel,
        executionMode: safetyCheck.executionMode,
        outputResult: executionResult,
        executionTimeMs,
        retryCount: 0,
        audit: {
          consentRequested: safetyCheck.requiresConsent,
          consentId: safetyCheck.consentId,
          safetyCheckPassed: true,
          postValidationPassed: postValidation.success && postValidation.dataIntegrity,
        },
      };
    } catch (error) {
      const executionTimeMs = Date.now() - startTime;
      const errorMsg = String(error);

      log.error('Action execution failed', { actionId: action.id, operation: input.operation, error: errorMsg });

      // Retry logic
      const currentRetry = await prisma.autonomousAction.findUnique({ where: { id: action.id } });
      const retryCount = (currentRetry?.retryCount || 0) + 1;
      const maxRetries = action.maxRetries;

      if (retryCount < maxRetries) {
        await prisma.autonomousAction.update({
          where: { id: action.id },
          data: { retryCount, status: 'pending', errorMessage: errorMsg },
        });

        // Retry
        return this.executeAction({
          ...input,
          options: { ...input.options, maxRetries: maxRetries - retryCount },
        });
      }

      // Échec définitif
      await prisma.autonomousAction.update({
        where: { id: action.id },
        data: {
          status: 'failed',
          errorMessage: errorMsg,
          executionTimeMs,
          retryCount,
          completedAt: new Date(),
        },
      });

      result = {
        actionId: action.id,
        status: 'failed',
        operation: input.operation,
        provider: account.provider,
        riskLevel: safetyCheck.riskLevel,
        executionMode: safetyCheck.executionMode,
        executionTimeMs,
        retryCount,
        audit: { consentRequested: safetyCheck.requiresConsent, consentId: safetyCheck.consentId, safetyCheckPassed: true },
        error: errorMsg,
      };
    }

    return result;
  }

  /**
   * Exécuter une séquence d'actions composées
   */
  async executeComposedAction(input: ComposedActionInput): Promise<{
    results: ExecuteActionResult[];
    overallStatus: 'completed' | 'partial' | 'failed';
    completedSteps: number;
    failedSteps: number;
  }> {
    const results: ExecuteActionResult[] = [];
    let completedSteps = 0;
    let failedSteps = 0;

    for (const step of input.steps) {
      try {
        const result = await this.executeAction(step);
        results.push(result);

        if (result.status === 'completed') {
          completedSteps++;
        } else {
          failedSteps++;
          if (input.failureStrategy === 'abort') break;
        }
      } catch (error) {
        failedSteps++;
        if (input.failureStrategy === 'abort') break;
      }
    }

    const overallStatus = failedSteps === 0
      ? 'completed'
      : completedSteps === 0
        ? 'failed'
        : 'partial';

    return { results, overallStatus, completedSteps, failedSteps };
  }

  /**
   * Approuver une action en attente de consentement
   */
  async approveAction(actionId: string, userId: string): Promise<ExecuteActionResult> {
    const action = await prisma.autonomousAction.findFirst({
      where: { id: actionId, userId, status: 'consent_requested' },
    });

    if (!action) {
      throw new Error('Action non trouvée ou pas en attente de consentement');
    }

    await prisma.autonomousAction.update({
      where: { id: actionId },
      data: { status: 'approved' },
    });

    // Ré-exécuter l'action
    return this.executeAction({
      userId,
      agentId: action.agentId || undefined,
      saasAccountId: action.saasAccountId,
      operation: action.operation,
      inputParams: JSON.parse(action.inputParams),
      options: {
        templateId: action.templateId || undefined,
        riskLevel: action.riskLevel as RiskLevel,
        executionMode: action.executionMode as ExecutionMode,
        timeoutMs: action.timeoutMs,
        maxRetries: action.maxRetries - action.retryCount,
      },
    });
  }

  /**
   * Annuler une action
   */
  async cancelAction(actionId: string, userId: string): Promise<void> {
    await prisma.autonomousAction.updateMany({
      where: { id: actionId, userId, status: { in: ['pending', 'consent_requested', 'approved'] } },
      data: { status: 'cancelled', completedAt: new Date() },
    });
  }

  /**
   * Obtenir l'historique des actions d'un utilisateur
   */
  async getActionHistory(userId: string, filters?: {
    status?: string;
    provider?: string;
    agentId?: string;
    limit?: number;
    offset?: number;
  }): Promise<{
    actions: Array<{
      id: string;
      operation: string;
      provider: string;
      status: string;
      riskLevel: string;
      executionTimeMs: number | null;
      createdAt: Date;
      completedAt: Date | null;
      errorMessage: string | null;
    }>;
    total: number;
  }> {
    const where: Record<string, unknown> = { userId };
    if (filters?.status) where.status = filters.status;
    if (filters?.agentId) where.agentId = filters.agentId;

    const [actions, total] = await Promise.all([
      prisma.autonomousAction.findMany({
        where,
        include: { saasAccount: { select: { provider: true } } },
        orderBy: { createdAt: 'desc' },
        take: filters?.limit || 50,
        skip: filters?.offset || 0,
      }),
      prisma.autonomousAction.count({ where }),
    ]);

    return {
      actions: actions.map(a => ({
        id: a.id,
        operation: a.operation,
        provider: a.saasAccount.provider,
        status: a.status,
        riskLevel: a.riskLevel,
        executionTimeMs: a.executionTimeMs,
        createdAt: a.createdAt,
        completedAt: a.completedAt,
        errorMessage: a.errorMessage,
      })),
      total,
    };
  }

  /**
   * Obtenir les métriques d'automatisation
   */
  async getMetrics(userId: string): Promise<{
    totalActions: number;
    completedActions: number;
    failedActions: number;
    pendingActions: number;
    avgExecutionTimeMs: number;
    actionsByProvider: Record<string, number>;
    actionsByRiskLevel: Record<string, number>;
    successRate: string;
  }> {
    const actions = await prisma.autonomousAction.findMany({
      where: { userId },
    });

    const completed = actions.filter(a => a.status === 'completed');
    const failed = actions.filter(a => a.status === 'failed');
    const pending = actions.filter(a => ['pending', 'consent_requested', 'approved', 'executing'].includes(a.status));

    const byProvider: Record<string, number> = {};
    const byRisk: Record<string, number> = {};

    for (const action of actions) {
      const account = await prisma.saaSAccount.findUnique({
        where: { id: action.saasAccountId },
        select: { provider: true },
      });
      const provider = account?.provider || 'unknown';
      byProvider[provider] = (byProvider[provider] || 0) + 1;
      byRisk[action.riskLevel] = (byRisk[action.riskLevel] || 0) + 1;
    }

    const avgTime = completed.length > 0
      ? completed.reduce((sum, a) => sum + (a.executionTimeMs || 0), 0) / completed.length
      : 0;

    return {
      totalActions: actions.length,
      completedActions: completed.length,
      failedActions: failed.length,
      pendingActions: pending.length,
      avgExecutionTimeMs: Math.round(avgTime),
      actionsByProvider: byProvider,
      actionsByRiskLevel: byRisk,
      successRate: actions.length > 0
        ? ((completed.length / actions.length) * 100).toFixed(1) + '%'
        : '0%',
    };
  }

  // ============================================================
  // Privés
  // ============================================================

  private resolveActionType(operation: string): string {
    const template = this.templateManager.getTemplate(operation);
    if (template) return template.actionType;

    if (operation.includes('browser') || operation.includes('navigate')) {
      return 'browser_automation';
    }
    return 'api_call';
  }

  private async executeViaSession(
    input: ExecuteActionInput,
    account: SaaSAccountSummary
  ): Promise<Record<string, unknown>> {
    const template = this.templateManager.getTemplate(input.operation);

    // Si template avec étapes multiples, exécuter séquentiellement
    if (template && template.steps.length > 1) {
      return this.executeTemplateSteps(template, input, account);
    }

    // Sinon, exécuter directement via API
    const session = await this.sessionManager.getOrCreateSession({
      accountId: input.saasAccountId,
      userId: input.userId,
      provider: account.provider,
      type: account.authType === 'browser' ? 'browser' : 'api',
    });

    if (session.type === 'browser') {
      // Exécuter via navigateur
      const browserActions = this.buildBrowserActions(input.operation, input.inputParams, template);
      const result = await this.sessionManager.executeBrowserAction(session.id, browserActions);
      return { ...result, provider: account.provider, operation: input.operation };
    }

    // Exécuter via API
    const apiConfig = this.resolveApiConfig(input.operation, input.inputParams, template);
    const result = await this.sessionManager.executeApiCall(
      session.id,
      apiConfig.method,
      apiConfig.url,
      { body: apiConfig.body, params: apiConfig.params },
      { timeoutMs: input.options?.timeoutMs || 30000, retryOnExpired: true }
    );

    return { ...result.data, provider: account.provider, operation: input.operation, status: result.status };
  }

  private async executeTemplateSteps(
    template: ActionTemplateDefinition,
    input: ExecuteActionInput,
    account: SaaSAccountSummary
  ): Promise<Record<string, unknown>> {
    const results: Record<string, unknown>[] = [];
    let previousResult: Record<string, unknown> = input.inputParams;

    for (const step of template.steps) {
      try {
        if (step.type === 'transform') {
          // Étape de transformation (ex: résumé IA)
          const transformResult = await this.executeTransformStep(step, previousResult);
          results.push(transformResult);
          previousResult = transformResult;
        } else if (step.type === 'api_call') {
          // Étape API
          const apiConfig = this.resolveApiConfig(input.operation, previousResult, template);
          const session = await this.sessionManager.getOrCreateSession({
            accountId: input.saasAccountId,
            userId: input.userId,
            provider: account.provider,
            type: 'api',
          });

          const result = await this.sessionManager.executeApiCall(
            session.id,
            apiConfig.method,
            apiConfig.url,
            { body: apiConfig.body }
          );

          results.push(result.data as Record<string, unknown>);
          previousResult = result.data as Record<string, unknown>;
        } else if (step.type === 'condition') {
          // Étape conditionnelle
          const conditionMet = this.evaluateCondition(step.config, previousResult);
          if (!conditionMet) break;
        }
      } catch (error) {
        if (step.onError === 'abort') throw error;
        if (step.onError === 'skip') continue;
        if (step.onError === 'retry' && step.maxRetries) {
          // Retry logic would go here
          continue;
        }
      }
    }

    return { steps: results, finalResult: previousResult };
  }

  private async executeTransformStep(
    step: { config: Record<string, unknown> },
    input: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    // Placeholder pour les étapes de transformation IA
    // En production, ceci appellerait le HyperAgent ou le LLM directement
    return { transformed: true, input, config: step.config };
  }

  private evaluateCondition(
    config: Record<string, unknown>,
    data: Record<string, unknown>
  ): boolean {
    // Évaluation simple de condition
    const field = config.field as string;
    const operator = config.operator as string;
    const value = config.value;

    const dataValue = data[field];
    switch (operator) {
      case 'equals': return dataValue === value;
      case 'not_equals': return dataValue !== value;
      case 'contains': return String(dataValue).includes(String(value));
      case 'gt': return Number(dataValue) > Number(value);
      case 'lt': return Number(dataValue) < Number(value);
      default: return true;
    }
  }

  private resolveApiConfig(
    operation: string,
    params: Record<string, unknown>,
    template?: ActionTemplateDefinition
  ): { method: string; url: string; body?: Record<string, unknown>; params?: Record<string, string> } {
    if (template && template.steps.length > 0) {
      const step = template.steps[0];
      const config = step.config;
      return {
        method: (config.method as string) || 'GET',
        url: this.interpolateUrl((config.url as string) || '', params),
        body: params,
      };
    }

    // Fallback: construire à partir de l'opération
    return {
      method: this.inferMethod(operation),
      url: '',
      body: params,
    };
  }

  private buildBrowserActions(
    operation: string,
    params: Record<string, unknown>,
    template?: ActionTemplateDefinition
  ): Array<{ type: string; selector?: string; value?: string; url?: string; options?: Record<string, unknown> }> {
    // Construire les actions navigateur à partir du template
    if (template) {
      return template.steps
        .filter(s => s.type === 'browser_action')
        .map(s => ({
          type: (s.config.actionType as string) || 'navigate',
          selector: s.config.selector as string,
          value: s.config.value as string,
          url: s.config.url as string,
        }));
    }

    // Fallback
    return [{ type: 'navigate', url: params.url as string || '' }];
  }

  private interpolateUrl(url: string, params: Record<string, unknown>): string {
    return url.replace(/\{(\w+)\}/g, (match, key) => {
      return String(params[key] || match);
    });
  }

  private inferMethod(operation: string): string {
    if (operation.includes('create') || operation.includes('send') || operation.includes('post')) return 'POST';
    if (operation.includes('update') || operation.includes('patch')) return 'PATCH';
    if (operation.includes('delete') || operation.includes('remove')) return 'DELETE';
    return 'GET';
  }
}

// ============================================================
// Singleton
// ============================================================

let engineInstance: AutonomousActionEngine | null = null;

export function getAutonomousActionEngine(): AutonomousActionEngine {
  if (!engineInstance) {
    engineInstance = new AutonomousActionEngine();
  }
  return engineInstance;
}
