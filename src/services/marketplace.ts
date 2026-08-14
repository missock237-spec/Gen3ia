// ============================================================
// MARKETPLACE — Store d'agents et templates Gen3ia
// ============================================================
// Publier, decouvrir et installer des agents, workflows
// et templates crees par la communaute.
// ============================================================

import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

class MarketplaceService {
  async publish(params: {
    userId: string;
    type: "agent" | "workflow" | "template" | "integration";
    name: string;
    description: string;
    category?: string;
    tags?: string[];
    price?: number;
    config: Record<string, unknown>;
  }) {
    const slug = params.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const existing = await prisma.marketplaceListing.findUnique({ where: { slug } });
    if (existing) throw new Error(`Un item avec le slug "${slug}" existe deja`);

    const item = await prisma.marketplaceListing.create({
      data: {
        userId: params.userId, type: params.type, name: params.name, slug,
        description: params.description, category: params.category ?? "general",
        tags: JSON.stringify(params.tags ?? []), config: JSON.stringify(params.config),
        price: params.price ?? 0, status: "published", isActive: true,
      },
    });

    logger.info("marketplace_item_published", { itemId: item.id, type: params.type, slug });
    return item;
  }

  async search(params: { query?: string; type?: string; category?: string; page?: number; limit?: number }) {
    const page = params.page ?? 1;
    const limit = params.limit ?? 20;
    const skip = (page - 1) * limit;
    const where: Record<string, unknown> = { isActive: true, status: "published" };
    if (params.type) where.type = params.type;
    if (params.category) where.category = params.category;

    const [items, total] = await Promise.all([
      prisma.marketplaceListing.findMany({
        where: where as any,
// @ts-ignore
        orderBy: [{ downloads: "desc" }, { rating: "desc" }],
        skip, take: limit,
        select: { id: true, type: true, name: true, slug: true, description: true, category: true, price: true, rating: true, downloads: true, installCount: true, createdAt: true, user: { select: { name: true } } },
      }),
      prisma.marketplaceListing.count({ where: where as any }),
    ]);

    return {
      items: items.map((i) => ({ ...i, author: i.user.name, user: undefined })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async install(itemId: string, userId: string) {
    const item = await prisma.marketplaceListing.findUnique({ where: { id: itemId } });
    if (!item) throw new Error("Item introuvable");

    const existing = await prisma.marketplacePurchase.findUnique({
      where: { userId_listingId: { userId, listingId: itemId } },
    });
    if (existing) return { message: "Item deja installe", itemId };

    if (item.price > 0) {
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { credits: true } });
      if (!user || (user.credits ?? 0) < item.price) throw new Error("Credits insuffisants");
      await prisma.user.update({ where: { id: userId }, data: { credits: { decrement: item.price } } });
    }

    await prisma.marketplacePurchase.create({ data: { userId, listingId: itemId, price: item.price, currency: "credits", status: "completed" } });
    await prisma.marketplaceListing.update({ where: { id: itemId }, data: { installCount: { increment: 1 }, downloads: { increment: 1 } } });

    logger.info("marketplace_item_installed", { itemId, userId });
    return { success: true, itemId, config: JSON.parse(item.config), message: `${item.name} installe avec succes` };
  }

  async getItem(slug: string) {
    const item = await prisma.marketplaceListing.findUnique({
      where: { slug },
      include: {
        user: { select: { name: true } },
        reviews: { take: 10, orderBy: { createdAt: "desc" }, select: { rating: true, content: true, user: { select: { name: true } } } },
      },
    });
    if (!item) return null;
    return { ...item, author: item.user.name, tags: JSON.parse(item.tags), config: JSON.parse(item.config), reviews: item.reviews };
  }
}

export const marketplace = new MarketplaceService();