export const AGENT_TEMPLATES = [
  { id: "assistant-support", name: "Assistant Support Client", description: "Repond aux questions des clients via la base de connaissances", category: "customer-service", icon: "🎧", defaultPrompt: "Tu es un assistant support client expert. Sois poli, precis et professionnel.", defaultTools: ["search", "knowledge-base", "email"], defaultConfig: { maxIterations: 10, temperature: 0.3 }, estimatedSetupMinutes: 5 },
  { id: "redacteur-seo", name: "Redacteur SEO", description: "Redige des articles optimises SEO avec mots-cles et meta-descriptions", category: "content", icon: "✍️", defaultPrompt: "Tu es un redacteur SEO expert. Cree du contenu optimise.", defaultTools: ["search", "write", "analyze"], defaultConfig: { maxIterations: 15, temperature: 0.7 }, estimatedSetupMinutes: 3 },
  { id: "analyseur-donnees", name: "Analyseur de Donnees", description: "Analyse CSV/JSON et genere des rapports avec tendances", category: "data", icon: "📊", defaultPrompt: "Tu es un analyste de donnees expert.", defaultTools: ["read", "analyze", "code", "write"], defaultConfig: { maxIterations: 20, temperature: 0.2 }, estimatedSetupMinutes: 5 },
  { id: "assistant-recherche", name: "Assistant de Recherche", description: "Effectue des recherches approfondies et synthetise les infos", category: "research", icon: "🔬", defaultPrompt: "Tu es un assistant de recherche.", defaultTools: ["search", "browse", "extract", "write"], defaultConfig: { maxIterations: 25, temperature: 0.4 }, estimatedSetupMinutes: 3 },
  { id: "traducteur-relecteur", name: "Traducteur & Relecteur", description: "Traduit et relit des textes entre plusieurs langues", category: "content", icon: "🌐", defaultPrompt: "Tu es un traducteur professionnel.", defaultTools: ["read", "write", "analyze"], defaultConfig: { maxIterations: 8, temperature: 0.2 }, estimatedSetupMinutes: 2 },
  { id: "devops-monitoring", name: "Agent DevOps", description: "Surveille les logs, metriques et diagnostique les pannes", category: "devops", icon: "🔧", defaultPrompt: "Tu es un ingenieur DevOps senior.", defaultTools: ["code", "analyze", "search", "api_call"], defaultConfig: { maxIterations: 30, temperature: 0.3 }, estimatedSetupMinutes: 10 },
  { id: "generateur-code", name: "Generateur de Code", description: "Genere du code TS, Python ou autres a partir de specs", category: "development", icon: "💻", defaultPrompt: "Tu es un developpeur senior.", defaultTools: ["code", "write", "analyze"], defaultConfig: { maxIterations: 25, temperature: 0.3 }, estimatedSetupMinutes: 3 },
  { id: "assistant-juridique", name: "Assistant Juridique", description: "Analyse des contrats et documents juridiques", category: "legal", icon: "⚖️", defaultPrompt: "Tu es un assistant juridique specialise.", defaultTools: ["read", "analyze", "extract"], defaultConfig: { maxIterations: 20, temperature: 0.2 }, estimatedSetupMinutes: 5 },
];

export function getTemplateById(id) { return AGENT_TEMPLATES.find(t => t.id === id); }
export function getTemplatesByCategory(cat) { return AGENT_TEMPLATES.filter(t => t.category === cat); }
export function getCategories() {
  const cats = {};
  AGENT_TEMPLATES.forEach(t => { cats[t.category] = (cats[t.category] || 0) + 1; });
  const names = { "customer-service": "Service Client", content: "Contenu", data: "Donnees", research: "Recherche", devops: "DevOps", development: "Developpement", legal: "Juridique" };
  return Object.entries(cats).map(([id, count]) => ({ id, name: names[id] || id, count }));
}
