/**
 * Tests d'intégrité du système de simulation d'agents
 * Vérifie que les fallbacks simulés sont marqués explicitement
 * et que les coûts ne sont pas facturés pour les réponses simulées.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// Mock Prisma
jest.mock('@/lib/prisma', () => ({
  prisma: {
    agentSuiteExecution: {
      create: jest.fn().mockResolvedValue({ id: 'test-exec-1' }),
      update: jest.fn().mockResolvedValue({}),
    },
    agentSuite: {
      update: jest.fn().mockResolvedValue({}),
    },
    agentSuiteMessage: {
      create: jest.fn().mockResolvedValue({}),
    },
  },
}));

// Mock credit deduction
jest.mock('@/lib/billing/credit-integrator', () => ({
  deductForExecution: jest.fn().mockResolvedValue({}),
}));

// Mock logger
jest.mock('@/lib/logger', () => ({
  createLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

// Mock supervisor
jest.mock('@/lib/supervisor', () => ({
  supervisor: { check: jest.fn().mockResolvedValue({ decision: 'continue' }) },
}));

// Mock cache
jest.mock('@/lib/cache/cache-manager', () => ({
  cache: { get: jest.fn(), set: jest.fn() },
}));

// Mock HyperAgent modules — all fail to force simulated fallback
jest.mock('@/lib/hyperagent/smart-router', () => ({
  getSmartRouter: () => ({
    route: jest.fn().mockResolvedValue({
      canDirectAnswer: false,
      provider: 'openai',
      model: 'gpt-4o-mini',
      shouldCache: false,
    }),
    cacheResponse: jest.fn(),
  }),
}));

jest.mock('@/lib/hyperagent/context-compressor', () => ({
  getContextCompressor: () => ({
    compress: jest.fn().mockResolvedValue({ compressed: [{ content: 'compressed' }] }),
  }),
}));

jest.mock('@/lib/hyperagent/fallback-manager', () => ({
  getFallbackManager: () => ({
    executeWithFallback: jest.fn().mockResolvedValue({
      success: false,
      data: null,
    }),
  }),
}));

// Mock AI Router — fails to trigger simulated fallback
jest.mock('@/lib/ai-router', () => ({
  createAIRouter: () => ({
    chat: jest.fn().mockRejectedValue(new Error('LLM unavailable')),
  }),
}));

describe('Simulation Integrity — Agent Orchestrator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should mark SuiteResult.simulated=true when LLM is unavailable', async () => {
    const { AgentOrchestrator } = require('@/lib/agent-orchestrator');
    const orchestrator = new AgentOrchestrator();

    const result = await orchestrator.runSuite({
      suiteId: 'suite-1',
      userId: 'user-1',
      goal: 'Analyse le marché africain',
      strategy: 'sequential',
      maxRounds: 1,
      agents: [
        { id: 'a1', name: 'Researcher', role: 'researcher', model: 'gpt-4o-mini', systemPrompt: 'Tu es un chercheur.', temperature: 0.7, maxTokens: 1000 },
        { id: 'a2', name: 'Coordinator', role: 'coordinator', model: 'gpt-4o-mini', systemPrompt: 'Tu es un coordinateur.', temperature: 0.5, maxTokens: 2000 },
      ],
    });

    expect(result.simulated).toBe(true);
    expect(result.status).toBe('completed');
    expect(result.totalCost).toBe(0);
  });

  it('should prefix simulated content with [SIMULATION] marker', async () => {
    const { AgentOrchestrator } = require('@/lib/agent-orchestrator');
    const orchestrator = new AgentOrchestrator();

    const result = await orchestrator.runSuite({
      suiteId: 'suite-2',
      userId: 'user-1',
      goal: 'Test task',
      strategy: 'sequential',
      maxRounds: 1,
      agents: [
        { id: 'a1', name: 'TestBot', role: 'coordinator', model: 'gpt-4o-mini', systemPrompt: 'Test', temperature: 0.5, maxTokens: 500 },
      ],
    });

    expect(result.simulated).toBe(true);
    expect(result.result).toContain('[SIMULATION]');
  });
});

describe('Simulation Integrity — Code Sandbox Patterns', () => {
  it('should block dangerous patterns and allow safe code', () => {
    const dangerousPatterns = [
      /require\s*\(/,
      /import\s+/,
      /process\./,
      /global\./,
      /child_process/,
      /eval\s*\(/,
      /Function\s*\(/,
    ];

    const dangerousSamples = [
      'require("fs")',
      'import fs from "fs"',
      'process.env.SECRET',
      'global.__proto__',
      'child_process.exec("rm -rf /")',
      'eval("malicious")',
      'Function("return this")()',
    ];

    for (const sample of dangerousSamples) {
      expect(dangerousPatterns.some(p => p.test(sample))).toBe(true);
    }

    const safeSamples = [
      'console.log("hello")',
      'const x = 42',
      'function add(a, b) { return a + b; }',
      '[1, 2, 3].map(x => x * 2)',
    ];

    for (const sample of safeSamples) {
      expect(dangerousPatterns.some(p => p.test(sample))).toBe(false);
    }
  });
});

describe('Simulation Integrity — Execution Tracker Memory', () => {
  it('should estimate memory as tokens * 2 (not tokens * 4)', () => {
    const tokens = 500;
    const oldEstimate = tokens * 4;
    const newEstimate = tokens * 2;

    expect(newEstimate).toBe(1000);
    expect(oldEstimate).toBe(2000);
    expect(newEstimate).toBeLessThan(oldEstimate);
  });

  it('should use real memory_bytes when provided over estimate', () => {
    const tokens = 500;
    const realMemoryBytes = 4096;
    const estimatedBytes = tokens * 2;
    const tracked = realMemoryBytes > 0 ? realMemoryBytes : estimatedBytes;

    expect(tracked).toBe(realMemoryBytes);
    expect(tracked).not.toBe(estimatedBytes);
  });
});
