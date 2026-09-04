/**
 * Bibliothèque de workflows (v4.1 — captures runable.com/workflows).
 *
 * Catalogue de modèles de tâches prêts à l'emploi, organisés par
 * catégories avec épinglage (pins) par utilisateur. Chaque workflow
 * pré-remplit la barre de saisie enrichie du Task Center — la demande
 * traverse ensuite le pipeline complet GEN3IA (analyse, 5 plans,
 * exécution multi-outils, vérification).
 *
 * Catalogue versionné en code (comme TOOL_CATALOG) : curaté, testé,
 * bilingue. Les épingles sont persistées en base (WorkflowPin).
 */

export type WorkflowCategory =
  | "CAREER"
  | "MARKETING"
  | "ENGINEERING"
  | "RESEARCH"
  | "WRITING"
  | "DATA"

export interface WorkflowTemplate {
  key: string
  category: WorkflowCategory
  icon: string // clé d'icône lucide (résolue côté UI)
  title: { fr: string; en: string }
  description: { fr: string; en: string }
  /** Prompt injecté dans la barre de saisie (langue du compte). */
  prompt: { fr: string; en: string }
  /** Outils typiquement mobilisés (informatif). */
  tools: string[]
}

export const WORKFLOW_CATALOG: WorkflowTemplate[] = [
  // ── Carrière (captures 2-3) ──
  {
    key: "resume-editor",
    category: "CAREER",
    icon: "file-check",
    title: { fr: "Éditeur de CV", en: "Resume editor" },
    description: {
      fr: "Importez un CV (PDF) ou un lien Google Docs et obtenez une version professionnelle prête pour les recruteurs.",
      en: "Upload a resume or provide a Google Docs link to get a professional, recruiter-ready version.",
    },
    prompt: {
      fr: "Analyse et améliore mon CV importé en pièce jointe : structure, verbes d'action, résultats quantifiés, compatibilité ATS, puis produis la version retravaillée complète.",
      en: "Analyze and improve my uploaded resume: structure, action verbs, quantified results, ATS compatibility, then produce the full reworked version.",
    },
    tools: ["knowledge_search", "web_search"],
  },
  {
    key: "cover-letter",
    category: "CAREER",
    icon: "mail",
    title: { fr: "Générateur de lettre de motivation", en: "Cover letter generator" },
    description: {
      fr: "Importez un CV, collez une offre d'emploi et générez une lettre de motivation personnalisée et convaincante.",
      en: "Upload a resume, paste a job description, and generate a tailored, convincing cover letter.",
    },
    prompt: {
      fr: "Rédige une lettre de motivation personnalisée à partir de mon CV importé et de l'offre d'emploi suivante : [collez l'offre]. Ton professionnel, structure AIDA, maximum une page.",
      en: "Write a tailored cover letter from my uploaded resume and this job posting: [paste posting]. Professional tone, AIDA structure, one page max.",
    },
    tools: ["knowledge_search"],
  },
  {
    key: "interview-prep",
    category: "CAREER",
    icon: "briefcase",
    title: { fr: "Préparation d'entretien", en: "Interview prep" },
    description: {
      fr: "Préparez vos entretiens : questions techniques spécifiques à l'entreprise, études de cas et comportemental.",
      en: "Prepare for interviews with company-specific technical questions, case studies, and behavioral prompts.",
    },
    prompt: {
      fr: "Prépare-moi à un entretien pour le poste de [poste] chez [entreprise] : questions techniques probables, études de cas, questions comportementales (STAR), et 5 questions à poser au recruteur.",
      en: "Prepare me for an interview for the [role] position at [company]: likely technical questions, case studies, behavioral questions (STAR), and 5 questions to ask the recruiter.",
    },
    tools: ["web_search", "page_reader"],
  },
  {
    key: "scholarship-finder",
    category: "CAREER",
    icon: "timer",
    title: { fr: "Bourses et fellowships", en: "Scholarship and fellowship finder" },
    description: {
      fr: "Importez un CV et recevez un tableau concis des bourses et fellowships pertinents, avec échéances.",
      en: "Upload a resume or CV and get a concise table of relevant scholarships and fellowships with deadlines.",
    },
    prompt: {
      fr: "À partir de mon CV importé, trouve les bourses et fellowships les plus pertinents pour mon profil et présente-les en tableau : nom, montant, échéance, critères, lien officiel.",
      en: "From my uploaded CV, find the most relevant scholarships and fellowships for my profile and present them in a table: name, amount, deadline, criteria, official link.",
    },
    tools: ["web_search", "knowledge_search"],
  },
  {
    key: "alumni-finder",
    category: "CAREER",
    icon: "graduation-cap",
    title: { fr: "Recherche d'alumni", en: "Alumni finder" },
    description: {
      fr: "Trouvez et vérifiez des alumni de votre école travaillant dans des entreprises cibles (LinkedIn).",
      en: "Find and verify alumni from your school who currently work at target companies on LinkedIn.",
    },
    prompt: {
      fr: "Identifie les alumni de [école] travaillant chez [entreprises cibles] : noms, postes, parcours, point d'entrée pertinent pour une mise en relation professionnelle.",
      en: "Identify alumni from [school] working at [target companies]: names, roles, background, relevant entry point for professional outreach.",
    },
    tools: ["web_search", "page_reader"],
  },

  // ── Marketing / publicité (capture 2) ──
  {
    key: "brand-story",
    category: "MARKETING",
    icon: "play-circle",
    title: { fr: "Brand story", en: "Brand story" },
    description: {
      fr: "Générez une narration de marque et un storyboard vidéo qui raconte l'histoire de votre marque.",
      en: "Generate an AI video script that tells your brand story with a full storyboard.",
    },
    prompt: {
      fr: "Crée l'histoire de ma marque [marque] : narratif fondateur, valeurs, ton de voix, puis un storyboard vidéo en 6 scènes (visuel, voix off, texte à l'écran, durée).",
      en: "Create my brand [brand] story: founding narrative, values, tone of voice, then a 6-scene video storyboard (visual, voiceover, on-screen text, duration).",
    },
    tools: ["web_search"],
  },
  {
    key: "ads-creative-pack",
    category: "MARKETING",
    icon: "megaphone",
    title: { fr: "Pack créatif publicitaire", en: "Ads creative pack" },
    description: {
      fr: "Générez 5 variantes d'annonces (accroches, visuels, CTA) pour Meta/Google/TikTok et testez-les.",
      en: "Generate 5 ad variants (hooks, visuals, CTAs) for Meta/Google/TikTok and plan A/B tests.",
    },
    prompt: {
      fr: "Pour mon produit [produit] ciblant [audience], génère 5 variantes publicitaires : accroche, promesse, visuel suggéré, CTA, puis un plan de test A/B (budget, durée, KPI).",
      en: "For my product [product] targeting [audience], generate 5 ad variants: hook, promise, suggested visual, CTA, then an A/B test plan (budget, duration, KPI).",
    },
    tools: ["web_search"],
  },

  // ── Ingénierie (capture 4) ──
  {
    key: "eng-weekly-review",
    category: "ENGINEERING",
    icon: "code",
    title: { fr: "Revue hebdo ingénierie", en: "Engineering weekly review" },
    description: {
      fr: "Consolidez travaux livrés, incidents, bugs, risques de livraison et charge de l'équipe en une revue unique.",
      en: "Connect shipped work, incidents, bugs, delivery risk, and team load into one review.",
    },
    prompt: {
      fr: "Consolide la revue hebdomadaire de mon équipe à partir des données connectées (GitHub, tickets) : livré, incidents, bugs ouverts, risques de livraison, charge par personne, actions pour la semaine suivante.",
      en: "Compile my team's weekly review from connected data (GitHub, tickets): shipped, incidents, open bugs, delivery risks, per-person load, actions for next week.",
    },
    tools: ["connector_github", "web_search"],
  },
  {
    key: "pr-review-digest",
    category: "ENGINEERING",
    icon: "git-pull-request",
    title: { fr: "Digest de revue de PR", en: "Pull request review digest" },
    description: {
      fr: "Résumez les PR ouvertes, bloqueurs de revue, propriétaires, risques et le chemin le plus rapide pour merger.",
      en: "Summarize open pull requests, review blockers, owners, risk, and the fastest path to merge.",
    },
    prompt: {
      fr: "Analyse les pull requests ouvertes du dépôt connecté : résumé par PR, bloqueurs de revue, propriétaires, niveau de risque et chemin le plus rapide vers la fusion.",
      en: "Analyze the connected repository's open pull requests: per-PR summary, review blockers, owners, risk level, and fastest path to merge.",
    },
    tools: ["connector_github"],
  },
  {
    key: "bug-postmortem",
    category: "ENGINEERING",
    icon: "bug",
    title: { fr: "Post-mortem d'incident", en: "Bug post-mortem" },
    description: {
      fr: "Générez un post-mortem structuré (timeline, cause racine, actions correctives) à partir des logs et tickets.",
      en: "Generate a structured post-mortem (timeline, root cause, corrective actions) from logs and tickets.",
    },
    prompt: {
      fr: "Rédige le post-mortem de l'incident [description] : chronologie, cause racine (5 pourquoi), impact, actions correctives immédiates et préventives, propriétaires.",
      en: "Write the post-mortem for incident [description]: timeline, root cause (5 whys), impact, immediate and preventive corrective actions, owners.",
    },
    tools: ["terminal", "write_file"],
  },

  // ── Recherche / présentation (capture 4) ──
  {
    key: "research-deck",
    category: "RESEARCH",
    icon: "presentation",
    title: { fr: "Recherche → présentation", en: "Research any topic → deck" },
    description: {
      fr: "Recherchez n'importe quel sujet, distillez les idées clés et obtenez une présentation soignée.",
      en: "Research any topic, distill the key insights, and get back a polished presentation.",
    },
    prompt: {
      fr: "Recherche le sujet [sujet] en profondeur, distille les idées clés et produis un plan de présentation complet (10 diapositives : titre, messages, données, sources).",
      en: "Research the topic [topic] in depth, distill key insights, and produce a full presentation outline (10 slides: title, messages, data, sources).",
    },
    tools: ["web_search", "page_reader", "write_file"],
  },
  {
    key: "competitor-watch",
    category: "RESEARCH",
    icon: "radar",
    title: { fr: "Veille concurrentielle", en: "Competitor watch" },
    description: {
      fr: "Analysez 3 concurrents : positionnement, tarifs, fonctionnalités, communication — tableau comparatif.",
      en: "Analyze 3 competitors: positioning, pricing, features, messaging — comparative table.",
    },
    prompt: {
      fr: "Réalise une veille concurrentielle sur [secteur] : 3 concurrents directs, positionnement, tarification, fonctionnalités clés, communication, et opportunités différenciantes pour nous.",
      en: "Run a competitor watch on [industry]: 3 direct competitors, positioning, pricing, key features, messaging, and differentiating opportunities for us.",
    },
    tools: ["web_search", "page_reader"],
  },

  // ── Rédaction ──
  {
    key: "weekly-digest",
    category: "WRITING",
    icon: "newspaper",
    title: { fr: "Digest hebdomadaire personnalisé", en: "Personalized weekly digest" },
    description: {
      fr: "Recevez un résumé des actualités de vos sujets surveillés, classées par importance pour vous.",
      en: "Get a summary of news from your tracked topics, ranked by relevance to you.",
    },
    prompt: {
      fr: "Compile le digest hebdomadaire de mes sujets [sujets] : 10 actualités majeures classées par importance, avec source, résumé en 2 phrases et implication pour mon activité.",
      en: "Compile the weekly digest of my topics [topics]: 10 major news items ranked by importance, with source, 2-sentence summary, and implication for my business.",
    },
    tools: ["web_search", "memory_recall"],
  },
  {
    key: "doc-summarizer",
    category: "WRITING",
    icon: "file-text",
    title: { fr: "Synthèse de documents", en: "Document summarizer" },
    description: {
      fr: "Importez des PDF (rapports, contrats, études) et obtenez une synthèse structurée avec points d'attention.",
      en: "Import PDFs (reports, contracts, studies) and get a structured summary with key attention points.",
    },
    prompt: {
      fr: "Synthétise les documents importés en pièce jointe : résumé exécutif, points clés par document, points d'attention (risques, échéances, chiffres), et recommandations.",
      en: "Summarize the attached documents: executive summary, key points per document, attention points (risks, deadlines, figures), and recommendations.",
    },
    tools: ["knowledge_search"],
  },

  // ── Données ──
  {
    key: "csv-insights",
    category: "DATA",
    icon: "bar-chart-3",
    title: { fr: "Analyse de données CSV", en: "CSV data insights" },
    description: {
      fr: "Importez un CSV et obtenez statistiques descriptives, anomalies, tendances et graphiques.",
      en: "Upload a CSV and get descriptive statistics, anomalies, trends, and charts.",
    },
    prompt: {
      fr: "Analyse le fichier CSV importé : statistiques descriptives par colonne, valeurs manquantes, anomalies, corrélations notables, tendances, et 3 graphiques recommandés.",
      en: "Analyze the uploaded CSV: per-column descriptive stats, missing values, anomalies, notable correlations, trends, and 3 recommended charts.",
    },
    tools: ["code_runner", "write_file"],
  },
  {
    key: "sql-assistant",
    category: "DATA",
    icon: "database",
    title: { fr: "Assistant SQL", en: "SQL assistant" },
    description: {
      fr: "Décrivez votre besoin, obtenez la requête SQL optimisée et son explication ligne par ligne.",
      en: "Describe your need, get the optimized SQL query with a line-by-line explanation.",
    },
    prompt: {
      fr: "Écris la requête SQL répondant à ce besoin : [description du besoin]. Schéma des tables : [schéma]. Fournis la requête optimisée + explication ligne par ligne + index recommandés.",
      en: "Write the SQL query for this need: [need description]. Table schema: [schema]. Provide the optimized query + line-by-line explanation + recommended indexes.",
    },
    tools: ["code_runner", "write_file"],
  },
]

export const WORKFLOW_CATEGORIES: Array<{ key: WorkflowCategory; label: { fr: string; en: string } }> = [
  { key: "CAREER", label: { fr: "Carrière", en: "Career" } },
  { key: "MARKETING", label: { fr: "Marketing et vidéos publicitaires", en: "Ads and marketing videos" } },
  { key: "ENGINEERING", label: { fr: "Ingénierie", en: "Engineering" } },
  { key: "RESEARCH", label: { fr: "Recherche et présentations", en: "Research and presentations" } },
  { key: "WRITING", label: { fr: "Rédaction", en: "Writing" } },
  { key: "DATA", label: { fr: "Données", en: "Data" } },
]

export function findWorkflow(key: string): WorkflowTemplate | undefined {
  return WORKFLOW_CATALOG.find((w) => w.key === key)
}
