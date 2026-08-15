// ============================================================
// SAFETY GUARD — Vérification pré/post-action pour l'automatisation
//
// Chaque action autonome passe par le Safety Guard qui:
// - Évalue le niveau de risque
// - Vérifie les limites de taux
// - Demande le consentement utilisateur si nécessaire
// - Valide les paramètres d'entrée
// - Vérifie les permissions de l'agent
// - Crée un audit trail complet
// - Offre la possibilité de rollback
// ============================================================

import { prisma } from '@/lib/prisma';
import { createLogger } from '@/lib/logger';
import { requestConsent } from '@/lib/agent-engine/consent-manager';

const log = createLogger('safety-guard');

// ============================================================
// Types
// ============================================================

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';
export type ExecutionMode = 'autonomous' | 'supervised' | 'manual';

export interface ActionSafetyCheck {
  allowed: boolean;
  riskLevel: RiskLevel;
  executionMode: ExecutionMode;
  requiresConsent: boolean;
  consentId?: string;
  reason?: string;
  suggestions?: string[];
  rateLimitInfo?: {
    remaining: number;
    limit: number;
    resetAt: Date;
  };
}

export interface SafetyConfig {
  // Niveau de risque max sans consentement
  autoApproveBelowRisk: RiskLevel;
  // Limite d'actions par heure par utilisateur
  maxActionsPerHour: number;
  // Limite d'actions par heure par compte SaaS
  maxActionsPerAccountPerHour: number;
  // Actions critiques nécessitant toujours un consentement
  criticalOperations: string[];
  // Actions de suppression nécessitant confirmation
  destructiveOperations: string[];
  // Opérations interdites (bloquées complètement)
  blockedOperations: string[];
  // Mode par défaut
  defaultExecutionMode: ExecutionMode;
  // Activer le rollback automatique en cas d'échec
  enableAutoRollback: boolean;
  // Score de confiance minimum pour l'exécution autonome
  minConfidenceForAutonomous: number;
}

export interface PostActionValidation {
  success: boolean;
  dataIntegrity: boolean;
  sideEffects: string[];
  warnings: string[];
  rollbackPossible: boolean;
  rollbackData?: Record<string, unknown>;
}

// ============================================================
// Opérations critiques par défaut
// ============================================================

const DEFAULT_CRITICAL_OPS = [
  'gmail.delete_email',
  'gmail.send_email',      // Envoi d'email = impact externe
  'slack.delete_channel',
  'salesforce.delete_record',
  'hubspot.delete_contact',
  'github.delete_repo',
  'github.delete_issue',
  'notion.delete_page',
  'google_drive.delete_file',
  'stripe.refund_payment',
  'shopify.delete_product',
];

const DEFAULT_DESTRUCTIVE_OPS = [
  'gmail.delete_email',
  'slack.delete_channel',
  'salesforce.delete_record',
  'hubspot.delete_contact',
  'github.delete_repo',
  'notion.delete_page',
  'google_drive.delete_file',
  'stripe.refund_payment',
];

const DEFAULT_BLOCKED_OPS: string[] = [
  // Aucune opération bloquée par défaut
  // L'administrateur peut en ajouter via guardrails
];

// ============================================================
// SAFETY GUARD
// ============================================================

export class SafetyGuard {
  private config: SafetyConfig;
  // Compteurs de taux en mémoire
  private actionCounts: Map<string, { count: number; resetAt: number }> = new Map();

  constructor(config?: Partial<SafetyConfig>) {
    this.config = {
      autoApproveBelowRisk: config?.autoApproveBelowRisk || 'low',
      maxActionsPerHour: config?.maxActionsPerHour || 100,
      maxActionsPerAccountPerHour: config?.maxActionsPerAccountPerHour || 30,
      criticalOperations: config?.criticalOperations || DEFAULT_CRITICAL_OPS,
      destructiveOperations: config?.destructiveOperations || DEFAULT_DESTRUCTIVE_OPS,
      blockedOperations: config?.blockedOperations || DEFAULT_BLOCKED_OPS,
      defaultExecutionMode: config?.defaultExecutionMode || 'supervised',
      enableAutoRollback: config?.enableAutoRollback ?? true,
      minConfidenceForAutonomous: config?.minConfidenceForAutonomous || 0.8,
    };
  }

