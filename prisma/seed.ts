// ============================================================
// PRISMA SEED — Données initiales pour le développement
// ============================================================
// Usage: bunx prisma db seed
// ============================================================

import { PrismaClient } from "@prisma/client";
import { createHash, randomBytes } from "crypto";

const prisma = new PrismaClient();

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = createHash("sha256").update(password + salt).digest("hex");
  return `${salt}:${hash}`;
}

async function main() {
  console.log("🌱 Début du seed...");

  // 1. Créer l'admin
  const admin = await prisma.user.upsert({
    where: { email: "admin@genova.ai" },
    update: {},
    create: {
      email: "admin@genova.ai",
      name: "Admin Genova",
      password: hashPassword("Admin123!"),
      role: "admin",
      plan: "enterprise",
      credits: 100000,
      isActive: true,
      isEmailVerified: true,
    },
  });
  console.log(`✅ Admin créé: ${admin.email}`);

  // 2. Créer un utilisateur test
  const demo = await prisma.user.upsert({
    where: { email: "demo@genova.ai" },
    update: {},
    create: {
      email: "demo@genova.ai",
      name: "Utilisateur Démo",
      password: hashPassword("Demo123!"),
      role: "user",
      plan: "pro",
      credits: 5000,
      isActive: true,
      isEmailVerified: true,
    },
  });
  console.log(`✅ Utilisateur demo créé: ${demo.email}`);

  // 3. Créer des agents de démo
  const agents = [
    {
      name: "Assistant Général",
      type: "assistant",
      description: "Assistant IA polyvalent pour tâches générales",
      config: JSON.stringify({ model: "gpt-4o", temperature: 0.7, maxTokens: 4096 }),
      userId: demo.id,
    },
    {
      name: "Analyseur de Données",
      type: "analyst",
      description: "Agent spécialisé dans l'analyse et la visualisation de données",
      config: JSON.stringify({ model: "gpt-4o", temperature: 0.3, maxTokens: 8192 }),
      userId: demo.id,
    },
    {
      name: "Assistant WhatsApp",
      type: "whatsapp",
      description: "Agent de support client via WhatsApp",
      config: JSON.stringify({ model: "gpt-4o", temperature: 0.5, maxTokens: 2048 }),
      userId: demo.id,
    },
  ];

  for (const agent of agents) {
    const existing = await prisma.agent.findFirst({
      where: { name: agent.name, userId: demo.id },
    });
    if (!existing) {
      await prisma.agent.create({ data: agent });
      console.log(`✅ Agent créé: ${agent.name}`);
    }
  }

  // 4. Créer un abonnement pour le user demo
  await prisma.subscription.upsert({
    where: { userId: demo.id },
    update: {},
    create: {
      userId: demo.id,
      plan: "pro",
      status: "active",
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });
  console.log(`✅ Abonnement Pro créé pour ${demo.email}`);

  // 5. Ajouter des crédits de bienvenue
  await prisma.creditTransaction.createMany({
    data: [
      {
        userId: admin.id,
        amount: 100000,
        balance: 100000,
        type: "bonus",
        resourceType: "welcome",
        description: "Crédits de bienvenue Admin",
      },
      {
        userId: demo.id,
        amount: 5000,
        balance: 5000,
        type: "bonus",
        resourceType: "welcome",
        description: "Crédits de bienvenue Démo",
      },
    ],
  });
  console.log(`✅ Crédits de bienvenue ajoutés`);

  console.log("\n🎉 Seed terminé avec succès !");
  console.log("\n📋 Identifiants de test :");
  console.log("   Admin: admin@genova.ai / Admin123!");
  console.log("   Demo:  demo@genova.ai  / Demo123!");
}

main()
  .catch((e) => {
    console.error("❌ Erreur seed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });