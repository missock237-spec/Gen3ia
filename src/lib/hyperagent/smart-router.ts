/**
 * Smart Request Router - Module 1 of HyperAgent System
 *
 * Routes requests intelligently to avoid expensive LLM calls:
 * - Pattern matching for FAQ responses
 * - Simple vs complex query detection
 * - Provider selection based on latency/cost
 * - Cache hit optimization
 *
 * Goal: Handle 60% of requests without full LLM execution
 * Target Latency: <200ms for routed responses
 */

import { createLogger } from '@/lib/logger';

const log = createLogger('smart-router');

export type RequestComplexity = 'simple' | 'moderate' | 'complex';
export type ProviderPreference = 'fast' | 'balanced' | 'quality';

export interface RouteDecision {
  shouldRoute: boolean;
  directAnswer?: string;
  complexity: RequestComplexity;
  provider: ProviderPreference;
  cacheHit: boolean;
  routingTime: number;
}

export interface RouterConfig {
  enablePatternMatching: boolean;
  enableCacheCheck: boolean;
  complexityThreshold: number;
  faqDatabase?: Map<string, string>;
}

// FAQ Pattern Database
const FAQ_PATTERNS = new Map<string, string>([
  ['what is', 'I can provide information about topics you ask about.'],
  ['how to', 'I can guide you through procedures and processes.'],
  ['what are', 'I can list and explain different categories.'],
  ['why', 'I can explain reasoning and causes.'],
  ['tell me', 'I can share information and details.'],
  ['explain', 'I can break down complex concepts.'],
  ['compare', 'I can highlight differences and similarities.'],
  ['summarize', 'I can provide condensed versions of content.'],
  ['list', 'I can enumerate items and categories.'],
]);

// Complexity Keywords
const COMPLEXITY_INDICATORS = {
  simple: ['what', 'when', 'where', 'who', 'basic', 'simple', 'define', 'meaning'],
  moderate: ['how', 'why', 'analyze', 'compare', 'evaluate', 'discuss'],
  complex: ['synthesize', 'create', 'design', 'develop', 'optimize', 'architect', 'integrate', 'strategic'],
};

class SmartRouter {
  private config: RouterConfig;
  private requestCache: Map<string, { answer: string; timestamp: number }>;
  private routingMetrics = {
    totalRequests: 0,
    routed: 0,
    cached: 0,
    directAnswer: 0,
  };

  constructor(config: Partial<RouterConfig> = {}) {
    this.config = {
      enablePatternMatching: true,
      enableCacheCheck: true,
      complexityThreshold: 5,
      ...config,
    };
    this.requestCache = new Map();
  }

  /**
   * Main routing function - decides how to handle a request
   */
  async route(query: string, userId: string): Promise<RouteDecision> {
    const startTime = performance.now();
    this.routingMetrics.totalRequests++;

    // 1. Check cache first (fastest path)
    const cacheKey = `${userId}:${this.hashQuery(query)}`;
    const cachedResult = this.requestCache.get(cacheKey);
    if (cachedResult && Date.now() - cachedResult.timestamp < 3600000) {
      // 1 hour TTL
      const routingTime = performance.now() - startTime;
      this.routingMetrics.cached++;
      log.debug('cache_hit', { query: query.slice(0, 50), routingTime });
      return {
        shouldRoute: true,
        directAnswer: cachedResult.answer,
        complexity: 'simple',
        provider: 'fast',
        cacheHit: true,
        routingTime,
      };
    }

    // 2. Detect query complexity
    const complexity = this.detectComplexity(query);

    // 3. Pattern matching for FAQ
    if (this.config.enablePatternMatching && complexity === 'simple') {
      const faqAnswer = this.matchFAQPattern(query);
      if (faqAnswer) {
        const routingTime = performance.now() - startTime;
        this.routingMetrics.directAnswer++;
        this.requestCache.set(cacheKey, { answer: faqAnswer, timestamp: Date.now() });
        log.debug('faq_matched', { query: query.slice(0, 50), routingTime });
        return {
          shouldRoute: true,
          directAnswer: faqAnswer,
          complexity,
          provider: 'fast',
          cacheHit: false,
          routingTime,
        };
      }
    }

    // 4. Provider selection based on complexity and latency requirements
    const provider = this.selectProvider(complexity, query);

    // 5. Return routing decision
    const routingTime = performance.now() - startTime;
    log.debug('route_decision', { complexity, provider, routingTime });

    return {
      shouldRoute: false, // Need full LLM execution
      complexity,
      provider,
      cacheHit: false,
      routingTime,
    };
  }

  /**
   * Detect query complexity using keyword analysis
   */
  private detectComplexity(query: string): RequestComplexity {
    const queryLower = query.toLowerCase();
    let score = 0;

    // Count simple indicators
    for (const indicator of COMPLEXITY_INDICATORS.simple) {
      if (queryLower.includes(indicator)) score -= 2;
    }

    // Count moderate indicators
    for (const indicator of COMPLEXITY_INDICATORS.moderate) {
      if (queryLower.includes(indicator)) score += 2;
    }

    // Count complex indicators
    for (const indicator of COMPLEXITY_INDICATORS.complex) {
      if (queryLower.includes(indicator)) score += 5;
    }

    // Length factor (longer = more complex)
    const words = query.split(/\s+/).length;
    if (words > 50) score += 3;

    if (score <= -2) return 'simple';
    if (score <= 3) return 'moderate';
    return 'complex';
  }

  /**
   * Match query against FAQ patterns
   */
  private matchFAQPattern(query: string): string | null {
    const queryLower = query.toLowerCase();

    for (const [pattern, answer] of FAQ_PATTERNS.entries()) {
      if (queryLower.includes(pattern)) {
        return answer;
      }
    }

    return null;
  }

  /**
   * Select best provider based on complexity and requirements
   */
  private selectProvider(complexity: RequestComplexity, query: string): ProviderPreference {
    // Check if user is in a hurry (explicit time constraints)
    const urgencyKeywords = ['urgent', 'quick', 'fast', 'asap', 'immediately', 'now'];
    const isUrgent = urgencyKeywords.some(kw => query.toLowerCase().includes(kw));

    // Check if quality is critical
    const qualityKeywords = ['accurate', 'precise', 'detailed', 'thorough', 'important', 'critical'];
    const qualityNeeded = qualityKeywords.some(kw => query.toLowerCase().includes(kw));

    // Decision logic
    if (isUrgent) {
      return 'fast'; // Groq (ultra-fast)
    }

    if (complexity === 'simple') {
      return 'fast'; // Groq for simple queries
    }

    if (complexity === 'moderate') {
      return qualityNeeded ? 'balanced' : 'fast';
    }

    // Complex queries always use best quality
    return 'quality'; // Claude 3.5
  }

  /**
   * Hash query for cache key
   */
  private hashQuery(query: string): string {
    // Simple hash function (in production use crypto.subtle.digest)
    let hash = 0;
    for (let i = 0; i < query.length; i++) {
      const char = query.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(36);
  }

  /**
   * Cache a successful answer
   */
  cacheAnswer(query: string, userId: string, answer: string): void {
    const cacheKey = `${userId}:${this.hashQuery(query)}`;
    this.requestCache.set(cacheKey, { answer, timestamp: Date.now() });
  }

  /**
   * Get routing metrics
   */
  getMetrics() {
    const routtingRate = this.routingMetrics.totalRequests > 0
      ? ((this.routingMetrics.routed + this.routingMetrics.cached + this.routingMetrics.directAnswer) /
        this.routingMetrics.totalRequests) * 100
      : 0;

    return {
      ...this.routingMetrics,
      routingRate: `${routtingRate.toFixed(1)}%`,
      cacheSize: this.requestCache.size,
    };
  }

  /**
   * Clear old cache entries
   */
  pruneCache(maxAge: number = 86400000): void {
    // Default: 24 hours
    const now = Date.now();
    let pruned = 0;

    for (const [key, value] of this.requestCache.entries()) {
      if (now - value.timestamp > maxAge) {
        this.requestCache.delete(key);
        pruned++;
      }
    }

    log.info('cache_pruned', { pruned, remaining: this.requestCache.size });
  }
}

// Export singleton instance
export const smartRouter = new SmartRouter();

// Export class for testing
export { SmartRouter };
