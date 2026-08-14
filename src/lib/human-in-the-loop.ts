import { prisma } from "./prisma";

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

const CRITICAL_ACTIONS = [
  "send_email", "execute_payment", "delete_account",
  "modify_permissions", "access_admin", "deploy_code",
  "modify_database", "send_webhook", "external_api_call", "publish_content",
];

class HumanInTheLoop {
  requiresApproval(action: string, severity: ActionSeverity): boolean {
    if (severity === "critical" || severity === "high") return true;
    return CRITICAL_ACTIONS.includes(action);
  }

  async requestApproval(params: {
    agentId: string; sessionId: string; userId: string;
    action: string; details: string; severity: ActionSeverity;
  }): Promise<ApprovalRequest> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 15 * 60 * 1000);

    const approval = await prisma.approvalRequest.create({
      data: {
        agentId: params.agentId,
        sessionId: params.sessionId,
        action: params.action,
        details: params.details,
        userId: params.userId,
        severity: params.severity,
        status: "pending",
        expiresAt,
      },
    });

    return {
      id: approval.id,
      agentId: approval.agentId,
      sessionId: approval.sessionId,
      userId: approval.userId,
      action: approval.action,
      details: approval.details,
      severity: approval.severity as ActionSeverity,
      status: approval.status as ApprovalStatus,
      expiresAt: approval.expiresAt,
      createdAt: approval.createdAt,
    };
  }

  async resolveApproval(params: {
    approvalId: string; userId: string; approved: boolean; comment?: string;
  }): Promise<ApprovalRequest | null> {
    const approval = await prisma.approvalRequest.findUnique({ where: { id: params.approvalId } });
    if (!approval || approval.status !== "pending") return null;

    const status: ApprovalStatus = params.approved ? "approved" : "rejected";

    const updated = await prisma.approvalRequest.update({
      where: { id: params.approvalId },
      data: { status, resolvedBy: params.userId, resolvedAt: new Date(), comment: params.comment },
    });

    return {
      id: updated.id, agentId: updated.agentId, sessionId: updated.sessionId,
      userId: updated.userId, action: updated.action, details: updated.details,
      severity: updated.severity as ActionSeverity, status: updated.status as ApprovalStatus,
      expiresAt: updated.expiresAt, createdAt: updated.createdAt,
      resolvedAt: updated.resolvedAt ?? undefined,
      resolvedBy: updated.resolvedBy ?? undefined,
      comment: updated.comment ?? undefined,
    };
  }

  async checkAction(params: {
    agentId: string; sessionId: string; userId: string;
    action: string; details: string; severity: ActionSeverity;
  }): Promise<{ allowed: boolean; approvalRequest?: ApprovalRequest; message: string }> {
    if (!this.requiresApproval(params.action, params.severity)) {
      return { allowed: true, message: "Action autorisée sans validation" };
    }
    const existing = await prisma.approvalRequest.findFirst({
      where: { agentId: params.agentId, action: params.action, status: "pending" },
    });
    if (existing) return { allowed: false, message: "Action en attente d'approbation humaine" };

    const req = await this.requestApproval(params);
    return { allowed: false, approvalRequest: req, message: `Action ${params.action} nécessite validation. Demande #${req.id}` };
  }

  async getPendingApprovals(userId: string): Promise<ApprovalRequest[]> {
    const requests = await prisma.approvalRequest.findMany({
      where: { userId, status: "pending" },
      orderBy: { createdAt: "desc" }, take: 50,
    });
    return requests.map((r) => ({
      id: r.id, agentId: r.agentId, sessionId: r.sessionId,
      userId: r.userId, action: r.action, details: r.details,
      severity: r.severity as ActionSeverity, status: r.status as ApprovalStatus,
      expiresAt: r.expiresAt, createdAt: r.createdAt,
    }));
  }
}

export const humanInTheLoop = new HumanInTheLoop();
