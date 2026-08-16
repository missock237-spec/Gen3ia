// Consent Manager — les agents demandent la permission avant d'executer des actions

import { prisma } from '@/lib/prisma';

export interface ConsentRequest {
  id: string;
  userId: string;
  agentId: string;
  agentName: string;
  service: string;
  action: string;
  description: string;
  params: Record<string, unknown>;
  status: 'pending' | 'approved' | 'denied' | 'expired';
  createdAt: Date;
  expiresAt: Date;
  resolvedAt?: Date;
}

export async function requestConsent(
  userId: string,
  agentId: string,
  agentName: string,
  service: string,
  action: string,
  params: Record<string, unknown>
): Promise<ConsentRequest> {
  const agent = await prisma.agent.findUnique({ where: { id: agentId } });
  const autoApproved = agent?.config ? JSON.parse(agent.config).autoApprovedServices || [] : [];

  if (autoApproved.includes(service)) {
    return {
      id: 'auto_approved',
      userId,
      agentId,
      agentName,
      service,
      action,
      description: `Auto-approuve pour ${service}:${action}`,
      params,
      status: 'approved',
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 60 * 1000),
      resolvedAt: new Date(),
    };
  }

  const permission = await prisma.agentPermission.findFirst({
    where: { agentId, permission: `${service}:${action}`, granted: true },
  });

  if (permission) {
    return {
      id: 'permitted',
      userId,
      agentId,
      agentName,
      service,
      action,
      description: `Permission deja accordee pour ${service}:${action}`,
      params,
      status: 'approved',
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 60 * 1000),
      resolvedAt: new Date(),
    };
  }

  const record = await prisma.approvalRequest.create({
    data: {
      agentId,
      action: `${service}:${action}`,
      details: JSON.stringify({ service, action, params, agentName }),
      status: 'pending',
      userId,
    },
  });

  return {
    id: record.id,
    userId,
    agentId,
    agentName,
    service,
    action,
    description: `L'agent ${agentName} demande a executer ${action} sur ${service}`,
    params,
    status: 'pending',
    createdAt: record.createdAt,
    expiresAt: new Date(Date.now() + 5 * 60 * 1000),
  };
}

export async function approveConsent(requestId: string, userId: string): Promise<boolean> {
  const request = await prisma.approvalRequest.findUnique({ where: { id: requestId } });
  if (!request || request.userId !== userId || request.status !== 'pending') return false;

  await prisma.approvalRequest.update({
    where: { id: requestId },
    data: { status: 'approved', resolvedAt: new Date() },
  });

  const parts = request.action.split(':');
  if (parts.length === 2) {
    await prisma.agentPermission.create({
      data: {
        agentId: request.agentId,
        permission: request.action,
        granted: true,
        requiresApproval: false,
        userId,
      },
    });
  }

  return true;
}

export async function denyConsent(requestId: string, userId: string): Promise<boolean> {
  const request = await prisma.approvalRequest.findUnique({ where: { id: requestId } });
  if (!request || request.userId !== userId || request.status !== 'pending') return false;

  await prisma.approvalRequest.update({
    where: { id: requestId },
    data: { status: 'denied', resolvedAt: new Date() },
  });
  return true;
}

export async function getPendingConsents(userId: string): Promise<ConsentRequest[]> {
  const requests = await prisma.approvalRequest.findMany({
    where: { userId, status: 'pending' },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });

  return requests.map((r) => {
    const details = JSON.parse(r.details || '{}');
    return {
      id: r.id,
      userId: r.userId,
      agentId: r.agentId,
      agentName: details.agentName || 'Agent',
      service: details.service || '',
      action: details.action || r.action,
      description: details.description || r.action,
      params: details.params || {},
      status: r.status as ConsentRequest['status'],
      createdAt: r.createdAt,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      resolvedAt: r.resolvedAt || undefined,
    };
  });
}
