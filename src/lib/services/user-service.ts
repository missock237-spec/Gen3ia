import { prisma } from "@/lib/db";
import { hashPassword, verifyPassword, signToken } from "@/lib/auth/auth";
import { logger } from "@/lib/logger";

export class UserService {
  async create(data: { name: string; email: string; password: string }) {
    const exists = await prisma.user.findUnique({ where: { email: data.email } });
    if (exists) throw new Error("Email déjà utilisé");

    const hashed = await hashPassword(data.password);
    const user = await prisma.user.create({
      data: { name: data.name, email: data.email, passwordHash: hashed },
      select: { id: true, name: true, email: true, role: true, plan: true, createdAt: true },
    });

    logger.info("User created", { userId: user.id, email: user.email });
    return user;
  }

  async authenticate(email: string, password: string) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) throw new Error("Identifiants invalides");

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) throw new Error("Identifiants invalides");

    const token = signToken({ userId: user.id, email: user.email, role: user.role });
    logger.info("User authenticated", { userId: user.id });

    return {
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role, plan: user.plan },
    };
  }

  async getById(id: string) {
    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, name: true, email: true, role: true, plan: true, avatar: true, createdAt: true, isActive: true },
    });
    if (!user) throw new Error("Utilisateur non trouvé");
    return user;
  }

  async update(id: string, data: { name?: string; avatar?: string; plan?: string }) {
    const user = await prisma.user.update({
      where: { id },
      data,
      select: { id: true, name: true, email: true, role: true, plan: true, avatar: true },
    });
    logger.info("User updated", { userId: id });
    return user;
  }

  async delete(id: string) {
    await prisma.user.delete({ where: { id } });
    logger.info("User deleted", { userId: id });
  }

  async list(page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [users, total] = await Promise.all([
      prisma.user.findMany({
        skip,
        take: limit,
        select: { id: true, name: true, email: true, role: true, plan: true, isActive: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      }),
      prisma.user.count(),
    ]);
    return { users, total, page, limit, totalPages: Math.ceil(total / limit) };
  }
}

export const userService = new UserService();
