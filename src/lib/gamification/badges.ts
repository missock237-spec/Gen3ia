/**
 * Gamification — Badges, niveaux et défis pour les utilisateurs
 */

export interface Badge {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: 'onboarding' | 'usage' | 'social' | 'mastery' | 'special';
  condition: (stats: UserStats) => boolean;
}

export interface UserStats {
  totalAgents: number;
  totalConversations: number;
  totalCreditsUsed: number;
  totalImagesGenerated: number;
  totalVideosGenerated: number;
  totalCodeExecutions: number;
  totalSales: number;
  totalRevenue: number;
  daysActive: number;
  agentsShared: number;
}

export interface UserLevel {
  level: number;
  name: string;
  icon: string;
  minXp: number;
  benefits: string[];
}

export const LEVELS: UserLevel[] = [
  { level: 1, name: 'Débutant', icon: '🌱', minXp: 0, benefits: ['Accès de base'] },
  { level: 2, name: 'Apprenti', icon: '🌿', minXp: 100, benefits: [' +1 agent'] },
  { level: 3, name: 'Explorateur', icon: '🔍', minXp: 300, benefits: [' +2 agents', 'Thèmes'] },
  { level: 4, name: 'Créateur', icon: '⚡', minXp: 600, benefits: [' +5 agents', 'Export'] },
  { level: 5, name: 'Expert', icon: '🌟', minXp: 1000, benefits: [' +10 agents', 'API avancée'] },
  { level: 6, name: 'Master', icon: '👑', minXp: 2000, benefits: ['Agents illimités', 'Priorité support'] },
  { level: 7, name: 'Légende', icon: '🏆', minXp: 5000, benefits: ['Tout débloqué', 'Badge exclusif'] },
];

export const BADGES: Badge[] = [
  { id: 'first_agent', name: 'Premier Agent', description: 'Crée ton premier agent', icon: '🤖', category: 'onboarding',
    condition: (s) => s.totalAgents >= 1 },
  { id: 'agent_creator', name: 'Créateur en série', description: 'Crée 10 agents', icon: '🏭', category: 'onboarding',
    condition: (s) => s.totalAgents >= 10 },
  { id: 'chatty', name: 'Bavard', description: '100 conversations', icon: '💬', category: 'usage',
    condition: (s) => s.totalConversations >= 100 },
  { id: 'power_user', name: 'Power User', description: 'Utilise 1000 crédits', icon: '⚡', category: 'usage',
    condition: (s) => s.totalCreditsUsed >= 1000 },
  { id: 'artist', name: 'Artiste AI', description: 'Génère 50 images', icon: '🎨', category: 'usage',
    condition: (s) => s.totalImagesGenerated >= 50 },
  { id: 'film_maker', name: 'Cinéaste', description: 'Génère 10 vidéos', icon: '🎬', category: 'usage',
    condition: (s) => s.totalVideosGenerated >= 10 },
  { id: 'coder', name: 'Développeur', description: '100 exécutions de code', icon: '💻', category: 'usage',
    condition: (s) => s.totalCodeExecutions >= 100 },
  { id: 'seller', name: 'Marchand', description: 'Première vente', icon: '💰', category: 'social',
    condition: (s) => s.totalSales >= 1 },
  { id: 'rich', name: 'Millionnaire', description: 'Gagne 100$', icon: '🤑', category: 'social',
    condition: (s) => s.totalRevenue >= 100 },
  { id: 'veteran', name: 'Vétéran', description: '30 jours actifs', icon: '🎖️', category: 'mastery',
    condition: (s) => s.daysActive >= 30 },
  { id: 'sharer', name: 'Partageur', description: 'Partage 5 agents', icon: '🤝', category: 'social',
    condition: (s) => s.agentsShared >= 5 },
  { id: 'all_rounder', name: 'Complet', description: 'Débloque tous les badges', icon: '🌟', category: 'special',
    condition: (s) => s.totalAgents >= 1 }, // Condition spéciale traitée différemment
];

export function calculateXp(stats: UserStats): number {
  return (
    stats.totalAgents * 10 +
    stats.totalConversations * 2 +
    stats.totalCreditsUsed * 0.1 +
    stats.totalImagesGenerated * 5 +
    stats.totalVideosGenerated * 20 +
    stats.totalCodeExecutions * 1 +
    stats.totalSales * 50 +
    stats.daysActive * 5
  );
}

export function getLevel(xp: number): UserLevel {
  return [...LEVELS].reverse().find(l => xp >= l.minXp) || LEVELS[0];
}

export function getUnlockedBadges(stats: UserStats): Badge[] {
  return BADGES.filter(b => b.condition(stats));
}

export function getNextLevelProgress(xp: number): { current: UserLevel; next: UserLevel | null; progress: number } {
  const current = getLevel(xp);
  const nextIndex = LEVELS.findIndex(l => l.level === current.level) + 1;
  const next = nextIndex < LEVELS.length ? LEVELS[nextIndex] : null;

  if (!next) return { current, next: null, progress: 1 };

  const progress = (xp - current.minXp) / (next.minXp - current.minXp);
  return { current, next, progress: Math.min(1, Math.max(0, progress)) };
}
