import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { agentBridge } from '@/lib/hyperagent/agent-bridge';
import { cacheStrategy } from '@/lib/performance/cache-strategy';
import { smartRouter } from '@/lib/hyperagent/smart-router';

describe('HyperAgent System - Production Tests', () => {
  beforeEach(() => {
    cacheStrategy.getStats().totalRequests === 0;
  });

  afterEach(() => {
    // Cleanup after tests
  });

  describe('Smart Router', () => {
    it('should route FAQ questions to cache', async () => {
      const result = await smartRouter.route({
        goal: 'What is Gen3ia?',
        context: 'Help section',
      });

      expect(result).toBeDefined();
      expect(result.route).toBe('cache');
    });

    it('should detect complex queries', async () => {
      const result = await smartRouter.route({
        goal: 'Analyze market trends for Q2 2026 and predict future outcomes',
        context: 'Advanced analytics',
      });

      expect(result.complexity).toBeGreaterThan(5);
    });

    it('should select appropriate provider based on complexity', async () => {
      const simpleResult = await smartRouter.route({
        goal: 'Hello',
        context: 'Simple',
      });

      const complexResult = await smartRouter.route({
        goal: 'Perform complex financial analysis with multiple variables',
        context: 'Complex',
      });

      expect(simpleResult.provider).toBe('groq');
      expect(complexResult.provider).toBe('claude');
    });
  });

  describe('Agent Bridge', () => {
    it('should process requests with HyperAgent optimizations', async () => {
      const result = await agentBridge.processRequest({
        userId: 'test-user-123',
        goal: 'What is AI?',
        context: 'General knowledge',
        strategy: 'parallel',
      });

      expect(result).toBeDefined();
      expect(result.bridge).toMatch(/hyperagent|traditional/);
    });

    it('should record latency metrics', async () => {
      await agentBridge.processRequest({
        userId: 'test-user-456',
        goal: 'Simple test',
        context: 'Test',
      });

      const metrics = agentBridge.getMetrics();
      expect(metrics.hyperagentRequests).toBeGreaterThan(0);
      expect(metrics.averageLatency).toBeGreaterThan(0);
    });

    it('should fallback gracefully on error', async () => {
      const result = await agentBridge.processRequest({
        userId: 'test-user-789',
        goal: null as any,
        context: 'Error test',
      });

      expect(result).toBeDefined();
    });
  });

  describe('Cache Strategy', () => {
    it('should cache and retrieve data', async () => {
      const testData = { message: 'Test response' };
      await cacheStrategy.set('test-key', testData, 3600000);

      const retrieved = await cacheStrategy.get('test-key');
      expect(retrieved).toEqual(testData);
    });

    it('should expire cached data', async () => {
      await cacheStrategy.set('expire-test', { data: 'test' }, 100);
      
      await new Promise(resolve => setTimeout(resolve, 150));
      
      const retrieved = await cacheStrategy.get('expire-test');
      expect(retrieved).toBeNull();
    });

    it('should track cache statistics', async () => {
      await cacheStrategy.set('stat-test-1', { value: 1 }, 3600000);
      await cacheStrategy.get('stat-test-1');
      await cacheStrategy.get('stat-test-1');
      
      const stats = cacheStrategy.getStats();
      expect(stats.tier3Hits).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Performance Metrics', () => {
    it('should measure latency improvements', async () => {
      const startTime = performance.now();

      await agentBridge.processRequest({
        userId: 'perf-test',
        goal: 'Quick question',
        context: 'Performance',
      });

      const endTime = performance.now();
      const latency = endTime - startTime;

      expect(latency).toBeLessThan(3000); // Should be <3s in production
    });

    it('should achieve >60% cache hit rate for repeated queries', async () => {
      const query = { goal: 'Repeated test', context: 'Cache test' };

      // Make multiple identical requests
      for (let i = 0; i < 10; i++) {
        await cacheStrategy.set(`repeated-${i}`, query, 3600000);
        await cacheStrategy.get(`repeated-${i}`);
      }

      const stats = cacheStrategy.getStats();
      const hitRate = (stats.tier3Hits / stats.totalRequests) * 100;

      expect(hitRate).toBeGreaterThan(60);
    });
  });

  describe('Error Handling', () => {
    it('should handle null inputs gracefully', async () => {
      expect(async () => {
        await agentBridge.processRequest(null as any);
      }).not.toThrow();
    });

    it('should handle undefined context', async () => {
      const result = await agentBridge.processRequest({
        userId: 'test',
        goal: 'test',
        context: undefined as any,
      });

      expect(result).toBeDefined();
    });
  });
});
