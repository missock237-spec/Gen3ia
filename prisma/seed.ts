// ============================================================
// SEED — Donnees de demonstration completes pour tous les modules
// ============================================================
import { PrismaClient } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';

const prisma = new PrismaClient();

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = createHash('sha256').update(password + salt).digest('hex');
  return `$argon2id$v=19$m=65536,t=3,p=4$${salt}$${hash}`;
}

async function main() {
  console.log(' Seed demarrage...');

  // === 1. Admin ===
  const admin = await prisma.user.upsert({
    where: { email: 'admin@gen3ia.ai' },
    update: {},
    create: {
      email: 'admin@gen3ia.ai', name: 'Admin Gen3ia',
      password: hashPassword('Admin123!'),
      role: 'admin', plan: 'enterprise', credits: 100000,
      isEmailVerified: true, isActive: true,
    },
  });
  console.log(' Admin: ' + admin.email);

  // === 2. Utilisateurs de demo ===
  const users = [];
  const demoUsers = [
    { email: 'alice@demo.com', name: 'Alice Kamga', plan: 'pro', credits: 15000 },
    { email: 'bob@demo.com', name: 'Bob Tchinda', plan: 'starter', credits: 3000 },
  ];
  for (const u of demoUsers) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: { ...u, password: hashPassword('Demo123!'), role: 'user', isEmailVerified: true, isActive: true },
    });
    users.push(user);
    console.log(' Utilisateur: ' + user.email);
  }

  const allUsers = [admin, ...users];

  // === 3. Agents specialises ===
  const agentConfigs = [
    { name: 'Analyseur Marche', role: 'analyst', instructions: 'Analyse les tendances du marche', model: 'gpt-4o' },
    { name: 'Redacteur Contenu', role: 'writer', instructions: 'Cree du contenu marketing et des articles', model: 'gpt-4o-mini' },
    { name: 'Assistant Support', role: 'assistant', instructions: 'Repond aux questions des clients', model: 'gpt-4o-mini' },
    { name: 'Data Analyst', role: 'analyst', instructions: 'Analyse les donnees et genere des rapports', model: 'gpt-4o' },
    { name: 'Traducteur', role: 'custom', instructions: 'Traduit les textes en plusieurs langues', model: 'gpt-4o-mini' },
  ];
  const agents = [];
  for (const cfg of agentConfigs) {
    const agent = await prisma.agent.create({
      data: { name: cfg.name, role: cfg.role, instructions: cfg.instructions, model: cfg.model, type: 'assistant', status: 'active', ownerId: admin.id, description: cfg.instructions.slice(0, 60), temperature: 0.7, maxTokens: 4096, category: 'custom', tags: JSON.stringify(['demo']) },
    });
    agents.push(agent);
  }
  console.log(' Agents: ' + agents.length);

  // === 4. Workflows ===
  const workflow1 = await prisma.workflow.create({
    data: { name: 'Support Automatique', description: 'Repond automatiquement aux tickets support', trigger: 'webhook', status: 'active', userId: admin.id, steps: JSON.stringify({ blocks: [{ id: 'b1', type: 'trigger', label: 'Webhook entrant' }, { id: 'b2', type: 'agent', label: 'Analyser demande' }, { id: 'b3', type: 'condition', label: 'Urgent ?' }, { id: 'b4', type: 'send_email', label: 'Notifier equipe' }], edges: [{ source: 'b1', target: 'b2' }, { source: 'b2', target: 'b3' }, { source: 'b3', target: 'b4', condition: 'true' }] }) },
  });
  console.log(' Workflow: ' + workflow1.name);

  // === 5. Dataset ===
  const dataset = await prisma.dataset.create({
    data: { name: 'Ventes Demo', description: 'Donnees de ventes fictives', source: 'csv', userId: admin.id, schemaInfo: JSON.stringify([{ name: 'date', type: 'string' }, { name: 'produit', type: 'string' }, { name: 'montant', type: 'number' }, { name: 'region', type: 'string' }]), sampleData: JSON.stringify([{ date: '2026-01', produit: 'SaaS Pro', montant: 15000, region: 'Douala' }, { date: '2026-02', produit: 'SaaS Starter', montant: 5000, region: 'Yaounde' }]), rowCount: 6 },
  });
  console.log(' Dataset: ' + dataset.name);

  // === 6. Dashboard ===
  const dashboard = await prisma.dashboard.create({
    data: { name: 'Tableau de Bord Ventes', description: 'Dashboard commercial', userId: admin.id, widgets: JSON.stringify([{ id: 'w1', type: 'chart', title: 'CA par mois' }, { id: 'w2', type: 'number', title: 'Total ventes' }]), isPublic: true },
  });
  console.log(' Dashboard: ' + dashboard.name);

  // === 7. Conversation ===
  const conversation = await prisma.conversation.create({
    data: { title: 'Support Client', type: 'chat', userId: admin.id, messages: { create: [{ role: 'user', content: 'Bonjour, j ai un probleme avec mon compte' }, { role: 'assistant', content: 'Bonjour! Je suis la pour vous aider. Quel est le probleme exactement?' }] } },
  });
  console.log(' Conversation creee');

  // === 8. QueryLog (Data Analyst) ===
  await prisma.queryLog.create({
    data: { datasetId: dataset.id, userId: admin.id, naturalLanguage: 'Quel est le chiffre d affaires par region?', generatedQuery: 'SELECT region, SUM(montant) FROM ventes GROUP BY region', queryType: 'sql', result: JSON.stringify([{ region: 'Douala', total: 49500 }, { region: 'Yaounde', total: 11000 }]), executionTimeMs: 45 },
  });
  console.log(' Query log cree');

  // === 9. Agent invocations ===
  for (let i = 0; i < 5; i++) {
    await prisma.agentInvocation.create({
      data: { agentId: agents[i % agents.length].id, userId: admin.id, input: 'Question de test ' + i, output: 'Reponse simulee', model: 'gpt-4o-mini', tokensUsed: Math.floor(Math.random() * 500 + 100), cost: Math.random() * 0.002, durationMs: Math.floor(Math.random() * 2000 + 200) },
    });
  }
  console.log(' Invocations creees');

  // === 10. AlertRule ===
  await prisma.alertRule.create({
    data: { userId: admin.id, name: 'Budget Quotidien', condition: 'budget_exceeded', threshold: 500, windowMinutes: 1440, channels: JSON.stringify(['email']), enabled: true },
  });
  console.log(' Regle d alerte creee');

  // === 11. WebhookConfig ===
  await prisma.webhookConfig.create({
    data: { userId: admin.id, name: 'Slack Notifications', url: 'https://hooks.slack.com/services/demo', method: 'POST', retryCount: 3, timeout: 10000, enabled: true },
  });
  console.log(' Webhook config cree');

  // === 12. Notification ===
  await prisma.notification.create({
    data: { userId: admin.id, type: 'system', title: 'Bienvenue sur Gen3ia!', message: 'Votre compte a ete cree avec succes.', severity: 'info', icon: 'bell' },
  });
  console.log(' Notification creee');

  // === 13. Marketplace listing ===
  await prisma.marketplaceListing.upsert({
    where: { slug: 'agent-analyseur-marche' },
    update: {},
    create: { name: 'Analyseur Marche Pro', slug: 'agent-analyseur-marche', description: 'Agent specialise dans l analyse des tendances du marche', type: 'agent', price: 5000, userId: admin.id, status: 'published', isActive: true, autoTestStatus: 'passed', trustScore: 85, badges: JSON.stringify([{ type: 'verified', label: 'Verifie', icon: 'check', color: '#3b82f6' }]) },
  });
  console.log(' Marketplace listing cree');

  console.log('\n Seed termine avec succes!');
  console.log('\n Identifiants de connexion:');
  console.log(' Admin: admin@gen3ia.ai / Admin123!');
  console.log(' Alice: alice@demo.com / Demo123!');
  console.log(' Bob: bob@demo.com / Demo123!');
}

main()
  .catch((e) => { console.error(' Erreur seed:', e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });