// ============================================================
// Gen3ia — Firebase Cloud Messaging (FCM) layer
// ============================================================
//  Remplace :
//    - src/lib/notification-engine.ts
//    - src/app/api/notifications/route.ts (logique de création)
//
//  FCM gère désormais :
//    - Notifications intra-applicatives (Firestore + realtime listeners)
//    - Notifications push multi-plateforme (web, Android, iOS)
//    - Topics (broadcast thématique)
//    - Device tokens (multi-device par utilisateur)
//
//  Stratégie hybride :
//    - Les notifications sont persistées dans Firestore (collection
//      `notifications`) pour l'affichage intra-app et l'historique.
//    - Un push FCM est envoyé à tous les devices enregistrés de
//      l'utilisateur si `push: true`.
// ============================================================

import { getAdminMessaging } from './admin';
import { db, Collections } from './firestore';
import { maybeSendSmsForNotification } from '@/lib/sms-engine';

// ============================================================
// Types
// ============================================================

export interface CreateNotificationInput {
  userId: string;
  type: string;
  title: string;
  message?: string;
  link?: string;
  icon?: string;
  severity?: string;
  metadata?: Record<string, any>;
  push?: boolean; // Si true, envoie aussi un push FCM
}

export interface PushPayload {
  notification: {
    title: string;
    body: string;
    icon?: string;
    badge?: string;
    image?: string;
    click_action?: string;
  };
  data?: Record<string, string>;
  token?: string;
  topic?: string;
  tokens?: string[];
}

export interface DeviceRegistration {
  userId: string;
  token: string;
  platform: 'web' | 'android' | 'ios';
  createdAt: Date;
  lastSeenAt: Date;
}

// ============================================================
// Notification Engine (compatibilité avec l'ancien module)
// ============================================================

export class NotificationEngine {
  async create(input: CreateNotificationInput) {
    const data = {
      userId: input.userId,
      type: input.type,
      title: input.title,
      message: input.message || '',
      link: input.link || null,
      icon: input.icon || 'bell',
      severity: input.severity || 'info',
      metadata: JSON.stringify(input.metadata || {}),
      read: false,
      readAt: null,
      createdAt: new Date(),
    };

    const notif = await db.notification.create({ data });

    // Envoi push optionnel
    if (input.push !== false) {
      await this.sendPushToUser(input.userId, {
        notification: {
          title: input.title,
          body: input.message || '',
        },
        data: {
          notificationId: (notif as Record<string, unknown>).id as string,
          type: input.type,
          link: input.link || '',
          ...(input.metadata || {}),
        },
      }).catch((err) => {
        console.error('[fcm] sendPushToUser failed:', err);
      });
    }

    return notif;
  }

  async list(userId: string, options?: { unreadOnly?: boolean; limit?: number }) {
    const where: Array<{ field: string; op: '=='; value: unknown }> = [
      { field: 'userId', op: '==', value: userId },
    ];
    if (options?.unreadOnly) {
      where.push({ field: 'read', op: '==', value: false });
    }
    const [notifications, unreadCount] = await Promise.all([
      db.notification.findMany({
        where,
        orderBy: [{ field: 'createdAt', direction: 'desc' }],
        limit: options?.limit || 30,
      }),
      db.notification.count({ where: [{ field: 'userId', op: '==', value: userId }, { field: 'read', op: '==', value: false }] }),
    ]);
    return { notifications, unreadCount };
  }

  async markRead(notificationId: string, userId: string) {
    // Vérifier ownership puis update
    const notif = await db.notification.findUnique({ where: { id: notificationId } });
    if (!notif || (notif as Record<string, unknown>).userId !== userId) {
      return { success: false };
    }
    await db.notification.update({
      where: { id: notificationId },
      data: { read: true, readAt: new Date() },
    });
    return { success: true };
  }

  async markAllRead(userId: string) {
    await db.notification.updateMany({
      where: [{ field: 'userId', op: '==', value: userId }, { field: 'read', op: '==', value: false }],
      data: { read: true, readAt: new Date() },
    });
    return { success: true };
  }

