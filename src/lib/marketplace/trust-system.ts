// ============================================================
// MARKETPLACE TRUST SYSTEM — Badges, scores, sandbox tests
// Attribution automatique de badges, tests de templates
// ============================================================
import { db } from '@/lib/db';
import { createLogger } from '@/lib/logger';

const log = createLogger('marketplace-trust');

export type BadgeType = 'verified' | 'popular' | 'high_performance' | 'top_rated' | 'new' | 'pro' | 'community_choice';

export interface Badge {
  type: BadgeType;
  label: string;
  icon: string;
  color: string;
}

export interface SandboxTestResult {
  passed: boolean;
  checks: { name: string; passed: boolean; details?: string }[];
  score: number;
  executionTimeMs: number;
  errors: string[];
  warnings: string[];
}

const BADGE_DEFINITIONS: Record<BadgeType, Badge> = {
  verified: { type: 'verified', label: 'Verifie', icon: '✓', color: '#3b82f6' },
  popular: { type: 'popular', label: 'Populaire', icon: '🔥', color: '#f59e0b' },
  high_performance: { type: 'high_performance', label: 'Haute Performance', icon: '⚡', color: '#22c55e' },
  top_rated: { type: 'top_rated', label: 'Top Note', icon: '⭐', color: '#a855f7' },
  new: { type: 'new', label: 'Nouveau', icon: '🆕', color: '#06b6d4' },
  pro: { type: 'pro', label: 'Pro', icon: '💎', color: '#6366f1' },
  community_choice: { type: 'community_choice', label: 'Choix Communaute', icon: '👥', color: '#ec4899' },
};

export class MarketplaceTrustSystem {
  /**
   * Calcule et attribue les badges pour une annonce
   */
  async computeBadges(listingId: string): Promise<Badge[]> {
    const listing = await db.marketplaceListing.findUnique({
      where: { id: listingId },
      include: {
        _count: { select: { purchases: true, reviews: true } },
        reviews: { select: { rating: true } },
      },
    });
    if (!listing) throw new Error('Listing introuvable');

    const badges: Badge[] = [];
    const purchaseCount = listing._count?.purchases || 0;
    const reviewCount = listing._count?.reviews || 0;
    const avgRating = listing.rating || 0;

    // Badge Nouveau (moins de 7 jours)
    const ageDays = (Date.now() - new Date(listing.createdAt).getTime()) / 86400000;
    if (ageDays < 7) badges.push(BADGE_DEFINITIONS.new);

    // Badge Populaire (> 10 achats)
    if (purchaseCount >= 10) badges.push(BADGE_DEFINITIONS.popular);

    // Badge Top Note (>= 4.5 et >= 5 avis)
    if (avgRating >= 4.5 && reviewCount >= 5) badges.push(BADGE_DEFINITIONS.top_rated);

    // Badge Haute Performance (test automatique passe + score > 80)
    if (listing.autoTestStatus === 'passed') {
      const testResult = listing.autoTestResult ? JSON.parse(listing.autoTestResult) : null;
      if (testResult && testResult.score >= 80) {
        badges.push(BADGE_DEFINITIONS.high_performance);
      }
    }

    // Badge Verifie (test passe + note >= 4 + > 5 achats)
    if (listing.autoTestStatus === 'passed' && avgRating >= 4 && purchaseCount >= 5) {
      badges.push(BADGE_DEFINITIONS.verified);
    }

    // Badge Choix Communaute (> 20 achats et note >= 4)
    if (purchaseCount >= 20 && avgRating >= 4) {
      badges.push(BADGE_DEFINITIONS.community_choice);
    }

    // Badge Pro (prix > 0 et note >= 4.5)
    if (listing.price > 0 && avgRating >= 4.5) {
      badges.push(BADGE_DEFINITIONS.pro);
    }

    // Mettre a jour la liste des badges
    await db.marketplaceListing.update({
      where: { id: listingId },
      data: { badges: JSON.stringify(badges) },
    });

    log.info('badges_computed', { listingId, badgeCount: badges.length });
    return badges;
  }

  /**
   * Calcule le trust score (0-100)
   */
  async computeTrustScore(listingId: string): Promise<number> {
    const listing = await db.marketplaceListing.findUnique({
      where: { id: listingId },
      include: {
        _count: { select: { purchases: true, reviews: true } },
      },
    });
    if (!listing) return 0;

    let score = 0;
    const purchaseCount = listing._count?.purchases || 0;
    const reviewCount = listing._count?.reviews || 0;

    // Note (max 30 points)
    score += (listing.rating || 0) * 6; // 5*6 = 30

    // Achats (max 25 points)
    score += Math.min(purchaseCount * 2.5, 25);

    // Avis (max 15 points)
    score += Math.min(reviewCount * 3, 15);

    // Test automatique (max 20 points)
    if (listing.autoTestStatus === 'passed') score += 20;
    else if (listing.autoTestStatus === 'failed') score += 5;
    else score += 10;

    // Age (max 10 points, plus le temps passe plus c'est fiable)
    const ageDays = (Date.now() - new Date(listing.createdAt).getTime()) / 86400000;
    score += Math.min(ageDays * 0.5, 10);

    const finalScore = Math.round(Math.min(score, 100));

    await db.marketplaceListing.update({
      where: { id: listingId },
      data: { trustScore: finalScore },
    });

    return finalScore;
  }

  /**
   * Test automatique d'un template/agent dans un environnement sandboxe
   */
  async runSandboxTest(listingId: string): Promise<SandboxTestResult> {
    const listing = await db.marketplaceListing.findUnique({
      where: { id: listingId },
      include: { user: { select: { name: true } } },
    });
    if (!listing) throw new Error('Listing introuvable');

    const startTime = Date.now();
    const checks: { name: string; passed: boolean; details?: string }[] = [];
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check 1: Name validation
    const nameValid = listing.name.length >= 3 && listing.name.length <= 100;
    checks.push({ name: 'Validation du nom', passed: nameValid, details: listing.name.length + ' caracteres' });
    if (!nameValid) errors.push('Nom invalide (3-100 caracteres requis)');

    // Check 2: Description validation
    const descValid = (listing.description?.length || 0) >= 10;
    checks.push({ name: 'Description valide', passed: descValid, details: (listing.description?.length || 0) + ' caracteres' });
    if (!descValid) errors.push('Description trop courte (min 10 caracteres)');

    // Check 3: Config JSON validity
    let configValid = true;
    let configDetails = 'Config valide';
    try {
      const config = JSON.parse(listing.config || '{}');
      if (Object.keys(config).length === 0) {
        warnings.push('Configuration vide');
        configDetails = 'Config OK (vide)'; 
      }
    } catch {
      configValid = false;
      errors.push('Configuration JSON invalide');
      configDetails = 'JSON invalide';
    }
    checks.push({ name: 'Configuration valide', passed: configValid, details: configDetails });

    // Check 4: Agent check (if applicable)
    let agentValid = true;
    if (listing.agentId) {
      try {
        const agent = await db.agent.findUnique({ where: { id: listing.agentId }, select: { id: true, status: true, name: true } });
        if (!agent) {
          agentValid = false;
          errors.push('Agent reference introuvable');
        } else if (agent.status !== 'active') {
          warnings.push('Agent assigne mais inactif: ' + agent.status);
        }
        checks.push({ name: 'Agent reference valide', passed: agentValid, details: agent ? agent.name + ' (' + agent.status + ')' : 'Introuvable' });
      } catch {
        checks.push({ name: 'Agent reference valide', passed: false, details: 'Erreur de verification' });
      }
    } else {
      checks.push({ name: 'Agent reference', passed: true, details: 'Non applicable (listing ' + listing.type + ')' });
    }

    // Check 5: Type validation
    const validTypes = ['agent', 'tool', 'workflow', 'template', 'prompt', 'integration'];
    const typeValid = validTypes.includes(listing.type);
    checks.push({ name: 'Type valide', passed: typeValid, details: listing.type });
    if (!typeValid) errors.push('Type de listing invalide');

    // Check 6: Price validation
    const priceValid = listing.price >= 0;
    checks.push({ name: 'Prix valide', passed: priceValid, details: listing.price + ' FCFA' });

    // Calculate score
    const passedCount = checks.filter(c => c.passed).length;
    const score = Math.round((passedCount / checks.length) * 100);

    const executionTimeMs = Date.now() - startTime;

    const result: SandboxTestResult = {
      passed: errors.length === 0,
      checks,
      score,
      executionTimeMs,
      errors,
      warnings,
    };

    // Save test result
    const testStatus = result.passed ? 'passed' : 'failed';
    await db.marketplaceListing.update({
      where: { id: listingId },
      data: {
        autoTestStatus: testStatus,
        autoTestResult: JSON.stringify(result),
      },
    });

    // Compute badges and trust score after test
    if (result.passed) {
      await this.computeBadges(listingId);
      await this.computeTrustScore(listingId);
    }

    log.info('sandbox_test_completed', { listingId, passed: result.passed, score, errors: errors.length });
    return result;
  }

  /**
   * Test tous les listings sans test
   */
  async testAllPending(): Promise<{ tested: number; passed: number; failed: number }> {
    const pending = await db.marketplaceListing.findMany({
      where: { autoTestStatus: 'pending', status: 'published' },
      select: { id: true },
    });

    let passed = 0, failed = 0;
    for (const listing of pending) {
      try {
        const result = await this.runSandboxTest(listing.id);
        if (result.passed) passed++; else failed++;
      } catch { failed++; }
    }

    log.info('batch_test_completed', { total: pending.length, passed, failed });
    return { tested: pending.length, passed, failed };
  }

  /**
   * Recupere les badges interpretes
   */
  getBadgeDefinitions(): Record<BadgeType, Badge> {
    return BADGE_DEFINITIONS;
  }
}

export const marketplaceTrust = new MarketplaceTrustSystem();
export default marketplaceTrust;