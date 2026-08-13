// ============================================================
// HYPERAGENT — Main Orchestrator
// Architecture à 4 Piliers:
//   1. Smart Router (< 50ms) — Detect complexity, choose provider, check cache
//   2. Context Optimizer (< 100ms) — Compress context, extract key info, reuse embeddings
//   3. Parallel Executor (< 500ms) — Multi-agent parallel, streaming, timeout handling
//   4. Response Enhancer (< 100ms) — Post-process, merge, explain, cache
// Total Target: < 750ms
//
// 8 Modules:
//   Module 1: Smart Request Router
//   Module 2: Context Compression Engine
//   Module 3: Parallel Multi-Agent Execution
//   Module 4: Speculative Execution
//   Module 5: Dynamic Model Adaptation
//   Module 6: Embedding Cache & Reuse
//   Module 7: Intelligent Fallback & Timeout Management
//   Module 8: Response Enhancement Pipeline
// ============================================================

import { SmartRouter, getSmartRouter, type RouterRequest, type RouterDecision } from './smart-router';
import { ContextCompressor, getContextCompressor, type CompressibleMessage, type CompressionOptions } from './context-compressor';
import { ParallelExecutor, getParallelExecutor, type AgentTask, type AgentResult, type ParallelExecutionOptions } from './parallel-executor';
import { SpeculativeExecutor, getSpeculativeExecutor, type SpeculativeResult } from './speculative-execution';
import { DynamicModelAdapter, getDynamicModelAdapter, type ModelSelection, type ExecutionRecord } from './dynamic-model';
import { EmbeddingCache, getEmbeddingCache } from './embedding-cache';
import { FallbackManager, getFallbackManager, type FallbackOptions } from './fallback-manager';
import { ResponseEnhancer, getResponseEnhancer, type EnhancedResponse, type EnhancementOptions } from './response-enhancer';
import { createAIRouter } from '@/lib/ai-router';
import { createLogger } from '@/lib/logger';

const log = createLogger('hyperagent');

// ============================================================
// TYPES
// ============================================================

export interface HyperAgentRequest {
  query: string;
  userId?: string;
  agentIds?: string[];
  context?: CompressibleMessage[];
  options?: HyperAgentOptions;
}

export interface HyperAgentOptions {
  latencyRequirement?: 'fast' | 'balanced' | 'quality';
  budgetTokens?: number;
  preferredProvider?: string;
  enableSpeculative?: boolean;
  enableParallel?: boolean;
  enableCompression?: boolean;
  enableEnhancement?: boolean;
  enableFallback?: boolean;
  maxConcurrency?: number;
  streamingCallback?: (chunk: string) => void;
}

export interface HyperAgentResponse {
  content: string;
  confidence: number;
  provider: string;
  model: string;
  latencyMs: number;
  tokensUsed: number;
  costUsd: number;
  cached: boolean;
  speculative: boolean;
  enhanced: boolean;
  citations: Array<{ source: string; type: string; relevance: number; excerpt: string }>;
  explanation: string;
  verificationStatus: string;
  metadata: {
    routingDecision: RouterDecision;
    compressionRatio?: number;
    agentsExecuted?: number;
    fallbackUsed: boolean;
    pilierTimings: {
      routing: number;
      compression: number;
      execution: number;
      enhancement: number;
      total: number;
    };
  };
}

export interface HyperAgentMetrics {
  totalRequests: number;
  avgLatencyMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  cacheHitRate: string;
  speculativeHitRate: string;
  avgCompressionRatio: string;
  avgTokensPerRequest: number;
  avgCostPerRequest: string;
  successRate: string;
  moduleMetrics: {
    smartRouter: Record<string, unknown>;
    contextCompressor: Record<string, unknown>;
    parallelExecutor: Record<string, unknown>;
    speculativeExecutor: Record<string, unknown>;
    dynamicModel: Record<string, unknown>;
    embeddingCache: Record<string, unknown>;
    fallbackManager: Record<string, unknown>;
    responseEnhancer: Record<string, unknown>;
  };
}

