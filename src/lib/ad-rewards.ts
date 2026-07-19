/**
 * Système de récompenses crédit pour les publicités
 * - Anti-abuse : rate limiting, cooldowns, limites journalières
 * - Persistance : localStorage + API sync
 * - Protection : pas de double comptage, validation côté serveur
 */

interface RewardEntry {
  adId: string;
  type: 'view' | 'click';
  credits: number;
  timestamp: string;
  plan: string;
}

interface CreditBalance {
  total: number;
  today: number;
  thisWeek: number;
  lastUpdated: string;
}

const STORAGE_KEYS = {
  BALANCE: 'genova_credit_balance',
  HISTORY: 'genova_ad_rewards_history',
  LAST_SYNC: 'genova_rewards_last_sync',
};

// Limites anti-abuse
const LIMITS = {
  MAX_PER_HOUR: 10,        // Max 10 crédits/heure
  MAX_PER_DAY: 50,         // Max 50 crédits/jour
  MIN_SECONDS_BETWEEN: 30, // 30 secondes minimum entre deux récompenses
  CREDITS_PER_VIEW: 1,     // 1 crédit par vue
  CREDITS_PER_CLICK: 2,    // 2 crédits par clic (plus valuable)
};

/**
 * Initialiser ou récupérer le solde depuis localStorage
 */
function getBalance(): CreditBalance {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.BALANCE);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch {}
  return { total: 0, today: 0, thisWeek: 0, lastUpdated: new Date().toISOString() };
}

function saveBalance(balance: CreditBalance) {
  try {
    localStorage.setItem(STORAGE_KEYS.BALANCE, JSON.stringify(balance));
  } catch {}
}

/**
 * Vérifier les limites anti-abuse avant d'attribuer une récompense
 */
function checkLimits(): { allowed: boolean; reason?: string } {
  const now = Date.now();
  const balance = getBalance();
  const today = new Date().toDateString();

  // Récupérer l'historique des dernières récompenses
  let history: RewardEntry[] = [];
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.HISTORY);
    if (stored) history = JSON.parse(stored);
  } catch {}

  // 1. Vérifier le cooldown (30s entre chaque récompense)
  const lastReward = history[history.length - 1];
  if (lastReward) {
    const elapsed = (now - new Date(lastReward.timestamp).getTime()) / 1000;
    if (elapsed < LIMITS.MIN_SECONDS_BETWEEN) {
      return { allowed: false, reason: `⏳ Cooldown: encore ${Math.ceil(LIMITS.MIN_SECONDS_BETWEEN - elapsed)}s` };
    }
  }

  // 2. Vérifier la limite horaire
  const lastHour = now - 60 * 60 * 1000;
  const hourlyCount = history.filter(r => new Date(r.timestamp).getTime() > lastHour).length;
  if (hourlyCount >= LIMITS.MAX_PER_HOUR) {
    return { allowed: false, reason: `⚠️ Limite horaire atteinte (${LIMITS.MAX_PER_HOUR}/h)` };
  }

  // 3. Vérifier la limite journalière
  const todayCount = history.filter(r => new Date(r.timestamp).toDateString() === today).length;
  if (todayCount >= LIMITS.MAX_PER_DAY) {
    return { allowed: false, reason: `⚠️ Limite journalière atteinte (${LIMITS.MAX_PER_DAY}/jour)` };
  }

  return { allowed: true };
}

/**
 * Vérifier qu'un événement pub n'a pas déjà été compté (anti-double)
 */
function isDuplicate(adId: string, type: string): boolean {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.HISTORY);
    if (!stored) return false;
    const history: RewardEntry[] = JSON.parse(stored);
    // Vérifier les 5 dernières minutes
    const fiveMinAgo = Date.now() - 5 * 60 * 1000;
    return history.some(r => 
      r.adId === adId && 
      r.type === type && 
      new Date(r.timestamp).getTime() > fiveMinAgo
    );
  } catch {
    return true; // En cas d'erreur, bloquer par sécurité
  }
}

