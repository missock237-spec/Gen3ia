/**
 * Dynamic Model Adapter - Module 5 of HyperAgent System
 *
 * Selects optimal LLM based on query complexity, cost, and latency:
 * - Complexity scoring (1-10)
 * - Provider selection logic
 * - Cost tracking
 * - Learning from results
 *
 * Goal: 50% cost reduction by using appropriate models
 */

import { createLogger } from '@/lib/logger';

const log = createLogger('dynamic-model-adapter');

export type ModelProvider = 'groq' | 'grok' | 'claude-fast' | 'claude-pro';
export type QueryComplexity = 'trivial' | 'simple' | 'moderate' | 'complex' | 'expert';

export interface ModelConfig {
  provider: ModelProvider;
  model: string;
  costPerToken: number;
  avgLatencyMs: number;
  maxContextTokens: number;
}

export interface SelectionResult {
  provider: ModelProvider;
  model: string;
  complexity: QueryComplexity;
  estimatedCost: number;
  estimatedLatency: number;
}

class DynamicModelAdapter {
  private modelConfigs: Map<ModelProvider, ModelConfig> = new Map([
    [
      'groq',
      {
        provider: 'groq',
        model: 'mixtral-8x7b',
        costPerToken: 0.00001,
        avgLatencyMs: 500,
        maxContextTokens: 32000,
      },
    ],
    [
      'grok',
      {
        provider: 'grok',
        model: 'grok-1',
        costPerToken: 0.00005,
        avgLatencyMs: 800,
        maxContextTokens: 32000,
      },
    ],
    [
      'claude-fast',
      {
        provider: 'claude-fast',
        model: 'claude-3-haiku',
        costPerToken: 0.0008,
        avgLatencyMs: 1200,
        maxContextTokens: 200000,
      },
    ],
    [
      'claude-pro',
      {
        provider: 'claude-pro',
        model: 'claude-3.5-sonnet',
        costPerToken: 0.003,
        avgLatencyMs: 2000,
        maxContextTokens: 200000,
      },
    ],
  ]);

  private metrics = {
    totalSelections: 0,
    costSavings: 0,
    accuracyByModel: new Map<ModelProvider, { correct: number; total: number }>(),
  };

  /**
   * Select optimal model for query
   */
  selectModel(query: string, budgetConstraint?: number): SelectionResult {
    const complexity = this.scoreComplexity(query);
    const tokenEstimate = Math.ceil(query.length / 4);

    let selectedProvider: ModelProvider;

    switch (complexity) {
      case 'trivial':
      case 'simple':
        selectedProvider = 'groq'; // Fastest + cheapest
        break;
      case 'moderate':
        selectedProvider = budgetConstraint ? 'groq' : 'grok';
        break;
      case 'complex':
        selectedProvider = 'claude-fast';
        break;
      case 'expert':
        selectedProvider = 'claude-pro'; // Best quality
        break;
      default:
        selectedProvider = 'grok';
    }

    // If budget constraint, consider cheaper option
    if (budgetConstraint) {
      const selected = this.modelConfigs.get(selectedProvider)!;
      const estimatedCost = tokenEstimate * selected.costPerToken;
      if (estimatedCost > budgetConstraint && selectedProvider !== 'groq') {
        selectedProvider = 'groq';
      }
    }

    const config = this.modelConfigs.get(selectedProvider)!;
    const estimatedCost = tokenEstimate * config.costPerToken;
    const estimatedLatency = config.avgLatencyMs;

    this.metrics.totalSelections++;

    log.info('model_selected', {
      provider: selectedProvider,
      complexity,
      estimatedCost: estimatedCost.toFixed(4),
      estimatedLatency,
    });

    return {
      provider: selectedProvider,
      model: config.model,
      complexity,
      estimatedCost,
      estimatedLatency,
    };
  }

  /**
   * Score query complexity (1-10)
   */
  private scoreComplexity(query: string): QueryComplexity {
    let score = 0;

    // Length factor
    const words = query.split(/\s+/).length;
    if (words < 5) score += 1;
    else if (words < 20) score += 2;
    else if (words < 50) score += 3;
    else score += 4;

    // Keyword analysis
    const trivialKeywords = ['what', 'when', 'where', 'who', 'definition'];
    const simpleKeywords = ['how', 'why', 'list', 'explain'];
    const moderateKeywords = ['compare', 'analyze', 'evaluate', 'design'];
    const complexKeywords = ['synthesize', 'integrate', 'optimize', 'architect'];
    const expertKeywords = ['create novel', 'innovative solution', 'breakthrough'];

    const queryLower = query.toLowerCase();
    if (expertKeywords.some(kw => queryLower.includes(kw))) score += 10;
    else if (complexKeywords.some(kw => queryLower.includes(kw))) score += 7;
    else if (moderateKeywords.some(kw => queryLower.includes(kw))) score += 4;
    else if (simpleKeywords.some(kw => queryLower.includes(kw))) score += 2;
    else if (trivialKeywords.some(kw => queryLower.includes(kw))) score += 1;

    // Special characters (code, math) = more complex
    if (/[{}()\[\]|<>=+\-*/]/.test(query)) score += 2;

    if (score <= 2) return 'trivial';
    if (score <= 4) return 'simple';
    if (score <= 7) return 'moderate';
    if (score <= 10) return 'complex';
    return 'expert';
  }

  /**
   * Track model performance
   */
  trackResult(provider: ModelProvider, success: boolean): void {
    if (!this.metrics.accuracyByModel.has(provider)) {
      this.metrics.accuracyByModel.set(provider, { correct: 0, total: 0 });
    }

    const stats = this.metrics.accuracyByModel.get(provider)!;
    stats.total++;
    if (success) stats.correct++;
  }

  getMetrics() {
    const accuracyMap = new Map<ModelProvider, string>();
    for (const [provider, stats] of this.metrics.accuracyByModel.entries()) {
      const accuracy = ((stats.correct / stats.total) * 100).toFixed(1);
      accuracyMap.set(provider, `${accuracy}%`);
    }

    return {
      totalSelections: this.metrics.totalSelections,
      estimatedCostSavings: `$${this.metrics.costSavings.toFixed(4)}`,
      modelAccuracy: Object.fromEntries(accuracyMap),
    };
  }
}

export const dynamicModelAdapter = new DynamicModelAdapter();
export { DynamicModelAdapter };