// ============================================================
// LATENCY TRACKER
// ============================================================

class LatencyTracker {
  private latencies: number[] = [];
  private maxSamples: number = 1000;

  record(latencyMs: number): void {
    this.latencies.push(latencyMs);
    if (this.latencies.length > this.maxSamples) {
      this.latencies.shift();
    }
  }

  getPercentile(p: number): number {
    if (this.latencies.length === 0) return 0;
    const sorted = [...this.latencies].sort((a, b) => a - b);
    const idx = Math.floor(sorted.length * p / 100);
    return sorted[Math.min(idx, sorted.length - 1)]!;
  }

  getAverage(): number {
    if (this.latencies.length === 0) return 0;
    return this.latencies.reduce((sum, l) => sum + l, 0) / this.latencies.length;
  }
}

// ============================================================
// HYPERAGENT — Main Orchestrator
// ============================================================

export class HyperAgent {
  private smartRouter: SmartRouter;
  private contextCompressor: ContextCompressor;
  private parallelExecutor: ParallelExecutor;
  private speculativeExecutor: SpeculativeExecutor;
  private dynamicModelAdapter: DynamicModelAdapter;
  private embeddingCache: EmbeddingCache;
  private fallbackManager: FallbackManager;
  private responseEnhancer: ResponseEnhancer;
  private latencyTracker: LatencyTracker;

  private metrics = {
    totalRequests: 0,
    totalTokensUsed: 0,
    totalCostUsd: 0,
    successCount: 0,
    failureCount: 0,
  };

  constructor() {
    this.smartRouter = getSmartRouter();
    this.contextCompressor = getContextCompressor();
    this.parallelExecutor = getParallelExecutor();
    this.speculativeExecutor = getSpeculativeExecutor();
    this.dynamicModelAdapter = getDynamicModelAdapter();
    this.embeddingCache = getEmbeddingCache();
    this.fallbackManager = getFallbackManager();
    this.responseEnhancer = getResponseEnhancer();
    this.latencyTracker = new LatencyTracker();
  }

  /**
   * Process a request through the HyperAgent pipeline
   * Target: < 750ms total latency
   *
   * Pipeline:
   * 1. Smart Router (< 50ms) — Check cache, detect complexity, route
   * 2. Context Optimizer (< 100ms) — Compress context, reuse embeddings
   * 3. Parallel Executor (< 500ms) — Execute agents, handle timeouts
   * 4. Response Enhancer (< 100ms) — Verify, cite, explain, cache
   */
  async process(request: HyperAgentRequest): Promise<HyperAgentResponse> {
    const totalStartTime = Date.now();
    this.metrics.totalRequests++;

    const timings = {
      routing: 0,
      compression: 0,
      execution: 0,
      enhancement: 0,
      total: 0,
    };

    try {
      // ============================================================
      // PILIER 1: Smart Router (< 50ms)
      // ============================================================
      const routingStart = Date.now();

      // Check speculative cache first
      let speculativeResult: SpeculativeResult | null = null;
      if (request.options?.enableSpeculative !== false) {
        speculativeResult = await this.speculativeExecutor.speculate(request.query);
      }

      // Route the request
      const routingDecision = await this.smartRouter.route({
        query: request.query,
        userId: request.userId,
        context: request.context?.map(m => m.content),
        preferredProvider: request.options?.preferredProvider,
        budgetTokens: request.options?.budgetTokens,
        latencyRequirement: request.options?.latencyRequirement,
      });

      timings.routing = Date.now() - routingStart;

      // If cache/FAQ hit, return immediately
      if (routingDecision.canDirectAnswer && routingDecision.directAnswer) {
        const totalLatency = Date.now() - totalStartTime;
        this.latencyTracker.record(totalLatency);
        this.metrics.successCount++;

        return {
          content: routingDecision.directAnswer,
          confidence: 0.95,
          provider: routingDecision.provider,
          model: routingDecision.model,
          latencyMs: totalLatency,
          tokensUsed: 0,
          costUsd: 0,
          cached: routingDecision.cacheHit,
          speculative: false,
          enhanced: false,
          citations: [],
          explanation: 'Réponse issue du cache ou du FAQ.',
          verificationStatus: 'verified',
          metadata: {
            routingDecision,
            fallbackUsed: false,
            pilierTimings: { ...timings, total: totalLatency },
          },
        };
      }

      // If speculative hit, return immediately
      if (speculativeResult?.hit && speculativeResult.prediction) {
        const totalLatency = Date.now() - totalStartTime;
        this.latencyTracker.record(totalLatency);
        this.metrics.successCount++;

        return {
          content: speculativeResult.prediction.predictedAnswer,
          confidence: speculativeResult.confidence,
          provider: 'speculative',
          model: 'speculative',
          latencyMs: totalLatency,
          tokensUsed: 0,
          costUsd: 0,
          cached: false,
          speculative: true,
          enhanced: false,
          citations: [],
          explanation: 'Réponse prédite par le système spéculatif.',
          verificationStatus: 'partially_verified',
          metadata: {
            routingDecision,
            fallbackUsed: false,
            pilierTimings: { ...timings, total: totalLatency },
          },
        };
      }

      // ============================================================
      // PILIER 2: Context Optimizer (< 100ms)
      // ============================================================
      const compressionStart = Date.now();

      let compressedContext: CompressibleMessage[] = request.context || [];
      let compressionRatio = 1;

      if (request.options?.enableCompression !== false && request.context && request.context.length > 0) {
        const compressionResult = await this.contextCompressor.compress(request.context, {
          maxTokens: 4000,
          queryRelevance: request.query,
          compressionLevel: routingDecision.complexity === 'simple' ? 'light' : routingDecision.complexity === 'expert' ? 'aggressive' : 'medium',
        });

        compressedContext = compressionResult.compressed;
        compressionRatio = compressionResult.compressionRatio;
      }

      // Get embedding cache for context
      const embeddingResults = await Promise.all(
        compressedContext.slice(0, 5).map(msg =>
          this.embeddingCache.getOrCompute(msg.content, request.userId)
        )
      );

      timings.compression = Date.now() - compressionStart;

      // ============================================================
      // PILIER 3: Parallel Executor (< 500ms)
      // ============================================================
      const executionStart = Date.now();

      // Select model dynamically
      const modelSelection = this.dynamicModelAdapter.selectModel(
        request.query,
        compressedContext.map(m => m.content)
      );

      // Build execution context
      const contextMessages = compressedContext.map(m => ({
        role: m.role as 'system' | 'user' | 'assistant',
        content: m.content,
      }));

      // Execute with fallback
      let executionResult: { content: string; provider: string; model: string; tokensUsed: number; costUsd: number; fallbackUsed: boolean } | null = null;

      if (request.options?.enableFallback !== false) {
        // Use fallback manager for resilient execution
        const fallbackResult = await this.fallbackManager.executeWithFallback(
          modelSelection.fallbackChain.map(mc => ({
            provider: mc.provider,
            execute: () => this.callLLM(mc.provider, mc.model, request.query, contextMessages, request.userId),
            timeoutMs: mc.avgLatencyMs * 2,
          })),
          {
            timeoutMs: 10000,
            maxRetries: 2,
            onFallback: (from, to, reason) => {
              log.info('Fallback triggered', { from, to, reason: reason.substring(0, 100) });
            },
          }
        );

        if (fallbackResult.success && fallbackResult.data) {
          executionResult = {
            ...fallbackResult.data,
            fallbackUsed: fallbackResult.fallbackUsed,
          };
        }
      }

      // If fallback manager didn't work, try direct execution
      if (!executionResult) {
        try {
          executionResult = await this.callLLM(
            modelSelection.model.provider,
            modelSelection.model.model,
            request.query,
            contextMessages,
            request.userId
          );
          executionResult.fallbackUsed = false;
        } catch (error) {
          log.error('LLM execution failed', { error: String(error) });
          this.metrics.failureCount++;

          return {
            content: 'Désolé, une erreur est survenue lors du traitement de votre demande. Veuillez réessayer.',
            confidence: 0,
            provider: 'none',
            model: 'none',
            latencyMs: Date.now() - totalStartTime,
            tokensUsed: 0,
            costUsd: 0,
            cached: false,
            speculative: false,
            enhanced: false,
            citations: [],
            explanation: 'Erreur d\'exécution LLM.',
            verificationStatus: 'unverified',
            metadata: {
              routingDecision,
              compressionRatio,
              fallbackUsed: false,
              pilierTimings: { ...timings, total: Date.now() - totalStartTime },
            },
          };
        }
      }

      timings.execution = Date.now() - executionStart;

      // Record for learning
      this.dynamicModelAdapter.recordExecution({
        query: request.query,
        model: executionResult.model,
        provider: executionResult.provider,
        tier: modelSelection.tier,
        complexityScore: modelSelection.complexityScore,
        actualCost: executionResult.costUsd,
        actualLatencyMs: timings.execution,
        success: true,
        timestamp: Date.now(),
      });

      // Record for speculative learning
      if (request.options?.enableSpeculative !== false) {
        await this.speculativeExecutor.recordResponse(request.query, executionResult.content);
      }

      // Cache the result
      if (routingDecision.shouldCache) {
        await this.smartRouter.cacheResponse(request.query, executionResult.content, request.userId);
      }

      // ============================================================
      // PILIER 4: Response Enhancer (< 100ms)
      // ============================================================
      const enhancementStart = Date.now();

      let enhancedResponse: EnhancedResponse;
      if (request.options?.enableEnhancement !== false) {
        enhancedResponse = await this.responseEnhancer.enhance(
          executionResult.content,
          request.query,
          {
            enableCitations: true,
            enableExplanation: true,
            enableFormatting: true,
            enableCache: true,
          },
          {
            agentId: request.agentIds?.[0] || 'hyperagent',
            model: executionResult.model,
            provider: executionResult.provider,
            tokensUsed: executionResult.tokensUsed,
            contextMessages: compressedContext.map(m => m.content),
          }
        );
      } else {
        enhancedResponse = {
          content: executionResult.content,
          confidence: 0.7,
          citations: [],
          explanation: '',
          verificationStatus: 'unverified',
          formatting: {
            hasCode: false,
            codeBlocks: [],
            hasMarkdown: false,
            hasLinks: false,
            wordCount: executionResult.content.split(/\s+/).length,
            readingTimeSeconds: Math.ceil(executionResult.content.split(/\s+/).length / 200 * 60),
          },
          metadata: {
            agentId: request.agentIds?.[0] || 'hyperagent',
            model: executionResult.model,
            provider: executionResult.provider,
            tokensUsed: executionResult.tokensUsed,
            generatedAt: Date.now(),
            cached: false,
            verificationAgents: [],
            qualityScore: 0.7,
          },
          processingTimeMs: 0,
        };
      }

      timings.enhancement = Date.now() - enhancementStart;

      // Update metrics
      this.metrics.totalTokensUsed += executionResult.tokensUsed;
      this.metrics.totalCostUsd += executionResult.costUsd;
      this.metrics.successCount++;

      const totalLatency = Date.now() - totalStartTime;
      this.latencyTracker.record(totalLatency);
      timings.total = totalLatency;

      return {
        content: enhancedResponse.content,
        confidence: enhancedResponse.confidence,
        provider: executionResult.provider,
        model: executionResult.model,
        latencyMs: totalLatency,
        tokensUsed: executionResult.tokensUsed,
        costUsd: executionResult.costUsd,
        cached: routingDecision.cacheHit,
        speculative: speculativeResult?.hit || false,
        enhanced: true,
        citations: enhancedResponse.citations,
        explanation: enhancedResponse.explanation,
        verificationStatus: enhancedResponse.verificationStatus,
        metadata: {
          routingDecision,
          compressionRatio,
          agentsExecuted: 1,
          fallbackUsed: executionResult.fallbackUsed,
          pilierTimings: timings,
        },
      };
    } catch (error) {
      const totalLatency = Date.now() - totalStartTime;
      this.metrics.failureCount++;
      this.latencyTracker.record(totalLatency);

      log.error('HyperAgent processing failed', { error: String(error) });

      return {
        content: 'Une erreur est survenue lors du traitement. Veuillez réessayer.',
        confidence: 0,
        provider: 'error',
        model: 'error',
        latencyMs: totalLatency,
        tokensUsed: 0,
        costUsd: 0,
        cached: false,
        speculative: false,
        enhanced: false,
        citations: [],
        explanation: 'Erreur interne du système HyperAgent.',
        verificationStatus: 'unverified',
        metadata: {
          routingDecision: {} as RouterDecision,
          fallbackUsed: false,
          pilierTimings: timings,
        },
      };
    }
  }

