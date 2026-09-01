/** Catalogue des compétences intégrées (injection dans les prompts d'agents). */

export interface BuiltInSkill {
  key: string
  name: string
  description: string
  category: string
}

export const BUILT_IN_SKILLS: BuiltInSkill[] = [
  {
    key: "skill-recherche-web",
    name: "Recherche web avancée",
    description: "Formule des requêtes efficaces, croise les sources et cite les origines.",
    category: "INFORMATION",
  },
  {
    key: "skill-redaction",
    name: "Rédaction structurée",
    description: "Produit des textes structurés (titres, sections, conclusions) adaptés au public.",
    category: "REDACTION",
  },
  {
    key: "skill-analyse-donnees",
    name: "Analyse de données",
    description: "Calcule des statistiques, détecte des tendances et synthétise des jeux de données.",
    category: "ANALYSE",
  },
  {
    key: "skill-traduction",
    name: "Traduction contextualisée",
    description: "Traduit en préservant le ton, les registres et les termes techniques.",
    category: "LANGUE",
  },
  {
    key: "skill-code-js",
    name: "Développement JavaScript",
    description: "Écrit, exécute et débogue du code JavaScript dans le bac à sable.",
    category: "TECHNIQUE",
  },
  {
    key: "skill-verification",
    name: "Vérification factuelle",
    description: "Contrôle les affirmations à partir de preuves et signale les incertitudes.",
    category: "QUALITE",
  },
]
