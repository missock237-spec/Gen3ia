// ============================================================
// HUMAN-IN-THE-LOOP — Validation humaine pour actions critiques
// ============================================================
// Pour les actions sensibles (paiement, email, suppression,
// modification de données), l'agent demande une validation
// humaine avant d'exécuter.
//
// Flux : Agent propose → Humain approuve/refuse → Agent exécute
// ============================================================

import { prisma } from "./prisma";
import { logger } from "./logger";

export type ApprovalStatus = "pending" | "approved" | "rejected" | "expired";
export type ActionSeverity = "low" | "medium" | "high" | "critical";

export interface ApprovalRequest {
  id: string;
  agentId: string;
  sessionId: string;
  userId: string;
  action: string;
  details: string;
  severity: ActionSeverity;
  status: ApprovalStatus;
  expiresAt: Date;
  createdAt: Date;
  resolvedAt?: Date;
  resolvedBy?: string;
  comment?: string;
}

// Actions qui nécessitent automatiquement une validation humaine
const CRITICAL_ACTIONS = [
  "send_email",
  "execute_payment",
  "delete_account",
  "modify_permissions",
  "access_admin",
  "deploy_code",
  "modify_database",
  "send_webhook",
  "external_api_call",
  "publish_content",
];

class HumanInTheLoop {
  /**
   * Vérifie si une action nécessite une validation humaine.
   */
  requiresApproval(action: string, severity: ActionSeverity): boolean {
    if (severity === "critical" || severity === "high") return true;
    return CRITICAL_ACTIONS.includes(action);
  }

  /**
   * Crée une demande d'approbation en base de données.
   */
  async requestApproval(params: {
    agentId: string;
    sessionId: string;
    userId: string;
    action: string;
    details: string;
    severity: ActionSeverity;
  }): Promise<ApprovalRequest> {
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    const approval = await prisma.approvalRequest.create({
      data: {
        agentId: params.agentId,
        action: params.action,
        details: params.details,
        userId: params.userId,
        status: "pending",
      },
    });

    logger.info("human_approval_requested", {
      approvalId: approval.id,
      agentId: params.agentId.slice(0, 8),
      action: params.action,
      severity: params.severity,
      expiresAt,
    });

    return {
      id: approval.id,
      agentId: params.agentId,
      sessionId: params.sessionId,
      userId: params.userId,
      action: params.action,
      details: params.details,
      severity: params.severity,
      status: "pending",
      expiresAt,
      createdAt: new Date(),
    };
  }

  /**
   * Approuve ou rejette une demande.
   */
  async resolveApproval(params: {
    approvalId: string;
    userId: string;
    approved: boolean;
    comment?: string;
  }): Promise<ApprovalRequest | null> {
    const approval = await prisma.approvalRequest.findUnique({
      where: { id: params.approvalId },
    });

    if (!approval) {
      logger.warn("human_approval_not_found", { approvalId: params.approvalId });
      return null;
    }

    if (approval.status !== "pending") {
      logger.warn("human_approval_already_resolved", {
        approvalId: params.approvalId,
        currentStatus: approval.status,
      });
      return null;
    }

    const status: ApprovalStatus = params.approved ? "approved" : "rejected";

    await prisma.approvalRequest.update({
      where: { id: params.approvalId },
      data: {
        status,
        result: params.comment ?? (params.approved ? "Approuvé" : "Rejeté"),
      },
    });

    logger.info("human_approval_resolved", {
      approvalId: params.approvalId,
      status,
      comment: params.comment?.slice(0, 50),
      resolvedBy: params.userId.slice(0, 8),
    });

    return {
      id: approval.id,
      agentId: approval.agentId,
      sessionId: approval.agentId,
      userId: approval.userId,
      action: approval.action,
      details: approval.details,
      severity: "medium",
      status,
      expiresAt: new Date(),
      createdAt: approval.createdAt,
      resolvedAt: new Date(),
      resolvedBy: params.userId,
      comment: params.comment,
    };
  }

  /**
   * Vérifie si une action peut être exécutée.
   * Si validation humaine nécessaire et pas encore donnée, retourne false.
   */
  async checkAction(params: {
    agentId: string;
    sessionId: string;
    userId: string;
    action: string;
    details: string;
    severity: ActionSeverity;
  }): Promise<{ allowed: boolean; approvalRequest?: ApprovalRequest; message: string }> {
    // Si l'action ne nécessite pas d'approbation
    if (!this.requiresApproval(params.action, params.severity)) {
      return { allowed: true, message: "Action autorisée sans validation" };
    }

    // Vérifier si une demande est déjà en cours
    const existingRequest = await prisma.approvalRequest.findFirst({
      where: {
        agentId: params.agentId,
        action: params.action,
        status: "pending",
      },
    });

    if (existingRequest) {
      return {
        allowed: false,
        message: "Action en attente d'approbation humaine",
      };
    }

    // Créer une nouvelle demande
    const approvalRequest = await this.requestApproval(params);

    return {
      allowed: false,
      approvalRequest,
      message: `Action ${params.action} nécessite validation humaine. Demande #${approvalRequest.id} créée.`,
    };
  }

  /**
   * Liste les approbations en attente pour un utilisateur.
   */
  async getPendingApprovals(userId: string): Promise<ApprovalRequest[]> {
    const requests = await prisma.approvalRequest.findMany({
      where: { userId, status: "pending" },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return requests.map((r) => ({
      id: r.id,
      agentId: r.agentId,
      sessionId: r.agentId,
      userId: r.userId,
      action: r.action,
      details: r.details,
      severity: "medium" as ActionSeverity,
      status: r.status as ApprovalStatus,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      createdAt: r.createdAt,
    }));
  }
}

export const humanInTheLoop = new HumanInTheLoop();
export default humanInTheLoop;