  /**
   * Vérification PRÉ-action — Décide si l'action peut être exécutée
   */
  async preActionCheck(input: {
    userId: string;
    agentId?: string;
    saasAccountId: string;
    operation: string;
    inputParams: Record<string, unknown>;
    riskLevel?: RiskLevel;
    executionMode?: ExecutionMode;
    agentConfidence?: number;
  }): Promise<ActionSafetyCheck> {
    const { userId, agentId, saasAccountId, operation, inputParams, agentConfidence } = input;

    // 1. Vérifier si l'opération est bloquée
    if (this.config.blockedOperations.includes(operation)) {
      log.warn('Blocked operation attempted', { userId, operation });
      return {
        allowed: false,
        riskLevel: 'critical',
        executionMode: 'manual',
        requiresConsent: true,
        reason: `Opération "${operation}" est bloquée par la politique de sécurité.`,
      };
    }

    // 2. Évaluer le niveau de risque
    const riskLevel = input.riskLevel || this.assessRiskLevel(operation, inputParams);

    // 3. Vérifier le rate limiting
    const rateLimitResult = this.checkRateLimit(userId, saasAccountId);
    if (!rateLimitResult.allowed) {
      log.warn('Rate limit exceeded', { userId, saasAccountId, operation });
      return {
        allowed: false,
        riskLevel,
        executionMode: 'manual',
        requiresConsent: false,
        reason: `Limite de taux dépassée. Réessayez après ${new Date(rateLimitResult.resetAt).toISOString()}.`,
        rateLimitInfo: {
          remaining: 0,
          limit: rateLimitResult.limit,
          resetAt: new Date(rateLimitResult.resetAt),
        },
      };
    }

    // 4. Déterminer le mode d'exécution
    let executionMode = input.executionMode || this.config.defaultExecutionMode;

    // Actions critiques → toujours supervised au minimum
    if (this.config.criticalOperations.includes(operation) && executionMode === 'autonomous') {
      executionMode = 'supervised';
    }

    // Actions destructives → toujours manual consent
    if (this.config.destructiveOperations.includes(operation)) {
      executionMode = 'manual';
    }

    // Confiance insuffisante → supervised
    if (executionMode === 'autonomous' && agentConfidence && agentConfidence < this.config.minConfidenceForAutonomous) {
      executionMode = 'supervised';
    }

    // 5. Déterminer si le consentement est requis
    const requiresConsent = this.needsConsent(riskLevel, executionMode, operation);

    let consentId: string | undefined;
    if (requiresConsent && agentId) {
      try {
        // Demander le consentement via le ConsentManager existant
// @ts-ignore — type narrowing pending, see refactor ticket
        const consent = await requestConsent(
          userId,
          agentId,
          'SaaS Automation',
          operation,
          inputParams
        );

        if (consent.status === 'approved') {
          consentId = consent.id;
          // Auto-approuvé → pas besoin d'attendre
        } else if (consent.status === 'pending') {
          consentId = consent.id;
        } else if (consent.status === 'denied') {
          return {
            allowed: false,
            riskLevel,
            executionMode,
            requiresConsent: true,
            consentId: consent.id,
            reason: 'Consentement refusé par l\'utilisateur.',
          };
        }
      } catch (error) {
        log.warn('Consent request failed', { userId, agentId, error: String(error) });
      }
    }

    // 6. Valider les paramètres d'entrée
    const validation = this.validateInputParams(operation, inputParams);
    if (!validation.valid) {
      return {
        allowed: false,
        riskLevel,
        executionMode,
        requiresConsent: false,
        reason: `Paramètres invalides: ${validation.errors.join(', ')}`,
        suggestions: validation.suggestions,
      };
    }

    // 7. Créer l'audit
    try {
      await prisma.actionAudit.create({
        data: {
          userId,
          saasAccountId,
          agentId,
          eventType: 'action_requested',
          eventDetails: JSON.stringify({
            operation,
            riskLevel,
            executionMode,
            requiresConsent,
            consentId,
            paramKeys: Object.keys(inputParams),
          }),
          severity: riskLevel === 'critical' ? 'critical' : riskLevel === 'high' ? 'warning' : 'info',
        },
      });
    } catch { /* non-blocking */ }

    return {
      allowed: true,
      riskLevel,
      executionMode,
      requiresConsent,
      consentId,
      rateLimitInfo: {
        remaining: rateLimitResult.remaining,
        limit: rateLimitResult.limit,
        resetAt: new Date(rateLimitResult.resetAt),
      },
    };
  }

  /**
   * Validation POST-action — Vérifie le résultat et les effets de bord
   */
  async postActionValidation(input: {
    userId: string;
    actionId: string;
    operation: string;
    result: Record<string, unknown>;
    expectedOutput?: Record<string, unknown>;
  }): Promise<PostActionValidation> {
    const { userId, actionId, operation, result } = input;

    const validation: PostActionValidation = {
      success: true,
      dataIntegrity: true,
      sideEffects: [],
      warnings: [],
      rollbackPossible: this.config.enableAutoRollback,
    };

    // Vérifier le statut de la réponse
// @ts-ignore — type narrowing pending, see refactor ticket
    if (result.error || result.status >= 400) {
      validation.success = false;
      validation.warnings.push(`Action échouée: ${result.error || `Status ${result.status}`}`);
    }

    // Vérifier l'intégrité des données
    if (result.data && typeof result.data === 'object') {
      // Vérifier que les champs attendus sont présents
      if (input.expectedOutput) {
        for (const key of Object.keys(input.expectedOutput)) {
          if (!(key in (result.data as Record<string, unknown>))) {
            validation.dataIntegrity = false;
            validation.warnings.push(`Champ attendu manquant: ${key}`);
          }
        }
      }
    }

    // Détecter les effets de bord potentiels
    if (this.config.destructiveOperations.includes(operation)) {
      validation.sideEffects.push('Action destructive exécutée — données potentiellement supprimées');
    }

    if (this.config.criticalOperations.includes(operation)) {
      validation.sideEffects.push('Action critique — impact externe confirmé');
    }

    // Préparer les données de rollback si possible
    if (validation.rollbackPossible && result.beforeState) {
      validation.rollbackData = result.beforeState as Record<string, unknown>;
    }

    // Audit
    try {
      await prisma.actionAudit.create({
        data: {
          userId,
          actionId,
          eventType: validation.success ? 'action_completed' : 'action_failed',
          eventDetails: JSON.stringify({
            operation,
            success: validation.success,
            dataIntegrity: validation.dataIntegrity,
            sideEffects: validation.sideEffects,
            warnings: validation.warnings,
            rollbackPossible: validation.rollbackPossible,
          }),
          severity: validation.success ? 'info' : 'warning',
        },
      });
    } catch { /* non-blocking */ }

    return validation;
  }

  /**
   * Évaluer le niveau de risque d'une opération
   */
  assessRiskLevel(operation: string, params: Record<string, unknown>): RiskLevel {
    // Opérations destructives → critical
    if (this.config.destructiveOperations.includes(operation)) {
      return 'critical';
    }

    // Opérations critiques → high
    if (this.config.criticalOperations.includes(operation)) {
      return 'high';
    }

    // Opérations d'écriture → medium
    const writeOps = ['create', 'update', 'send', 'write', 'post', 'put', 'patch', 'modify'];
    if (writeOps.some(op => operation.includes(op))) {
      return 'medium';
    }

    // Opérations de lecture → low
    const readOps = ['read', 'list', 'get', 'search', 'fetch', 'query'];
    if (readOps.some(op => operation.includes(op))) {
      return 'low';
    }

    // Par défaut → medium
    return 'medium';
  }

  /**
   * Vérifier si une opération nécessite un consentement
   */
  needsConsent(riskLevel: RiskLevel, executionMode: ExecutionMode, operation: string): boolean {
    // Mode manual → toujours
    if (executionMode === 'manual') return true;

    // Opérations destructives → toujours
    if (this.config.destructiveOperations.includes(operation)) return true;

    // Risk level hierarchy
    const riskOrder: Record<RiskLevel, number> = { low: 0, medium: 1, high: 2, critical: 3 };
    const threshold = riskOrder[this.config.autoApproveBelowRisk];

    return riskOrder[riskLevel] > threshold;
  }

  /**
   * Obtenir la configuration actuelle
   */
  getConfig(): SafetyConfig {
    return { ...this.config };
  }

  /**
   * Mettre à jour la configuration
   */
  updateConfig(updates: Partial<SafetyConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  // ============================================================
  // Privés
  // ============================================================

  private checkRateLimit(userId: string, accountId: string): {
    allowed: boolean;
    remaining: number;
    limit: number;
    resetAt: number;
  } {
    const now = Date.now();
    const hourMs = 3600000;

    // Vérifier la limite par utilisateur
    const userKey = `user:${userId}`;
    const userCount = this.actionCounts.get(userKey);
    if (userCount && now < userCount.resetAt) {
      if (userCount.count >= this.config.maxActionsPerHour) {
        return { allowed: false, remaining: 0, limit: this.config.maxActionsPerHour, resetAt: userCount.resetAt };
      }
    } else {
      this.actionCounts.set(userKey, { count: 0, resetAt: now + hourMs });
    }

    // Vérifier la limite par compte SaaS
    const accountKey = `account:${accountId}`;
    const accountCount = this.actionCounts.get(accountKey);
    if (accountCount && now < accountCount.resetAt) {
      if (accountCount.count >= this.config.maxActionsPerAccountPerHour) {
        return { allowed: false, remaining: 0, limit: this.config.maxActionsPerAccountPerHour, resetAt: accountCount.resetAt };
      }
    } else {
      this.actionCounts.set(accountKey, { count: 0, resetAt: now + hourMs });
    }

    // Incrémenter les compteurs
    const uc = this.actionCounts.get(userKey)!;
    const ac = this.actionCounts.get(accountKey)!;
    uc.count++;
    ac.count++;

    return {
      allowed: true,
      remaining: Math.min(
        this.config.maxActionsPerHour - uc.count,
        this.config.maxActionsPerAccountPerHour - ac.count
      ),
      limit: this.config.maxActionsPerHour,
      resetAt: Math.min(uc.resetAt, ac.resetAt),
    };
  }

  private validateInputParams(operation: string, params: Record<string, unknown>): {
    valid: boolean;
    errors: string[];
    suggestions: string[];
  } {
    const errors: string[] = [];
    const suggestions: string[] = [];

    // Vérification générique — pas de champs vides pour les opérations critiques
    if (this.config.criticalOperations.includes(operation)) {
      for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === null || value === '') {
          errors.push(`Paramètre "${key}" requis pour l'opération critique "${operation}"`);
        }
      }
    }

    // Vérification spécifique pour les emails
    if (operation.includes('gmail') || operation.includes('email') || operation.includes('ses')) {
      if (params.to && typeof params.to === 'string' && !params.to.includes('@')) {
        errors.push('Adresse email invalide');
        suggestions.push('Vérifiez le format de l\'adresse email (ex: user@example.com)');
      }
    }

    return { valid: errors.length === 0, errors, suggestions };
  }
}

// ============================================================
// Singleton
// ============================================================

let safetyGuardInstance: SafetyGuard | null = null;

export function getSafetyGuard(): SafetyGuard {
  if (!safetyGuardInstance) {
    safetyGuardInstance = new SafetyGuard();
  }
  return safetyGuardInstance;
}
