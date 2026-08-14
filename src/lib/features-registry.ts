// ============================================================
// Feature Registry — Source de vérité des fonctionnalités opérationnelles
//
// Chaque feature est déclarée avec son statut réel :
//   - 'prod'    : pleinement opérationnel
//   - 'beta'    : en cours, utilisable mais pas garantie
//   - 'mock'    : FAUX / simulé / stub — ne pas utiliser en prod
//   - 'disabled': désactivé par feature flag
//
// Ce registre alimente GET /api/health/features (public).
// ============================================================

export type FeatureStatus = 'prod' | 'beta' | 'mock' | 'disabled';

export interface Feature {
  id: string;
  name: string;
  description: string;
  status: FeatureStatus;
  /** Feature flag d'activation (variable d'env, ex: GEN3IA_ENABLE_COMPUTE) */
  flag?: string;
}

export const FEATURES: Feature[] = [
  // ============ COEUR ============
  { id: 'agents', name: 'Agents IA', description: 'Création et gestion des agents', status: 'prod' },
  { id: 'agents-chat', name: 'Chat avec agents', description: 'Conversation streaming avec les agents (SSE)', status: 'prod' },
  { id: 'ai-chat', name: 'Assistant IA', description: 'Chat global avec l\'assistant (router multi-modèle)', status: 'prod' },
  { id: 'ai-server', name: 'Serveur IA', description: 'Analyse, process, diagnose via LLM', status: 'prod' },
  { id: 'ai-orchestrate', name: 'Orchestrateur', description: 'Planification multi-agents', status: 'beta' },

  // ============ SANDBOX / EXÉCUTION ============
  { id: 'sandbox-js', name: 'Sandbox JavaScript', description: 'Exécution JS isolée (new Function / VM2)', status: 'prod' },
  { id: 'sandbox-python', name: 'Sandbox Python', description: 'Exécution Python via subprocess/Docker (détecté automatiquement)', status: 'beta' },
  { id: 'sandbox-simulated', name: 'Sandbox simulé', description: 'Exécution SIMULÉE (fallback sans runtime) — Ne pas utiliser en prod', status: 'mock', flag: 'GEN3IA_ENABLE_SIMULATED_SANDBOX' },

  // ============ MÉDIA ============
  { id: 'images-generate', name: 'Génération d\'images', description: 'Images via HuggingFace', status: 'prod' },
  { id: 'audio-generate', name: 'Génération audio', description: 'TTS via audio-generator', status: 'beta', flag: 'GEN3IA_ENABLE_AUDIO' },
  { id: 'video-generate', name: 'Génération vidéo', description: 'Vidéos via HuggingFace', status: 'mock', flag: 'GEN3IA_ENABLE_VIDEO' },
  { id: 'media-generate', name: 'Génération média', description: 'Images/vidéos via lib/media', status: 'mock', flag: 'GEN3IA_ENABLE_MEDIA' },

  // ============ MULTIMODAL ============
  { id: 'multimodal-vision', name: 'Vision IA', description: 'Analyse d\'images (détection, texte, scène)', status: 'beta' },
  { id: 'multimodal-screen', name: 'Partage écran', description: 'Traitement de frames écran', status: 'mock', flag: 'GEN3IA_ENABLE_SCREEN' },

  // ============ RAG / MÉMOIRE ============
  { id: 'rag', name: 'RAG', description: 'Recherche vectorielle + mémoire long-terme', status: 'beta', flag: 'GEN3IA_ENABLE_RAG' },

  // ============ WORKFLOWS ============
  { id: 'workflows', name: 'Workflows', description: 'CRUD + versioning + branches', status: 'prod' },
  { id: 'workflow-engine', name: 'Moteur de workflows', description: 'Exécution de blocs', status: 'beta' },

  // ============ COMMERCE ============
  { id: 'payments', name: 'Paiements (SubPay)', description: 'Mobile Money (MTN MoMo, Orange, Wave)', status: 'beta', flag: 'GEN3IA_ENABLE_PAYMENTS' },
  { id: 'billing', name: 'Billing', description: 'Factures, crédits, abonnement', status: 'beta' },
  { id: 'credits', name: 'Crédits', description: 'Solde et historique de crédits', status: 'prod' },

  // ============ MARKETPLACE ============
  { id: 'marketplace', name: 'Marketplace', description: 'Listing, achat, avis d\'agents', status: 'beta' },

  // ============ PLUGINS / SKILLS ============
  { id: 'plugins', name: 'Plugins', description: 'Plugin store', status: 'mock', flag: 'GEN3IA_ENABLE_PLUGINS' },
  { id: 'skills', name: 'Skills', description: 'Compétences agents', status: 'mock', flag: 'GEN3IA_ENABLE_SKILLS' },

  // ============ COMPUTE ============
  { id: 'compute', name: 'Compute engine', description: 'Calculs CPU/GPU (matrix, etc.)', status: 'mock', flag: 'GEN3IA_ENABLE_COMPUTE' },

  // ============ AUTRES ============
  { id: 'voice', name: 'Voice calls', description: 'Appels vocaux', status: 'mock', flag: 'GEN3IA_ENABLE_VOICE' },

  { id: 'affiliate', name: 'Affiliation', description: 'Programme de parrainage', status: 'beta' },
  { id: 'advertising', name: 'Publicité', description: 'Système de pubs avec récompenses', status: 'beta' },
  { id: 'doc-analyzer', name: 'Analyseur de Documents', description: 'Résumé, points clés, action items, entités, sentiment', status: 'active' },
  { id: 'business-calc', name: 'Calculateurs Business', description: 'Devises africaines, marges, prêts, TVA, ROI, prix optimal', status: 'active' },
  { id: 'meeting-notes', name: 'Notes de Réunion', description: 'Décisions, actions, participants, risques, prochaines étapes', status: 'active' },
  { id: 'advertiser-dashboard', name: 'Dashboard Annonceurs', description: 'Vue d'ensemble campagnes, performance, budget, A/B tests', status: 'active' },
  { id: 'translator', name: 'Traducteur Africain', description: 'Traduction 10 langues: FR, EN, Hausa, Yoruba, Igbo, Swahili, Wolof, Bambara, Lingala, Arabe', status: 'active' },
  { id: 'expense-tracker', name: 'Suivi Dépenses', description: 'Catégorisation, budgets, résumés mensuels en FCFA', status: 'active' },
  { id: 'pomodoro', name: 'Pomodoro Focus', description: 'Cycles 25min, pauses, statistiques de productivité', status: 'active' },
  { id: 'quick-notes', name: 'Notes Rapides', description: 'Notes taggées, recherche, épinglage, export/import', status: 'active' },
  { id: 'email-templates', name: 'Modèles Emails', description: '10 templates business FR/EN (devis, facture, réunion, proposition)', status: 'active' },
  { id: 'daily-planner', name: 'Planificateur Journée', description: 'Matrice Eisenhower, créneaux, score productivité', status: 'active' },
];

/**
 * Retourne seulement les features réellement opérationnelles,
 * en tenant compte des feature flags.
 */
export function getOperationalFeatures(): Feature[] {
  const isProd = process.env.NODE_ENV === 'production';
  return FEATURES.filter((f) => {
    // En production, on cache les features 'mock' non flaguées activement
    if (isProd && f.status === 'mock') {
      const flagOn = f.flag ? process.env[f.flag] === 'true' : false;
      return flagOn; // n'autorise un mock que si le flag est explicitement 'true'
    }
    return f.status !== 'disabled';
  });
}
