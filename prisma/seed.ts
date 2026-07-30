// Seed — Boucles IA officielles, competences et personnalisations
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  // ===== BOUCLES IA OFFICIELLES =====
  const loops = [
    {
      name: 'Boucle ReAct de base', slug: 'react-basic', description: 'Boucle Reason-Act standard. L\'agent reflechit, agit, observe et recommence.',
      icon: '🔄', isFree: true, isOfficial: true, tags: ['react', 'base', 'reflexion'],
      config: { maxIterations: 5, maxTokens: 2048, temperature: 0.7, stopOnResult: true, reflectionEnabled: false, tools: ['web_search', 'code_execution'], promptTemplate: 'Reflechis et agis pour repondre.' },
    },
    {
      name: 'Boucle de reflexion profonde', slug: 'deep-reflection', description: 'L\'agent analyse, critique et ameliore ses reponses en plusieurs passes.',
      icon: '🧠', price: 500, isFree: false, isOfficial: true, tags: ['reflexion', 'avance', 'qualite'],
      config: { maxIterations: 8, maxTokens: 4096, temperature: 0.5, stopOnResult: false, reflectionEnabled: true, tools: ['web_search', 'code_execution', 'memory'], promptTemplate: 'Analyse ta reponse precedente et ameliore-la.' },
    },
    {
      name: 'Boucle de recherche multi-source', slug: 'multi-source-research', description: 'Recherche sur plusieurs sources, compile et synthetise.',
      icon: '🔍', price: 300, isFree: false, isOfficial: true, tags: ['recherche', 'sources', 'analyse'],
      config: { maxIterations: 6, maxTokens: 4096, temperature: 0.3, stopOnResult: true, reflectionEnabled: true, tools: ['web_search', 'serpapi', 'browser'], promptTemplate: 'Recherche sur 3 sources differentes et synthetise.' },
    },
    {
      name: 'Boucle creative', slug: 'creative-loop', description: 'Generation creative avec iterations stylistiques.',
      icon: '🎨', isFree: true, isOfficial: true, tags: ['creatif', 'ecriture', 'style'],
      config: { maxIterations: 4, maxTokens: 2048, temperature: 0.9, stopOnResult: true, reflectionEnabled: false, tools: [], promptTemplate: 'Sois creatif et original.' },
    },
    {
      name: 'Boucle de debogage automatique', slug: 'auto-debug', description: 'Execute du code, detecte les erreurs et les corrige automatiquement.',
      icon: '🐛', price: 800, isFree: false, isOfficial: true, tags: ['code', 'debug', 'automatique'],
      config: { maxIterations: 10, maxTokens: 4096, temperature: 0.4, stopOnResult: true, reflectionEnabled: true, tools: ['code_execution', 'terminal'], promptTemplate: 'Execute, detecte les erreurs et corrige-les jusqu\'a ce que le code fonctionne.' },
    },
  ];

  for (const loop of loops) {
    await prisma.aILoop.upsert({
      where: { slug: loop.slug },
      update: { installCount: { increment: 0 } },
      create: { ...loop, status: 'published', authorId: 'official', authorName: 'Gen3ia', config: JSON.stringify(loop.config) },
    });
  }

  // ===== COMPETENCES OFFICIELLES =====
  const skills = [
    { name: 'Analyse de donnees', slug: 'data-analysis', description: 'Analyse, visualise et interprete des donnees structurees.', category: 'analysis', icon: '📊', isFree: true, isOfficial: true, tags: ['donnees', 'analyse', 'visualisation'], config: { tools: ['dataset', 'query', 'chart'] }, compatibleModels: ['gpt-4o', 'claude-3'], compatibleAgentTypes: ['assistant', 'analyst'] },
    { name: 'Generation de code', slug: 'code-generation', description: 'Ecrit, refactore et optimise du code dans plusieurs langages.', category: 'code', icon: '💻', isFree: true, isOfficial: true, tags: ['code', 'developpement', 'programmation'], config: { tools: ['code_execution', 'terminal'] }, compatibleModels: ['gpt-4o', 'claude-3', 'codestral'], compatibleAgentTypes: ['assistant', 'developer'] },
    { name: 'Recherche web approfondie', slug: 'web-research', description: 'Effectue des recherches web avancees avec sources.', category: 'research', icon: '🌐', isFree: true, isOfficial: true, tags: ['recherche', 'web', 'sources'], config: { tools: ['web_search', 'serpapi', 'browser'] }, compatibleModels: ['gpt-4o', 'claude-3', 'gemini'], compatibleAgentTypes: ['assistant', 'researcher'] },
    { name: 'Redaction professionnelle', slug: 'professional-writing', description: 'Redige des emails, rapports et documents professionnels.', category: 'writing', icon: '✍️', price: 200, isFree: false, isOfficial: true, tags: ['redaction', 'professionnel', 'email'], config: { tools: ['formatting', 'grammar'] }, compatibleModels: ['gpt-4o', 'claude-3-haiku'], compatibleAgentTypes: ['assistant'] },
    { name: 'Raisonnement logique avance', slug: 'advanced-reasoning', description: 'Resout des problemes complexes avec un raisonnement etape par etape.', category: 'reasoning', icon: '🧩', price: 400, isFree: false, isOfficial: true, tags: ['logique', 'problemes', 'raisonnement'], config: { tools: ['math', 'logical_reasoning'] }, compatibleModels: ['gpt-4o', 'o1', 'o3', 'claude-4'], compatibleAgentTypes: ['assistant', 'analyst', 'researcher'] },
  ];

  for (const skill of skills) {
    await prisma.skill.upsert({
      where: { slug: skill.slug },
      update: {},
      create: { ...skill, status: 'published', authorId: 'official', authorName: 'Gen3ia', level: 'intermediate', version: '1.0.0', config: JSON.stringify(skill.config) },
    });
  }

  // ===== PERSONNALISATIONS OFFICIELLES =====
  const customizations = [
    { name: 'Theme sombre professionnel', slug: 'dark-pro', description: 'Interface sombre optimisee pour le travail.', type: 'theme', icon: '🌙', isFree: true, isOfficial: true, tags: ['theme', 'sombre', 'pro'], config: { colors: { background: '#0a0a0f', foreground: '#e4e4e7', primary: '#6366f1' }, fonts: 'Inter' } },
    { name: 'Mode assistant juridique', slug: 'legal-mode', description: 'Preset de configuration pour assistants juridiques.', type: 'preset', icon: '⚖️', price: 1000, isFree: false, isOfficial: true, tags: ['juridique', 'legal', 'preset'], config: { temperature: 0.3, maxTokens: 4096, systemPrompt: 'Tu es un assistant juridique professionnel. Reponds avec precision et en citant tes sources.' } },
  ];

  for (const cust of customizations) {
    await prisma.customization.upsert({
      where: { slug: cust.slug },
      update: {},
      create: { ...cust, status: 'published', authorId: 'official', authorName: 'Gen3ia', version: '1.0.0', config: JSON.stringify(cust.config) },
    });
  }

  console.log('✅ Seed boucles IA, competences et personnalisations terminee');
}

main().catch(console.error).finally(() => prisma.$disconnect());
