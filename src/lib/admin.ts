/**
 * Systeme d'administration Genova
 * - Compte admin via ADMIN_EMAILS
 * - Gestion des utilisateurs
 * - Statistiques plateforme
 */

import { db } from '@/lib/db';
import { hashPassword } from '@/lib/auth';

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

export async function createAdminAccount(name: string, email: string, password: string) {
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    if (!isAdminRole(existing.role)) {
      return db.user.update({
        where: { email },
        data: { role: ADMIN_ROLE, plan: ENTERPRISE_PLAN, isActive: true },
        select: { id: true, email: true, name: true, role: true, plan: true },
      });
    }
    return existing;
  }
  const passwordHash = await hashPassword(password);
  return db.user.create({
    data: { email, name, passwordHash, role: ADMIN_ROLE, plan: ENTERPRISE_PLAN, isActive: true, isEmailVerified: true, emailVerified: new Date() },
    select: { id: true, email: true, name: true, role: true, plan: true },
  });
}

export async function getAllUsers(page = 1, limit = 20) {
  const skip = (page - 1) * limit;
  const [users, total] = await Promise.all([
    db.user.findMany({ skip, take: limit, orderBy: { createdAt: 'desc' }, select: { id: true, email: true, name: true, plan: true, role: true, isActive: true, isEmailVerified: true, createdAt: true, _count: { select: { agents: true, conversations: true } } } }),
    db.user.count(),
  ]);
  return { users, total, page, totalPages: Math.ceil(total / limit) };
}

export async function searchUsers(query: string) {
  return db.user.findMany({
    where: { OR: [{ email: { contains: query, mode: 'insensitive' } }, { name: { contains: query, mode: 'insensitive' } }] },
    take: 20, orderBy: { createdAt: 'desc' },
  });
}

export async function updateUserPlan(userId: string, plan: string) {
  await db.user.update({ where: { id: userId }, data: { plan } });
}

export async function toggleUserActive(userId: string, isActive: boolean) {
  await db.user.update({ where: { id: userId }, data: { isActive } });
}

export async function updateUserRole(userId: string, role: string) {
  await db.user.update({ where: { id: userId }, data: { role } });
}

export async function getUserById(userId: string) {
  return db.user.findUnique({ where: { id: userId }, select: { id: true, email: true, name: true, plan: true, role: true, isActive: true, isEmailVerified: true, createdAt: true } });
}

export async function getPlatformStats() {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const thisMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const [totalUsers, newUsersToday, newUsersThisMonth, totalAgents, totalConversations] = await Promise.all([
    db.user.count(),
    db.user.count({ where: { createdAt: { gte: today } } }),
    db.user.count({ where: { createdAt: { gte: thisMonth } } }),
    db.agent.count(),
    db.conversation.count(),
  ]);
  return { totalUsers, newUsersToday, newUsersThisMonth, totalAgents, totalConversations };
}

export async function logAdminAction(adminId: string, action: string, details: string) {
  await db.activityLog.create({ data: { action: `admin_${action}`, details, category: 'admin', userId: adminId } });
}

export async function getAdminLogs(limit = 50) {
  return db.activityLog.findMany({ where: { category: 'admin' }, orderBy: { createdAt: 'desc' }, take: limit });
}
// ============================================================
// Création automatique du compte admin
// ============================================================

export async function createAdminAccount(name: string, email: string, password: string) {
  const existing = await prisma.user.findUnique({ where: { email } });
  
  if (existing) {
    // Promouvoir au rôle admin si déjà existant
    if (!isAdminRole(existing.role)) {
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

  // Créer le compte admin
  return prisma.user.create({
    data: {
      email,
      name,
      password: hashPassword(password),
      role: ADMIN_ROLE,
      plan: ENTERPRISE_PLAN,
      isActive: true,
      isEmailVerified: true,
      emailVerified: new Date(),
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
      select: {
        id: true,
        email: true,
        name: true,
        plan: true,
        role: true,
        isActive: true,
        isEmailVerified: true,
        createdAt: true,
        _count: {
          select: {
            agents: true,
            conversations: true,
          },
        },
      },
    }),
    prisma.user.count(),
  ]);

  return {
    users,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  };
}

export async function searchUsers(query: string): Promise<AdminUserSummary[]> {
  return prisma.user.findMany({
    where: {
      OR: [
        { email: { contains: query, mode: 'insensitive' } },
        { name: { contains: query, mode: 'insensitive' } },
      ],
    },
    take: 20,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      email: true,
      name: true,
      plan: true,
      role: true,
      isActive: true,
      isEmailVerified: true,
      createdAt: true,
      _count: {
        select: {
          agents: true,
          conversations: true,
        },
      },
    },
  });
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
      acc[curr.plan] = curr._count;
      return acc;
    }, {} as Record<string, number>),
  };
}

export async function getRevenueStats() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const thisMonth = new Date(today.getFullYear(), today.getMonth(), 1);

  // Placeholder pour les stats de revenus (à connecter à SebPay)
  return {
    totalRevenue: 0,
    monthlyRevenue: 0,
    totalTransactions: 0,
    monthlyTransactions: 0,
    paidUsers: 0,
    conversionRate: 0,
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
  return prisma.activityLog.findMany({
    where: { category: 'admin' },
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: {
      user: {
        select: { name: true, email: true },
      },
    },
  });
}