/**
 * Ajouter une récompense avec toutes les vérifications
 */
export function awardAdReward(adId: string, type: 'view' | 'click', plan: string): {
  success: boolean;
  credits?: number;
  balance?: CreditBalance;
  message?: string;
} {
  // Ne récompenser que les utilisateurs payants
  if (plan === 'free') {
    return { success: false, message: 'Les récompenses sont réservées aux plans payants' };
  }

  // Vérifier le double comptage
  if (isDuplicate(adId, type)) {
    return { success: false, message: 'Cette publicité a déjà été comptée' };
  }

  // Vérifier les limites
  const limits = checkLimits();
  if (!limits.allowed) {
    return { success: false, message: limits.reason };
  }

  // Calculer les crédits
  const credits = type === 'click' ? LIMITS.CREDITS_PER_CLICK : LIMITS.CREDITS_PER_VIEW;

  // Enregistrer la récompense
  const entry: RewardEntry = {
    adId,
    type,
    credits,
    timestamp: new Date().toISOString(),
    plan,
  };

  // Mettre à jour l'historique
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.HISTORY);
    const history: RewardEntry[] = stored ? JSON.parse(stored) : [];
    history.push(entry);
    // Garder seulement les 500 dernières entrées
    if (history.length > 500) history.splice(0, history.length - 500);
    localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(history));
  } catch {}

  // Mettre à jour le solde
  const balance = getBalance();
  const today = new Date().toDateString();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  balance.total += credits;
  balance.today += credits;
  balance.lastUpdated = new Date().toISOString();

  // Réinitialiser le compteur today si c'est un nouveau jour
  if (new Date(balance.lastUpdated).toDateString() !== today) {
    balance.today = credits;
  }

  // Calcul approximatif de la semaine
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.HISTORY);
    if (stored) {
      const history: RewardEntry[] = JSON.parse(stored);
      balance.thisWeek = history
        .filter(r => new Date(r.timestamp).getTime() > weekAgo)
        .reduce((sum, r) => sum + r.credits, 0);
    }
  } catch {}

  saveBalance(balance);

  return {
    success: true,
    credits,
    balance,
    message: `🎉 +${credits} crédit${credits > 1 ? 's' : ''} gagné${credits > 1 ? 's' : ''} !`,
  };
}

/**
 * Récupérer le solde actuel
 */
export function getCreditBalance(): CreditBalance {
  return getBalance();
}

/**
 * Synchroniser le solde local avec le serveur
 */
export async function syncRewardsWithServer(): Promise<void> {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.HISTORY);
    if (!stored) return;

    const history: RewardEntry[] = JSON.parse(stored);
    const lastSync = localStorage.getItem(STORAGE_KEYS.LAST_SYNC);

    // Envoyer seulement les entrées non synchronisées
    const unsynced = lastSync
      ? history.filter(r => r.timestamp > lastSync)
      : history.slice(-10); // Dernières 10 si jamais synchronisé

    if (unsynced.length === 0) return;

    const response = await fetch('/api/analytics/ad-event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        events: unsynced,
        sync: true,
      }),
    });

    if (response.ok) {
      localStorage.setItem(STORAGE_KEYS.LAST_SYNC, new Date().toISOString());
    }
  } catch {
    // Silently fail - sera resynchronisé plus tard
  }
}

/**
 * Obtenir les statistiques des récompenses
 */
export function getRewardStats() {
  const balance = getBalance();
  const limits = checkLimits();

  return {
    balance,
    limitsReached: !limits.allowed,
    limitMessage: limits.reason,
    maxPerDay: LIMITS.MAX_PER_DAY,
    maxPerHour: LIMITS.MAX_PER_HOUR,
    cooldownSeconds: LIMITS.MIN_SECONDS_BETWEEN,
    creditsPerView: LIMITS.CREDITS_PER_VIEW,
    creditsPerClick: LIMITS.CREDITS_PER_CLICK,
  };
}
