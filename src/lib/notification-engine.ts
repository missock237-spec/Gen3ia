// ============================================================
// NOTIFICATION ENGINE — Centre de notifications unifie
// Notifications intra-applicatives pour tous les modules
// ============================================================
import { prisma } from './prisma';
import { createLogger } from './logger';

const log = createLogger('notification-engine');

export interface CreateNotificationInput {
  userId: string; type: string; title: string;
  message?: string; link?: string; icon?: string;
  severity?: string; metadata?: Record<string, any>;
}

export class NotificationEngine {
  async create(input: CreateNotificationInput) {
    return prisma.notification.create({
      data: {
        userId: input.userId, type: input.type, title: input.title,
        message: input.message || '', link: input.link || null,
        icon: input.icon || 'bell', severity: input.severity || 'info',
        metadata: JSON.stringify(input.metadata || {}),
      },
    });
  }

  async list(userId: string, options?: { unreadOnly?: boolean; limit?: number }) {
    const where: any = { userId };
    if (options?.unreadOnly) where.read = false;
    const [notifications, unreadCount] = await Promise.all([
      prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, take: options?.limit || 30 }),
      prisma.notification.count({ where: { userId, read: false } }),
    ]);
    return { notifications, unreadCount };
  }

  async markRead(notificationId: string, userId: string) {
    await prisma.notification.updateMany({ where: { id: notificationId, userId }, data: { read: true, readAt: new Date() } });
    return { success: true };
  }

  async markAllRead(userId: string) {
    await prisma.notification.updateMany({ where: { userId, read: false }, data: { read: true, readAt: new Date() } });
    return { success: true };
  }

  async getUnreadCount(userId: string): Promise<number> {
    return prisma.notification.count({ where: { userId, read: false } });
  }

  async delete(notificationId: string, userId: string) {
    await prisma.notification.deleteMany({ where: { id: notificationId, userId } });
    return { success: true };
  }
}

export const notificationEngine = new NotificationEngine();
export default notificationEngine;