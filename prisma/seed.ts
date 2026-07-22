// ============================================================
// SEED — Données de démonstration pour développement
// ============================================================

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({
  datasource: {
    url: process.env.DATABASE_URL,
  },
});

async function main() {
  console.log("🌱 Début du seed...");

  // Créer un utilisateur admin
  const admin = await prisma.user.upsert({
    where: { email: "admin@genova.ai" },
    update: {},
    create: {
      email: "admin@genova.ai",
      name: "Admin Genova",
      password: "$2b$10$placeholder_hash", // À remplacer par un vrai hash bcrypt
      role: "admin",
      plan: "enterprise",
      isEmailVerified: true,
      isActive: true,
    },
  });
  console.log(`✓ Utilisateur admin créé: ${admin.email}`);

  // Créer quelques agents de démonstration
  const agents = [
    { name: "Assistant Support", type: "chat", description: "Agent de support client automatique" },
    { name: "Analyseur de Données", type: "analysis", description: "Agent d'analyse et visualisation de données" },
    { name: "Générateur de Contenu", type: "content", description: "Agent de génération de contenu marketing" },
  ];

  for (const agent of agents) {
    await prisma.agent.upsert({
      where: { id: `seed-${agent.name.toLowerCase().replace(/\s+/g, "-")}` },
      update: {},
      create: {
        id: `seed-${agent.name.toLowerCase().replace(/\s+/g, "-")}`,
        userId: admin.id,
        name: agent.name,
        type: agent.type,
        description: agent.description,
        status: "active",
        config: JSON.stringify({ model: "gpt-4o", temperature: 0.7 }),
      },
    });
  }
  console.log(`✓ ${agents.length} agents créés`);

  // Créer un workflow de démonstration
  await prisma.workflow.upsert({
    where: { id: "seed-workflow-support" },
    update: {},
    create: {
      id: "seed-workflow-support",
      userId: admin.id,
      name: "Support Ticket Auto",
      description: "Traitement automatique des tickets support",
      status: "active",
      trigger: "webhook",
      steps: JSON.stringify([
        { id: "step-1", type: "agent", name: "Analyser demande", config: { agentId: "seed-assistant-support" } },
        { id: "step-2", type: "condition", name: "Vérifier urgence", config: { variable: "priority", operator: "eq", value: "high" } },
        { id: "step-3", type: "agent", name: "Générer réponse", config: { agentId: "seed-assistant-support" } },
      ]),
    },
  });
  console.log("✓ Workflow de démo créé");

  console.log("\n✅ Seed terminé avec succès!");
}

main()
  .catch((e) => {
    console.error("❌ Erreur seed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });