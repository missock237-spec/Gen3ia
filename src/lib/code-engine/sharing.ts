/**
 * Sharing System — Partage de sessions et execution collaborative
 * 
 * Permet de partager une session par lien :
 * - Lien public (lecture seule)
 * - Lien collaboratif (execution possible)
 * - Expiration automatique
 */

export type SharePermission = 'read' | 'execute' | 'edit';

export interface ShareLink {
  token: string;
  sessionId: string;
  userId: string;
  permission: SharePermission;
  expiresAt: Date;
  createdAt: Date;
  accessCount: number;
  isActive: boolean;
}

const shareLinks = new Map<string, ShareLink>();
const accessLog = new Map<string, { timestamp: Date; ip?: string }[]>();

/**
 * Genere un token unique
 */
function generateToken(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  return 'share_' + Array.from({ length: 24 }, () =>
    chars.charAt(Math.floor(Math.random() * chars.length))
  ).join('');
}

/**
 * Cree un lien de partage
 */
export function createShareLink(
  sessionId: string,
  userId: string,
  permission: SharePermission = 'read',
  expiresInHours = 48
): ShareLink {
  const link: ShareLink = {
    token: generateToken(),
    sessionId,
    userId,
    permission,
    expiresAt: new Date(Date.now() + expiresInHours * 3600000),
    createdAt: new Date(),
    accessCount: 0,
    isActive: true,
  };

  shareLinks.set(link.token, link);
  return link;
}

/**
 * Valide et recupere un lien de partage
 */
export function validateShareLink(token: string): { valid: boolean; link?: ShareLink; error?: string } {
  const link = shareLinks.get(token);
  if (!link) return { valid: false, error: 'Lien invalide' };
  if (!link.isActive) return { valid: false, error: 'Lien desactive' };
  if (Date.now() > link.expiresAt.getTime()) {
    link.isActive = false;
    return { valid: false, error: 'Lien expire' };
  }
  return { valid: true, link };
}

/**
 * Enregistre un acces au lien
 */
export function logShareAccess(token: string, ip?: string): void {
  const link = shareLinks.get(token);
  if (link) {
    link.accessCount++;
  }
  const logs = accessLog.get(token) || [];
  logs.push({ timestamp: new Date(), ip });
  accessLog.set(token, logs);
}

/**
 * Desactive un lien de partage
 */
export function deactivateShareLink(token: string, userId: string): boolean {
  const link = shareLinks.get(token);
  if (!link || link.userId !== userId) return false;
  link.isActive = false;
  return true;
}

/**
 * Liste les liens de partage d'une session
 */
export function getSessionShareLinks(sessionId: string): ShareLink[] {
  return Array.from(shareLinks.values()).filter(l => l.sessionId === sessionId && l.isActive);
}

/**
 * Nettoie les liens expires
 */
export function cleanupExpiredLinks(): number {
  let count = 0;
  for (const [token, link] of shareLinks) {
    if (Date.now() > link.expiresAt.getTime()) {
      link.isActive = false;
      count++;
    }
  }
  return count;
}

// Nettoyage toutes les heures
setInterval(cleanupExpiredLinks, 3600000);

/**
 * Stats de partage
 */
export function getSharingStats(userId?: string) {
  const links = userId
    ? Array.from(shareLinks.values()).filter(l => l.userId === userId)
    : Array.from(shareLinks.values());

  return {
    totalLinks: links.length,
    activeLinks: links.filter(l => l.isActive).length,
    totalAccesses: links.reduce((sum, l) => sum + l.accessCount, 0),
    byPermission: {
      read: links.filter(l => l.permission === 'read').length,
      execute: links.filter(l => l.permission === 'execute').length,
      edit: links.filter(l => l.permission === 'edit').length,
    },
  };
}