// ============================================================
// Gen3ia — Data Export Engine
// ============================================================
//  Problème : Les utilisateurs ne peuvent pas exporter leurs
//  données (agents, conversations, crédits, historique).
//  C'est un problème de conformité RGPD/African Data Protection
//  et de portabilité.
//
//  Solution : Export complet des données utilisateur en JSON
//  ou CSV. Asynchrone pour les gros volumes.
// ============================================================

import { db } from '@/lib/db';
import { createLogger } from '@/lib/logger';

const log = createLogger('data-export');

export type ExportFormat = 'json' | 'csv';

export interface ExportRequest {
  userId: string;
  format: ExportFormat;
  collections: ExportCollection[];
}

export type ExportCollection =
  | 'agents'
  | 'conversations'
  | 'creditTransactions'
  | 'executions'
  | 'workflows'
  | 'apiKeys'
  | 'notifications'
  | 'profile';

export interface ExportResult {
  success: boolean;
  format: ExportFormat;
  data: string;
  filename: string;
  collections: string[];
  totalRecords: number;
  error?: string;
}

/**
 * Exporte les données d'un utilisateur.
 */
export async function exportUserData(request: ExportRequest): Promise<ExportResult> {
  const { userId, format, collections } = request;
  const timestamp = new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-');
  const filename = `gen3ia-export-${userId.slice(-8)}-${timestamp}.${format}`;

  log.info('Starting data export', { userId, format, collections });

  try {
    const data: Record<string, unknown> = {};

    // Récupérer les données de chaque collection
    for (const collection of collections) {
      switch (collection) {
        case 'agents': {
          const agents = await db.agent.findMany({ where: {} });
          data.agents = (agents as Record<string, unknown>[])
            .filter(a => a.userId === userId || a.createdBy === userId);
          break;
        }
        case 'conversations': {
          const convs = await db.conversation.findMany({ where: {} });
          data.conversations = (convs as Record<string, unknown>[])
            .filter(c => c.userId === userId);
          break;
        }
        case 'creditTransactions': {
          const txns = await db.creditTransaction.findMany({ where: {} });
          data.creditTransactions = (txns as Record<string, unknown>[])
            .filter(t => t.userId === userId);
          break;
        }
        case 'executions': {
          const execs = await db.execution.findMany({ where: {} });
          data.executions = (execs as Record<string, unknown>[])
            .filter(e => e.userId === userId);
          break;
        }
        case 'workflows': {
          const wfs = await db.workflow.findMany({ where: {} });
          data.workflows = (wfs as Record<string, unknown>[])
            .filter(w => w.userId === userId || w.createdBy === userId);
          break;
        }
        case 'apiKeys': {
          const keys = await db.apiKey.findMany({ where: {} });
          // Masquer les clés secrètes dans l'export
          data.apiKeys = (keys as Record<string, unknown>[])
            .filter(k => k.userId === userId)
            .map(k => ({
              ...k,
              key: '***REDACTED***', // Ne jamais exporter les clés secrètes
            }));
          break;
        }
        case 'notifications': {
          const notifs = await db.notification.findMany({ where: {} });
          data.notifications = (notifs as Record<string, unknown>[])
            .filter(n => n.userId === userId);
          break;
        }
        case 'profile': {
          const user = await db.user.findUnique({ where: { id: userId } });
          if (user) {
            const userData = user as Record<string, unknown>;
            // Masquer les données sensibles
            delete userData.password;
            delete userData.passwordHash;
            data.profile = userData;
          }
          break;
        }
      }
    }

    // Compter le total d'enregistrements
    const totalRecords = Object.values(data).reduce((sum, arr) => {
      if (Array.isArray(arr)) return sum + arr.length;
      if (arr && typeof arr === 'object') return sum + 1;
      return sum;
    }, 0);

    // Formater les données
    let output: string;
    if (format === 'json') {
      output = JSON.stringify({
        exportedAt: new Date().toISOString(),
        userId,
        collections: Object.keys(data),
        totalRecords,
        data,
      }, null, 2);
    } else {
      // CSV : une section par collection
      output = convertToCsv(data);
    }

    log.info('Export completed', { userId, format, totalRecords, collections: Object.keys(data) });

    return {
      success: true,
      format,
      data: output,
      filename,
      collections: Object.keys(data),
      totalRecords,
    };
  } catch (err) {
    log.error('Export failed', { userId, error: String(err) });
    return {
      success: false,
      format,
      data: '',
      filename,
      collections: [],
      totalRecords: 0,
      error: 'Erreur lors de l\\'export des données',
    };
  }
}

/**
 * Convertit les données exportées en CSV.
 * Chaque collection devient une section avec en-tête.
 */
function convertToCsv(data: Record<string, unknown>): string {
  const sections: string[] = [];

  for (const [collectionName, records] of Object.entries(data)) {
    const recordArray = Array.isArray(records) ? records : [records];
    if (recordArray.length === 0) continue;

    sections.push(`# ${collectionName} (${recordArray.length} records)`);

    // Extraire les colonnes (clés de tous les enregistrements)
    const allKeys = new Set<string>();
    for (const record of recordArray) {
      if (record && typeof record === 'object') {
        for (const key of Object.keys(record as Record<string, unknown>)) {
          allKeys.add(key);
        }
      }
    }
    const columns = Array.from(allKeys);

    // En-tête CSV
    sections.push(columns.join(','));

    // Lignes
    for (const record of recordArray) {
      const row = columns.map(col => {
        const value = (record as Record<string, unknown>)?.[col];
        if (value === null || value === undefined) return '';
        const str = typeof value === 'object' ? JSON.stringify(value) : String(value);
        // Échapper les guillemets et virgules
        if (str.includes(',') || str.includes('"') || str.includes('\\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      });
      sections.push(row.join(','));
    }

    sections.push(''); // Ligne vide entre sections
  }

  return sections.join('\\n');
}

/**
 * Supprime toutes les données d'un utilisateur (RGPD right to erasure).
 */
export async function deleteUserData(userId: string): Promise<{ success: boolean; deleted: string[]; error?: string }> {
  const deleted: string[] = [];
  log.info('Starting data deletion', { userId });

  try {
    // Supprimer dans chaque collection
    const collections = ['agent', 'conversation', 'creditTransaction', 'execution', 'workflow', 'apiKey', 'notification'];

    for (const collection of collections) {
      try {
        const records = await (db as Record<string, { findMany: (args: { where: Record<string, unknown> }) => Promise<Record<string, unknown>[]>; deleteMany: (args: { where: Record<string, unknown> }) => Promise<unknown> }>)[collection].findMany({ where: {} });
        const userRecords = records.filter(r => r.userId === userId || r.createdBy === userId);

        if (userRecords.length > 0) {
          await (db as Record<string, { deleteMany: (args: { where: Record<string, unknown> }) => Promise<unknown> }>)[collection].deleteMany({
            where: { userId },
          });
          deleted.push(`${collection} (${userRecords.length})`);
        }
      } catch {
        // Collection might not exist, skip
      }
    }

    // Supprimer le profil utilisateur en dernier
    try {
      await db.user.delete({ where: { id: userId } });
      deleted.push('profile');
    } catch {}

    log.info('Data deletion completed', { userId, deleted });

    return { success: true, deleted };
  } catch (err) {
    log.error('Data deletion failed', { userId, error: String(err) });
    return { success: false, deleted, error: 'Erreur lors de la suppression' };
  }
}