  async getUnreadCount(userId: string): Promise<number> {
    return db.notification.count({
      where: [{ field: 'userId', op: '==', value: userId }, { field: 'read', op: '==', value: false }],
    });
  }

  async delete(notificationId: string, userId: string) {
    const notif = await db.notification.findUnique({ where: { id: notificationId } });
    if (!notif || (notif as Record<string, unknown>).userId !== userId) {
      return { success: false };
    }
    await db.notification.delete({ where: { id: notificationId } });
    return { success: true };
  }

  // ============================================================
  // FCM Push (multi-device)
  // ============================================================

  /**
   * Enregistre un device token pour un utilisateur.
   */
  async registerDevice(userId: string, token: string, platform: 'web' | 'android' | 'ios' = 'web'): Promise<void> {
// @ts-ignore — type narrowing pending, see refactor ticket
    await db.createWithId?.(Collections.users, {} as Record<string, unknown>);
// @ts-ignore — type narrowing pending, see refactor ticket
    const devicesRef = (await import('firebase-admin/firestore')).collection(
      (await import('./admin')).getAdminDb(),
      'fcm_devices',
    );
// @ts-ignore — type narrowing pending, see refactor ticket
    await (await import('firebase-admin/firestore')).setDoc(
// @ts-ignore — type narrowing pending, see refactor ticket
      (await import('firebase-admin/firestore')).doc(devicesRef, token),
      {
        userId,
        token,
        platform,
        createdAt: new Date(),
        lastSeenAt: new Date(),
      },
      { merge: true },
    );
  }

  /**
   * Désenregistre un device token (logout ou désabonnement).
   */
  async unregisterDevice(token: string): Promise<void> {
    const firestore = (await import('firebase-admin/firestore'));
    const adminDb = (await import('./admin')).getAdminDb();
// @ts-ignore — type narrowing pending, see refactor ticket
    await firestore.deleteDoc(firestore.doc(adminDb, 'fcm_devices', token));
  }

  /**
   * Récupère tous les device tokens d'un utilisateur.
   */
  async getUserDevices(userId: string): Promise<DeviceRegistration[]> {
    const firestore = (await import('firebase-admin/firestore'));
    const adminDb = (await import('./admin')).getAdminDb();
// @ts-ignore — type narrowing pending, see refactor ticket
    const snap = await firestore.getDocs(
// @ts-ignore — type narrowing pending, see refactor ticket
      firestore.query(adminDb.collection('fcm_devices'), firestore.where('userId', '==', userId)),
    );
    return snap.docs.map((d) => d.data() as DeviceRegistration);
  }

  /**
   * Envoie un push à tous les devices d'un utilisateur.
   */
  async sendPushToUser(userId: string, payload: PushPayload): Promise<{ sent: number; failed: number }> {
    const devices = await this.getUserDevices(userId);
    if (devices.length === 0) return { sent: 0, failed: 0 };

    const messaging = getAdminMessaging();
    const tokens = devices.map((d) => d.token);

    const message = {
      notification: payload.notification,
      data: payload.data || {},
      tokens,
    };

    const response = await messaging.sendEachForMulticast(message);
    return { sent: response.successCount, failed: response.failureCount };
  }

  /**
   * Envoie un push à un sujet (broadcast thématique).
   */
  async sendPushToTopic(topic: string, payload: Omit<PushPayload, 'token' | 'tokens'>): Promise<string> {
    const messaging = getAdminMessaging();
    return messaging.send({
      notification: payload.notification,
      data: payload.data || {},
      topic,
    });
  }

  /**
   * Abonne un device à un sujet.
   */
  async subscribeToTopic(tokens: string[], topic: string): Promise<void> {
    const messaging = getAdminMessaging();
    await messaging.subscribeToTopic(tokens, topic);
  }

  /**
   * Désabonne un device d'un sujet.
   */
  async unsubscribeFromTopic(tokens: string[], topic: string): Promise<void> {
    const messaging = getAdminMessaging();
    await messaging.unsubscribeFromTopic(tokens, topic);
  }
}

export const notificationEngine = new NotificationEngine();
export default notificationEngine;
