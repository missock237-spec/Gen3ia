// ============================================================
// Tests — Credit Engine
// ============================================================

import { describe, it, expect } from 'vitest';
import { CreditEngine, usdToCredits, creditsToUsd } from '../credit-engine';

const engine = new CreditEngine();

describe('usdToCredits / creditsToUsd', () => {
  it('should convert USD to credits correctly', () => {
    expect(usdToCredits(0.001)).toBe(1);
    expect(usdToCredits(0.01)).toBe(10);
    expect(usdToCredits(1.0)).toBe(1000);
    expect(usdToCredits(0.0001)).toBe(1); // ceil
  });

  it('should convert credits to USD correctly', () => {
    expect(creditsToUsd(1)).toBe(0.001);
    expect(creditsToUsd(1000)).toBe(1.0);
    expect(creditsToUsd(500)).toBe(0.5);
  });
});

describe('calculateLlmCost', () => {
  it('should calculate GPT-4o-mini cost', () => {
    const cost = engine.calculateLlmCost('openai', 'gpt-4o-mini', 1000, 500);
    expect(cost.usd).toBeCloseTo(0.00015 * 1 + 0.0006 * 0.5, 8);
    expect(cost.credits).toBeGreaterThan(0);
  });

  it('should calculate Groq cost (cheapest)', () => {
    const groqCost = engine.calculateLlmCost('groq', 'llama-3.1-8b', 1000, 500);
    const openaiCost = engine.calculateLlmCost('openai', 'gpt-4o', 1000, 500);
    expect(groqCost.usd).toBeLessThan(openaiCost.usd);
  });

  it('should fallback for unknown provider', () => {
    const cost = engine.calculateLlmCost('unknown', 'model', 100, 50);
    expect(cost.usd).toBeGreaterThan(0);
    expect(cost.credits).toBeGreaterThan(0);
  });
});

describe('calculateTaskCost', () => {
  it('should calculate basic chat cost', () => {
    const cost = engine.calculateTaskCost('chat', {});
    expect(cost.credits).toBeGreaterThan(0);
    expect(cost.breakdown.length).toBeGreaterThanOrEqual(1);
  });

  it('should include LLM tokens in breakdown', () => {
    const cost = engine.calculateTaskCost('chat', {
      tokensUsed: 1000,
      provider: 'openai',
      model: 'gpt-4o',
    });
    const llmBreakdown = cost.breakdown.find(b => b.component === 'llm_tokens');
    expect(llmBreakdown).toBeDefined();
    expect(llmBreakdown!.credits).toBeGreaterThan(0);
  });

  it('should include duration cost', () => {
    const cost = engine.calculateTaskCost('voice_call', {
      durationMs: 60000, // 1 minute
    });
    const durationBreakdown = cost.breakdown.find(b => b.component === 'duration');
    expect(durationBreakdown).toBeDefined();
    expect(durationBreakdown!.usd).toBeGreaterThan(0);
  });

  it('should include tool calls in breakdown', () => {
    const cost = engine.calculateTaskCost('tool_execution', {
      toolCalls: 5,
    });
    const toolBreakdown = cost.breakdown.find(b => b.component === 'tool_calls');
    expect(toolBreakdown).toBeDefined();
    expect(toolBreakdown!.credits).toBeGreaterThan(0);
  });

  it('should apply effort multiplier correctly', () => {
    const chatCost = engine.calculateTaskCost('chat', {});
    const videoCost = engine.calculateTaskCost('video_generation', {});
    // Video (x20) should cost more than chat (x1)
    expect(videoCost.credits).toBeGreaterThan(chatCost.credits);
  });
});

describe('calculateVoiceCallCost', () => {
  it('should calculate cost for a voice call', () => {
    const cost = engine.calculateVoiceCallCost(300, 'twilio'); // 5 min call
    expect(cost.breakdown.length).toBe(3); // telephony + stt + tts
    expect(cost.credits).toBeGreaterThan(0);

    // Check each component exists
    const components = cost.breakdown.map(b => b.component);
    expect(components).toContain('telephony');
    expect(components).toContain('stt');
    expect(components).toContain('tts');
  });

  it('should cost more for longer calls', () => {
    const shortCall = engine.calculateVoiceCallCost(60, 'twilio'); // 1 min
    const longCall = engine.calculateVoiceCallCost(600, 'twilio'); // 10 min
    expect(longCall.credits).toBeGreaterThan(shortCall.credits);
  });
});

describe('calculateMediaCost', () => {
  it('should calculate image generation cost', () => {
    const cost = engine.calculateMediaCost('image', 'replicate', 'sdxl', {
      width: 1024, height: 1024,
    });
    expect(cost.credits).toBeGreaterThan(0);
  });

  it('should calculate video generation cost', () => {
    const cost = engine.calculateMediaCost('video', 'cogvideo', 'cogvideo-5b', {
      frames: 25,
    });
    expect(cost.credits).toBeGreaterThan(0);
    expect(cost.credits).toBeGreaterThan(
      engine.calculateMediaCost('image', 'replicate', 'sdxl', {}).credits
    );
  });
});

describe('getUserBalance', () => {
  it('should return default balance for unknown user (without DB)', async () => {
    // This test validates the fallback path when DB is not available
    // The actual DB call is tested in integration tests
    const balance = await engine.getUserBalance('unknown-user-id');
    expect(balance).toBeGreaterThanOrEqual(0);
  });
});
