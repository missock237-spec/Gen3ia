/**
 * Systeme d'administration Gen3ia
 * - Compte admin via ADMIN_EMAILS
 * - Gestion des utilisateurs
 * - Statistiques plateforme
 *
 * MIGRATION FIRESTORE (bugfix) :
 * - createAdminAccount n'appelle plus hashPassword() (qui lève une
 *   Error depuis la migration Firebase Auth) — les mots de passe ne
 *   sont plus stockés en base ; le compte Auth est géré par Firebase
 *   (scripts/bootstrap-admin.ts). La fonction ne gère que le PROFIL.
 * - searchUsers n'utilise plus `OR`/`contains/mode` (non supportés par
 *   la façade) — filtrage en mémoire sur les utilisateurs récents.
 * - getAllUsers/getAdminLogs : `_count` et `include` relationnels
 *   remplacés par des comptages/jointures explicites.
 */

import { prisma } from '@/lib/prisma';

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
const ADMIN_ROLE = 'admin';
const ENTERPRISE_PLAN = 'enterprise';

export function isAdminEmail(email: string): boolean {
  return ADMIN_EMAILS.includes(email.toLowerCase().trim());
}

export function isAdminRole(role: string): boolean {
  return role === ADMIN_ROLE;
}

export function getAdminEmails(): string[] {
  return [...ADMIN_EMAILS];
}

// ============================================================
// Création automatique du compte admin
// ============================================================

export async function createAdminAccount(name: string, email: string, _password?: string) {
  // NOTE: `_password` est accepté pour compat ascendante mais IGNORÉ —
  // Firebase Auth gère les credentials (création du compte Auth via
  // scripts/bootstrap-admin.ts). Aucun mot de passe n'est stocké ici.
  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing) {
    // Promouvoir au rôle admin si déjà existant
    if (!isAdminRole((existing as Record<string, unknown>).role as string)) {
      return prisma.user.update({
        where: { email },
        data: {
          role: ADMIN_ROLE,
          plan: ENTERPRISE_PLAN,
          isActive: true,
        },
        select: { id: true, email: true, name: true, role: true, plan: true },
      });
    }
    return existing;
  }

  // Créer le profil admin (aucun mot de passe stocké — Firebase Auth)
  return prisma.user.create({
    data: {
      email,
      name,
      role: ADMIN_ROLE,
      plan: ENTERPRISE_PLAN,
      isActive: true,
      isEmailVerified: true,
    },
    select: { id: true, email: true, name: true, role: true, plan: true },
  });
}

// ============================================================
// Gestion des utilisateurs (Admin uniquement)
// ============================================================

export interface AdminUserSummary {
  id: string;
  email: string;
  name: string;
  plan: string;
  role: string;
  isActive: boolean;
  isEmailVerified: boolean;
  createdAt: Date;
  _count: {
    agents: number;
    conversations: number;
  };
}

const USER_SUMMARY_SELECT = {
  id: true,
  email: true,
  name: true,
  plan: true,
  role: true,
  isActive: true,
  isEmailVerified: true,
  createdAt: true,
} as const;

/** Compte agents + conversations d'un utilisateur (remplace le `_count` relationnel Prisma). */
async function countUserRelations(userId: string): Promise<{ agents: number; conversations: number }> {
  const [agents, conversations] = await Promise.all([
    prisma.agent.count({ where: [{ field: 'userId', op: '==', value: userId }] }),
    prisma.conversation.count({ where: [{ field: 'userId', op: '==', value: userId }] }),
  ]);
  return { agents, conversations };
}

export async function getAllUsers(page: number = 1, limit: number = 20): Promise<{
  users: AdminUserSummary[];
  total: number;
  page: number;
  totalPages: number;
}> {
  const skip = (page - 1) * limit;

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: USER_SUMMARY_SELECT,
    }),
    prisma.user.count(),
  ]);

  // La façade Firestore ne supporte pas le `_count` relationnel de Prisma :
  // on compte explicitement agents + conversations pour chaque utilisateur.
  const enriched = await Promise.all(
    (users as Array<Record<string, unknown>>).map(async (u) => ({
      ...u,
      _count: await countUserRelations(u.id as string),
    })),
  );

  return {
    users: enriched as unknown as AdminUserSummary[],
    total,
    page,
    totalPages: Math.ceil(total / limit),
  };
}

export async function searchUsers(query: string): Promise<AdminUserSummary[]> {
  const q = query.toLowerCase().trim();
  if (!q) return [];

  // La façade Firestore ne supporte ni `OR` ni `contains/mode` :
  // on charge les utilisateurs récents puis on filtre en mémoire
  // (recherche admin — volumétrie faible, pas d'index requis).
  const candidates = await prisma.user.findMany({
    take: 500,
    orderBy: { createdAt: 'desc' },
    select: USER_SUMMARY_SELECT,
  });

  const matches = (candidates as Array<Record<string, unknown>>)
    .filter((u) =>
      String(u.email ?? '').toLowerCase().includes(q) ||
      String(u.name ?? '').toLowerCase().includes(q),
    )
    .slice(0, 20);

  const enriched = await Promise.all(
    matches.map(async (u) => ({
      ...u,
      _count: await countUserRelations(u.id as string),
    })),
  );
  return enriched as unknown as AdminUserSummary[];
}

export async function updateUserPlan(userId: string, plan: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { plan },
  });
}

export async function toggleUserActive(userId: string, isActive: boolean): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { isActive },
  });
}

export async function updateUserRole(userId: string, role: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { role },
  });
}

export async function deleteUser(userId: string): Promise<void> {
  await prisma.user.delete({ where: { id: userId } });
}

export async function getUserById(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      plan: true,
      role: true,
      isActive: true,
      isEmailVerified: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

// ============================================================
// Statistiques de la plateforme
// ============================================================

export async function getPlatformStats() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const thisMonth = new Date(today.getFullYear(), today.getMonth(), 1);

  const [totalUsers, newUsersToday, newUsersThisMonth, totalAgents, totalConversations, totalTasks, planDistribution] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { createdAt: { gte: today } } }),
    prisma.user.count({ where: { createdAt: { gte: thisMonth } } }),
    prisma.agent.count(),
    prisma.conversation.count(),
    prisma.task.count(),
    prisma.user.groupBy({
      by: ['plan'],
      _count: true,
    }),
  ]);

  return {
    totalUsers,
    newUsersToday,
    newUsersThisMonth,
    totalAgents,
    totalConversations,
    totalTasks,
    planDistribution: planDistribution.reduce((acc, curr) => {
// @ts-ignore — type narrowing pending, see refactor ticket
      acc[curr.plan] = curr._count;
      return acc;
    }, {} as Record<string, number>),
  };
}

export async function getRevenueStats() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const thisMonth = new Date(today.getFullYear(), today.getMonth(), 1);

  // Revenus réels : agrégation des factures payées (façade Firestore)
  const [totalAgg, monthlyAgg, paidUsersCount, totalUsersCount, monthlyTxCount, totalTxCount] = await Promise.all([
    prisma.invoice.aggregate({
      _sum: { amount: true },
      _count: { _all: true },
      where: { status: 'paid' },
    }),
    prisma.invoice.aggregate({
      _sum: { amount: true },
      _count: { _all: true },
      where: { status: 'paid', paidAt: { gte: thisMonth } },
    }),
    prisma.user.count({ where: { plan: { not: 'free' } } }),
    prisma.user.count(),
    prisma.invoice.count({ where: { status: 'paid', paidAt: { gte: thisMonth } } }),
    prisma.invoice.count({ where: { status: 'paid' } }),
  ]);

  const totalRevenue = (totalAgg._sum && (totalAgg._sum as Record<string, number>).amount) ?? 0;
  const monthlyRevenue = (monthlyAgg._sum && (monthlyAgg._sum as Record<string, number>).amount) ?? 0;
  const conversionRate = totalUsersCount > 0
    ? (paidUsersCount / totalUsersCount) * 100
    : 0;

  return {
    totalRevenue,
    monthlyRevenue,
    totalTransactions: totalTxCount,
    monthlyTransactions: monthlyTxCount,
    paidUsers: paidUsersCount,
    conversionRate: Number(conversionRate.toFixed(2)),
  };
}

// ============================================================
// Audit Log
// ============================================================

export async function logAdminAction(adminId: string, action: string, details: string) {
  await prisma.activityLog.create({
    data: {
      action: `admin_${action}`,
      details,
      category: 'admin',
      userId: adminId,
    },
  });
}

export async function getAdminLogs(limit: number = 50) {
  const logs = await prisma.activityLog.findMany({
    where: { category: 'admin' },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  // La façade ignore `include: { user }` — jointure manuelle dédupliquée.
  const userIds = [...new Set(
    (logs as Array<Record<string, unknown>>)
      .map((l) => l.userId)
      .filter((id): id is string => typeof id === 'string' && id.length > 0),
  )];
  const usersById = new Map<string, Record<string, unknown>>();
  await Promise.all(
    userIds.map(async (id) => {
      const u = await prisma.user.findUnique({
        where: { id },
        select: { name: true, email: true },
      });
      if (u) usersById.set(id, u as Record<string, unknown>);
    }),
  );

  return (logs as Array<Record<string, unknown>>).map((l) => ({
    ...l,
    user: usersById.get(l.userId as string) ?? null,
  }));
}
