// ============================================================
// Gen3ia — User Feedback System
// ============================================================
//  Capte les retours utilisateurs depuis l'app (bug, feature
//  request, compliment, complaint). Permet de prioriser le
//  roadmap selon les besoins réels du terrain.
// ============================================================

import { db } from '@/lib/db';
import { createLogger } from '@/lib/logger';
import { sendDirectSms } from '@/lib/sms-engine';

const log = createLogger('feedback');

export type FeedbackType = 'bug' | 'feature_request' | 'compliment' | 'complaint' | 'question';
export type FeedbackPriority = 'low' | 'medium' | 'high' | 'critical';
export type FeedbackStatus = 'new' | 'reviewing' | 'in_progress' | 'resolved' | 'wontfix';

export interface FeedbackEntry {
  userId: string;
  type: FeedbackType;
  subject: string;
  description: string;
  page?: string;
  userAgent?: string;
  screenshots?: string[];
}

export interface FeedbackRecord extends FeedbackEntry {
  id: string;
  status: FeedbackStatus;
  priority: FeedbackPriority;
  createdAt: string;
  updatedAt: string;
  adminResponse?: string;
}

/**
 * Enregistre un feedback utilisateur.
 */
export async function createFeedback(entry: FeedbackEntry): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    // Auto-déterminer la priorité selon le type
    const priority: FeedbackPriority = entry.type === 'bug' ? 'high' : 'medium';

    const record = await db.feedback.create({
      data: {
        userId: entry.userId,
        type: entry.type,
        subject: entry.subject.slice(0, 200),
        description: entry.description.slice(0, 5000),
        page: entry.page || null,
        userAgent: entry.userAgent || null,
        screenshots: JSON.stringify(entry.screenshots || []),
        status: 'new',
        priority,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    const id = (record as Record<string, unknown>).id as string;
    log.info('Feedback created', { id, type: entry.type, userId: entry.userId });

    // Si c'est un bug critique, alerter l'admin par SMS
    if (entry.type === 'bug' && entry.description.toLowerCase().match(/crash|can.t login|payment|security|data loss|cannot|broken/)) {
      await sendDirectSms(
        process.env.ADMIN_PHONE || '+237600000000',
        `[Gen3ia] Bug rapporte: ${entry.subject.slice(0, 100)}. Check dashboard.`
      ).catch(() => {});
    }

    return { success: true, id };
  } catch (err) {
    log.error('Failed to create feedback', { error: String(err) });
    return { success: false, error: 'Impossible d\\'enregistrer le feedback' };
  }
}

/**
 * Récupère les feedbacks d'un utilisateur.
 */
export async function getUserFeedback(
  userId: string,
  options: { limit?: number; offset?: number } = {}
): Promise<FeedbackRecord[]> {
  const { limit = 20, offset = 0 } = options;

  try {
    const all = await db.feedback.findMany({ where: {} });
    return (all as Record<string, unknown>[])
      .filter(f => f.userId === userId)
      .sort((a, b) => new Date(b.createdAt as string).getTime() - new Date(a.createdAt as string).getTime())
      .slice(offset, offset + limit) as FeedbackRecord[];
  } catch {
    return [];
  }
}

/**
 * Récupère tous les feedbacks (admin).
 */
export async function getAllFeedback(
  options: { status?: FeedbackStatus; type?: FeedbackType; limit?: number } = {}
): Promise<FeedbackRecord[]> {
  const { status, type, limit = 50 } = options;

  try {
    const all = await db.feedback.findMany({ where: {} });
    let filtered = all as Record<string, unknown>[];

    if (status) filtered = filtered.filter(f => f.status === status);
    if (type) filtered = filtered.filter(f => f.type === type);

    return filtered
      .sort((a, b) => new Date(b.createdAt as string).getTime() - new Date(a.createdAt as string).getTime())
      .slice(0, limit) as FeedbackRecord[];
  } catch {
    return [];
  }
}

/**
 * Met à jour le statut d'un feedback (admin).
 */
export async function updateFeedbackStatus(
  feedbackId: string,
  status: FeedbackStatus,
  adminResponse?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await db.feedback.update({
      where: { id: feedbackId },
      data: {
        status,
        adminResponse: adminResponse || null,
        updatedAt: new Date(),
      },
    });
    log.info('Feedback updated', { id: feedbackId, status });
    return { success: true };
  } catch (err) {
    log.error('Failed to update feedback', { error: String(err) });
    return { success: false, error: 'Mise à jour échouée' };
  }
}

/**
 * Statistiques de feedback (pour dashboard admin).
 */
export async function getFeedbackStats(): Promise<{
  total: number;
  byType: Record<string, number>;
  byStatus: Record<string, number>;
  byPriority: Record<string, number>;
}> {
  try {
    const all = await db.feedback.findMany({ where: {} });
    const records = all as Record<string, unknown>[];

    const byType: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    const byPriority: Record<string, number> = {};

    for (const r of records) {
      const t = r.type as string;
      const s = r.status as string;
      const p = r.priority as string;
      byType[t] = (byType[t] || 0) + 1;
      byStatus[s] = (byStatus[s] || 0) + 1;
      byPriority[p] = (byPriority[p] || 0) + 1;
    }

    return { total: records.length, byType, byStatus, byPriority };
  } catch {
    return { total: 0, byType: {}, byStatus: {}, byPriority: {} };
  }
}
