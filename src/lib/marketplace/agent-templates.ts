/**
 * Agents pré-construits pour le Marketplace
 * 10 agents prêts à l'emploi, import/export JSON
 */

export interface AgentTemplate {
  id: string;
  name: string;
  type: string;
  description: string;
  category: string;
  tags: string[];
  config: Record<string, unknown>;
  systemPrompt: string;
  features: string[];
  price: number;
  icon: string;
}

export const AGENT_TEMPLATES: AgentTemplate[] = [
  {
    id: 'template-assistant',
    name: 'Assistant Personnel',
    type: 'agent',
    description: 'Assistant AI polyvalent pour répondre aux questions, rédiger des emails et gérer votre quotidien.',
    category: 'productivity',
    tags: ['assistant', 'productivity', 'general'],
    config: { temperature: 0.7, maxTokens: 4096 },
    systemPrompt: 'Tu es un assistant personnel compétent et professionnel. Tu aides à la rédaction, la recherche et l\'organisation.',
    features: ['Rédaction emails', 'Résumé de textes', 'Recherche web', 'Gestion de tâches'],
    price: 0,
    icon: '🤖',
  },
  {
    id: 'template-coder',
    name: 'Agent Codeur',
    type: 'agent',
    description: 'Agent spécialisé en développement logiciel. Capable d\'écrire, debugger et optimiser du code.',
    category: 'development',
    tags: ['code', 'developer', 'programming'],
    config: { temperature: 0.3, maxTokens: 8192 },
    systemPrompt: 'Tu es un développeur expert. Tu écris du code propre, bien documenté et optimisé. Tu expliques tes choix techniques.',
    features: ['Écriture de code', 'Debugging', 'Code review', 'Documentation', 'Architecture'],
    price: 0,
    icon: '💻',
  },
  {
    id: 'template-researcher',
    name: 'Chercheur Web',
    type: 'agent',
    description: 'Agent de recherche capable d\'analyser le web en profondeur et de synthétiser des informations complexes.',
    category: 'research',
    tags: ['search', 'research', 'analysis'],
    config: { temperature: 0.5, maxTokens: 4096 },
    systemPrompt: 'Tu es un chercheur méthodique. Tu analyses les sources, compares les informations et présentes des synthèses claires et sourcées.',
    features: ['Recherche web', 'Analyse de sources', 'Synthèse', 'Rapports détaillés'],
    price: 0,
    icon: '🔍',
  },
  {
    id: 'template-writer',
    name: 'Rédacteur SEO',
    type: 'agent',
    description: 'Rédacteur de contenu optimisé SEO. Articles de blog, descriptions produits, landing pages.',
    category: 'marketing',
    tags: ['writing', 'seo', 'content'],
    config: { temperature: 0.8, maxTokens: 4096 },
    systemPrompt: 'Tu es un rédacteur SEO expert. Tu rédiges du contenu engageant, optimisé pour les moteurs de recherche et adapté à la cible.',
    features: ['Articles blog', 'SEO optimization', 'Copywriting', 'Landing pages'],
    price: 0,
    icon: '✍️',
  },
  {
    id: 'template-analyst',
    name: 'Analyste de Données',
    type: 'agent',
    description: 'Analyse des données, création de rapports et visualisations. Parfait pour les décisions basées sur les données.',
    category: 'finance',
    tags: ['analytics', 'data', 'reports'],
    config: { temperature: 0.3, maxTokens: 4096 },
    systemPrompt: 'Tu es un analyste de données. Tu interprètes les chiffres, identifies les tendances et présentes des recommandations actionnables.',
    features: ['Analyse données', 'Rapports', 'Visualisation', 'Prévisions'],
    price: 10,
    icon: '📊',
  },
  {
    id: 'template-support',
    name: 'Support Client',
    type: 'agent',
    description: 'Agent de support client automatisé. Gère les tickets, répond aux FAQs et escalade si nécessaire.',
    category: 'support',
    tags: ['support', 'customer', 'helpdesk'],
    config: { temperature: 0.5, maxTokens: 2048 },
    systemPrompt: 'Tu es un agent de support client professionnel, empathique et efficace. Tu résous les problèmes et assure la satisfaction client.',
    features: ['Tickets support', 'FAQ automatique', 'Escalade', 'Suivi client'],
    price: 0,
    icon: '🎧',
  },
  {
    id: 'template-sales',
    name: 'Commercial AI',
    type: 'agent',
    description: 'Agent commercial pour la prospection, les relances et la qualification de leads.',
    category: 'sales',
    tags: ['sales', 'prospecting', 'leads'],
    config: { temperature: 0.7, maxTokens: 3072 },
    systemPrompt: 'Tu es un commercial performant. Tu qualifies les leads, prépares les argumentaires et suis les opportunités avec méthode.',
    features: ['Prospection', 'Qualification leads', 'Relances', 'Argumentaires'],
    price: 15,
    icon: '📈',
  },
  {
    id: 'template-translator',
    name: 'Traducteur Multilingue',
    type: 'agent',
    description: 'Traduction professionnelle dans plus de 50 langues avec conservation du contexte et du ton.',
    category: 'general',
    tags: ['translation', 'languages', 'international'],
    config: { temperature: 0.3, maxTokens: 4096 },
    systemPrompt: 'Tu es un traducteur expert. Tu traduis en conservant le sens, le ton et les nuances culturelles du texte original.',
    features: ['50+ langues', 'Conservation du ton', 'Localisation', 'Relecture'],
    price: 0,
    icon: '🌐',
  },
  {
    id: 'template-social',
    name: 'Community Manager',
    type: 'agent',
    description: 'Gère les réseaux sociaux : planification, publication, engagement et analyse des performances.',
    category: 'marketing',
    tags: ['social', 'community', 'marketing'],
    config: { temperature: 0.8, maxTokens: 2048 },
    systemPrompt: 'Tu es un community manager créatif. Tu crées du contenu engageant, interagis avec la communauté et analyses les performances.',
    features: ['Planification', 'Rédaction posts', 'Engagement', 'Analytics'],
    price: 5,
    icon: '📱',
  },
  {
    id: 'template-recruiter',
    name: 'Recruteur HR',
    type: 'agent',
    description: 'Assiste le recrutement : rédaction d\'offres, présélection CV, préparation d\'entretiens.',
    category: 'hr',
    tags: ['hr', 'recruitment', 'hiring'],
    config: { temperature: 0.5, maxTokens: 3072 },
    systemPrompt: 'Tu es un recruteur professionnel. Tu analyses les CVs, prépares les entretiens et évalues les candidats objectivement.',
    features: ['Rédaction offres', 'Présélection CV', 'Questions entretien', 'Évaluation'],
    price: 0,
    icon: '👔',
  },
];

export function getTemplateById(id: string): AgentTemplate | undefined {
  return AGENT_TEMPLATES.find(t => t.id === id);
}

export function exportAgentToJson(template: AgentTemplate): string {
  return JSON.stringify({
    name: template.name,
    type: template.type,
    description: template.description,
    config: template.config,
    systemPrompt: template.systemPrompt,
    exportedAt: new Date().toISOString(),
    version: '1.0.0',
  }, null, 2);
}

export function parseImportedAgent(json: string): {
  name: string;
  type: string;
  description: string;
  config: Record<string, unknown>;
  systemPrompt: string;
} | null {
  try {
    const data = JSON.parse(json);
    if (!data.name || !data.systemPrompt) return null;
    return {
      name: data.name,
      type: data.type || 'agent',
      description: data.description || '',
      config: data.config || {},
      systemPrompt: data.systemPrompt,
    };
  } catch {
    return null;
  }
}