  /**
   * Call LLM with the given provider and model
   */
  private async callLLM(
    provider: string,
    model: string,
    query: string,
    context: Array<{ role: string; content: string }>,
    userId?: string
  ): Promise<{ content: string; provider: string; model: string; tokensUsed: number; costUsd: number; fallbackUsed: boolean }> {
    const router = createAIRouter(userId);

    const messages = [
      {
        role: 'system' as const,
        content: 'Tu es Gen3ia, un assistant IA hyper-performant. Tu réponds de manière concise, précise et innovante. Tu fournis des réponses structurées avec des citations quand c\'est possible.',
      },
      ...context,
      { role: 'user' as const, content: query },
    ];

    const response = await router.chat(messages, { model });

    return {
      content: response.content,
      provider: response.provider || provider,
      model: response.model || model,
      tokensUsed: response.usage?.total_tokens || 0,
      costUsd: response.costUsd || 0,
      fallbackUsed: false,
    };
  }

  /**
   * Process a multi-agent request in parallel
   */
  async processParallel(
    request: HyperAgentRequest,
    agentTasks: AgentTask[],
    executor: (task: AgentTask, signal: AbortSignal) => Promise<AgentResult>
  ): Promise<HyperAgentResponse> {
    const totalStartTime = Date.now();
    const timings = { routing: 0, compression: 0, execution: 0, enhancement: 0, total: 0 };

    // Step 1: Route
    const routingStart = Date.now();
    const routingDecision = await this.smartRouter.route({
      query: request.query,
      userId: request.userId,
      context: request.context?.map(m => m.content),
    });
    timings.routing = Date.now() - routingStart;

    // Step 2: Compress context
    const compressionStart = Date.now();
    let compressedContext = request.context || [];
    if (request.context && request.context.length > 0) {
      const result = await this.contextCompressor.compress(request.context, {
        queryRelevance: request.query,
      });
      compressedContext = result.compressed;
    }
    timings.compression = Date.now() - compressionStart;

    // Step 3: Execute in parallel
    const executionStart = Date.now();
    const parallelResult = await this.parallelExecutor.execute(
      agentTasks,
      executor,
      {
        maxConcurrency: request.options?.maxConcurrency || 4,
        mergeStrategy: 'best',
        streamingCallback: request.options?.streamingCallback,
      }
    );
    timings.execution = Date.now() - executionStart;

    // Step 4: Enhance
    const enhancementStart = Date.now();
    const enhancedResponse = await this.responseEnhancer.enhance(
      parallelResult.mergedResult,
      request.query,
      { enableCitations: true, enableExplanation: true, enableFormatting: true }
    );
    timings.enhancement = Date.now() - enhancementStart;

    const totalLatency = Date.now() - totalStartTime;
    this.latencyTracker.record(totalLatency);
    this.metrics.successCount++;

    return {
      content: enhancedResponse.content,
      confidence: enhancedResponse.confidence,
      provider: 'multi-agent',
      model: 'parallel',
      latencyMs: totalLatency,
      tokensUsed: parallelResult.totalTokensUsed,
      costUsd: 0,
      cached: false,
      speculative: false,
      enhanced: true,
      citations: enhancedResponse.citations,
      explanation: enhancedResponse.explanation,
      verificationStatus: enhancedResponse.verificationStatus,
      metadata: {
        routingDecision,
        compressionRatio: 1,
        agentsExecuted: parallelResult.agentsExecuted,
        fallbackUsed: false,
        pilierTimings: { ...timings, total: totalLatency },
      },
    };
  }

  /**
   * Get comprehensive HyperAgent metrics
   */
  getMetrics(): HyperAgentMetrics {
    return {
      totalRequests: this.metrics.totalRequests,
      avgLatencyMs: this.latencyTracker.getAverage(),
      p50LatencyMs: this.latencyTracker.getPercentile(50),
      p95LatencyMs: this.latencyTracker.getPercentile(95),
      p99LatencyMs: this.latencyTracker.getPercentile(99),
      cacheHitRate: this.smartRouter.getMetrics().cacheHitRate,
      speculativeHitRate: this.speculativeExecutor.getMetrics().hitRate,
      avgCompressionRatio: this.contextCompressor.getMetrics().avgCompressionRatio.toFixed(2),
      avgTokensPerRequest: this.metrics.totalRequests > 0
        ? Math.round(this.metrics.totalTokensUsed / this.metrics.totalRequests)
        : 0,
      avgCostPerRequest: this.metrics.totalRequests > 0
        ? '$' + (this.metrics.totalCostUsd / this.metrics.totalRequests).toFixed(4)
        : '$0',
      successRate: this.metrics.totalRequests > 0
        ? ((this.metrics.successCount / this.metrics.totalRequests) * 100).toFixed(1) + '%'
        : '0%',
      moduleMetrics: {
        smartRouter: this.smartRouter.getMetrics(),
        contextCompressor: this.contextCompressor.getMetrics(),
        parallelExecutor: this.parallelExecutor.getMetrics(),
        speculativeExecutor: this.speculativeExecutor.getMetrics(),
        dynamicModel: this.dynamicModelAdapter.getMetrics(),
        embeddingCache: this.embeddingCache.getMetrics(),
        fallbackManager: this.fallbackManager.getMetrics(),
        responseEnhancer: this.responseEnhancer.getMetrics(),
      },
    };
  }
}

// ============================================================
// SINGLETON & EXPORTS
// ============================================================

let hyperAgentInstance: HyperAgent | null = null;

export function getHyperAgent(): HyperAgent {
  if (!hyperAgentInstance) {
    hyperAgentInstance = new HyperAgent();
  }
  return hyperAgentInstance;
}

export default HyperAgent;

// Re-export all modules for direct access
export { SmartRouter, getSmartRouter } from './smart-router';
export { ContextCompressor, getContextCompressor } from './context-compressor';
export { ParallelExecutor, getParallelExecutor } from './parallel-executor';
export { SpeculativeExecutor, getSpeculativeExecutor } from './speculative-execution';
export { DynamicModelAdapter, getDynamicModelAdapter } from './dynamic-model';
export { EmbeddingCache, getEmbeddingCache } from './embedding-cache';
export { FallbackManager, getFallbackManager } from './fallback-manager';
export { ResponseEnhancer, getResponseEnhancer } from './response-enhancer';
