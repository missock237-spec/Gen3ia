import { createLogger } from '@/lib/logger';
import { db } from '@/lib/db';

const log = createLogger('relay-system');

export enum RelayProvider {
  GROQ = 'groq',
  OPENROUTER = 'openrouter',
  OPENAI = 'openai',
  ANTHROPIC = 'anthropic',
  HUGGINGFACE = 'huggingface',
  ELEVENLABS = 'elevenlabs',
}

export enum RelayModality {
  REASONING = 'reasoning',
  VOICE = 'voice',
  IMAGE = 'image',
  VIDEO = 'video',
  AUDIO = 'audio',
}

interface RelayStep {
  provider: RelayProvider;
  priority: number;
  isFree: boolean;
  model: string;
  dailyLimit: number;
  monthlyLimit: number;
  costPerUnit: number;
}

interface RelayChain {
  modality: RelayModality;
  steps: RelayStep[];
  fallbackMessage: string;
}

interface ProviderUsage {
  provider: RelayProvider;
  modality: RelayModality;
  dailyCount: number;
  monthlyCount: number;
  totalCount: number;
  lastResetDate: string;
  lastResetMonth: string;
}

const RELAY_CHAINS: RelayChain[] = [
  {
    modality: RelayModality.REASONING,
    steps: [
      { provider: RelayProvider.GROQ, priority: 1, isFree: true, model: 'llama-3.3-70b-versatile', dailyLimit: 1000, monthlyLimit: 30000, costPerUnit: 0 },
      { provider: RelayProvider.OPENROUTER, priority: 2, isFree: true, model: 'meta-llama/llama-3.1-8b-instruct:free', dailyLimit: 500, monthlyLimit: 15000, costPerUnit: 0 },
      { provider: RelayProvider.OPENAI, priority: 3, isFree: false, model: 'gpt-4o-mini', dailyLimit: 999999, monthlyLimit: 999999, costPerUnit: 0.00015 },
      { provider: RelayProvider.ANTHROPIC, priority: 4, isFree: false, model: 'claude-3-haiku', dailyLimit: 999999, monthlyLimit: 999999, costPerUnit: 0.00025 },
    ],
    fallbackMessage: 'All AI reasoning providers exhausted. Please try again later.',
  },
  {
    modality: RelayModality.VOICE,
    steps: [
      { provider: RelayProvider.HUGGINGFACE, priority: 1, isFree: true, model: 'espnet/kan-bayashi_ljspeech_vits', dailyLimit: 300, monthlyLimit: 9000, costPerUnit: 0 },
      { provider: RelayProvider.ELEVENLABS, priority: 2, isFree: false, model: 'eleven_monolingual_v1', dailyLimit: 999999, monthlyLimit: 999999, costPerUnit: 0.03 },
    ],
    fallbackMessage: 'All voice synthesis providers exhausted. Please try again later.',
  },
  {
    modality: RelayModality.IMAGE,
    steps: [
      { provider: RelayProvider.HUGGINGFACE, priority: 1, isFree: true, model: 'stabilityai/stable-diffusion-3.5-large-turbo', dailyLimit: 100, monthlyLimit: 3000, costPerUnit: 0 },
      { provider: RelayProvider.OPENAI, priority: 2, isFree: false, model: 'dall-e-3', dailyLimit: 50, monthlyLimit: 1500, costPerUnit: 0.040 },
    ],
    fallbackMessage: 'All image generation providers exhausted. Please try again later.',
  },
  {
    modality: RelayModality.VIDEO,
    steps: [
      { provider: RelayProvider.HUGGINGFACE, priority: 1, isFree: true, model: 'damo-vilab/modelscope-damo-text-to-video', dailyLimit: 30, monthlyLimit: 900, costPerUnit: 0 },
      { provider: RelayProvider.OPENAI, priority: 2, isFree: false, model: 'dall-e-3', dailyLimit: 10, monthlyLimit: 300, costPerUnit: 0.080 },
    ],
    fallbackMessage: 'All video generation providers exhausted. Please try again later.',
  },
  {
    modality: RelayModality.AUDIO,
    steps: [
      { provider: RelayProvider.HUGGINGFACE, priority: 1, isFree: true, model: 'facebook/musicgen-small', dailyLimit: 100, monthlyLimit: 3000, costPerUnit: 0 },
      { provider: RelayProvider.OPENAI, priority: 2, isFree: false, model: 'tts-1', dailyLimit: 999999, monthlyLimit: 999999, costPerUnit: 0.015 },
    ],
    fallbackMessage: 'All audio generation providers exhausted. Please try again later.',
  },
];

class ProviderUsageTracker {
  private usageCache: Map<string, ProviderUsage> = new Map();
  private dirtyProviders: Set<string> = new Set();

  private buildKey(provider: RelayProvider, modality: RelayModality): string {
    return `${provider}:${modality}`;
  }

  async getUsage(provider: RelayProvider, modality: RelayModality): Promise<ProviderUsage> {
    const key = this.buildKey(provider, modality);
    const cached = this.usageCache.get(key);
    if (cached) {
      const today = new Date().toISOString().slice(0, 10);
      const thisMonth = new Date().toISOString().slice(0, 7);
      if (cached.lastResetDate === today && cached.lastResetMonth === thisMonth) {
        return cached;
      }
    }

    try {
      const record = await db.relayUsage.findFirst({
        where: { provider: provider.toString(), modality: modality.toString() },
        orderBy: { updatedAt: 'desc' },
      });

      const now = new Date();
      const today = now.toISOString().slice(0, 10);
      const thisMonth = now.toISOString().slice(0, 7);

      let usage: ProviderUsage;
      if (record) {
        const recordDate = record.lastResetDate instanceof Date
          ? record.lastResetDate.toISOString().slice(0, 10)
          : String(record.lastResetDate).slice(0, 10);
        const recordMonth = record.lastResetMonth instanceof Date
          ? record.lastResetMonth.toISOString().slice(0, 7)
          : String(record.lastResetMonth).slice(0, 7);

        const dailyCount = recordDate === today ? record.dailyCount : 0;
        const monthlyCount = recordMonth === thisMonth ? record.monthlyCount : 0;

        usage = {
          provider: provider as RelayProvider,
          modality: modality as RelayModality,
          dailyCount: Number(dailyCount),
          monthlyCount: Number(monthlyCount),
          totalCount: Number(record.totalCount),
          lastResetDate: today,
          lastResetMonth: thisMonth,
        };
      } else {
        usage = {
          provider: provider as RelayProvider,
          modality: modality as RelayModality,
          dailyCount: 0,
          monthlyCount: 0,
          totalCount: 0,
          lastResetDate: today,
          lastResetMonth: thisMonth,
        };
      }

      this.usageCache.set(key, usage);
      return usage;
    } catch (error) {
      log.warn('Failed to fetch relay usage from DB, using defaults', {
        provider,
        modality,
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        provider: provider as RelayProvider,
        modality: modality as RelayModality,
        dailyCount: 0,
        monthlyCount: 0,
        totalCount: 0,
        lastResetDate: new Date().toISOString().slice(0, 10),
        lastResetMonth: new Date().toISOString().slice(0, 7),
      };
    }
  }

  async incrementUsage(provider: RelayProvider, modality: RelayModality): Promise<void> {
    const key = this.buildKey(provider, modality);
    const usage = await this.getUsage(provider, modality);

    usage.dailyCount++;
    usage.monthlyCount++;
    usage.totalCount++;

    this.usageCache.set(key, usage);
    this.dirtyProviders.add(key);

    if (this.dirtyProviders.size >= 10) {
      await this.flush();
    }
  }

  async flush(): Promise<void> {
    if (this.dirtyProviders.size === 0) return;

    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const thisMonth = now.toISOString().slice(0, 7);

    for (const key of this.dirtyProviders) {
      const usage = this.usageCache.get(key);
      if (!usage) continue;

      try {
        await db.relayUsage.upsert({
          where: {
            provider_modality: {
              provider: usage.provider.toString(),
              modality: usage.modality.toString(),
            },
          },
          create: {
            provider: usage.provider.toString(),
            modality: usage.modality.toString(),
            dailyCount: usage.dailyCount,
            monthlyCount: usage.monthlyCount,
            totalCount: usage.totalCount,
            lastResetDate: new Date(today),
            lastResetMonth: new Date(thisMonth + '-01'),
          },
          update: {
            dailyCount: usage.dailyCount,
            monthlyCount: usage.monthlyCount,
            totalCount: usage.totalCount,
            lastResetDate: new Date(today),
            lastResetMonth: new Date(thisMonth + '-01'),
          },
        });
      } catch (error) {
        log.warn('Failed to flush relay usage', {
          key,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    this.dirtyProviders.clear();
  }
}

export class RelaySystem {
  private tracker: ProviderUsageTracker;
  private flushInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.tracker = new ProviderUsageTracker();
    this.flushInterval = setInterval(() => {
      this.tracker.flush().catch(err => log.warn('Auto-flush failed', { error: String(err) }));
    }, 30_000);
  }

  private getChain(modality: RelayModality): RelayChain {
    const chain = RELAY_CHAINS.find(c => c.modality === modality);
    if (!chain) throw new Error(`No relay chain defined for modality: ${modality}`);
    return chain;
  }

  private isProviderConfigured(provider: RelayProvider): boolean {
    const envMap: Record<RelayProvider, string> = {
      [RelayProvider.GROQ]: 'GROQ_API_KEY',
      [RelayProvider.OPENROUTER]: 'OPENROUTER_API_KEY',
      [RelayProvider.OPENAI]: 'OPENAI_API_KEY',
      [RelayProvider.ANTHROPIC]: 'ANTHROPIC_API_KEY',
      [RelayProvider.HUGGINGFACE]: 'HUGGINGFACE_TOKEN',
      [RelayProvider.ELEVENLABS]: 'ELEVENLABS_API_KEY',
    };
    return !!process.env[envMap[provider]];
  }

  async getNextAvailable(
    modality: RelayModality,
    options?: { preferFree?: boolean; maxCost?: number }
  ): Promise<{
    provider: RelayProvider;
    model: string;
    isFree: boolean;
    stepIndex: number;
    dailyRemaining: number;
    monthlyRemaining: number;
    chainExhausted: boolean;
  } | null> {
    const chain = this.getChain(modality);
    const preferFree = options?.preferFree !== false;
    const maxCost = options?.maxCost ?? Infinity;

    let sortedSteps = [...chain.steps].sort((a, b) => a.priority - b.priority);
    if (preferFree) {
      sortedSteps = sortedSteps.sort((a, b) => {
        if (a.isFree && !b.isFree) return -1;
        if (!a.isFree && b.isFree) return 1;
        return a.priority - b.priority;
      });
    }

    for (let i = 0; i < sortedSteps.length; i++) {
      const step = sortedSteps[i];

      if (!this.isProviderConfigured(step.provider)) {
        log.info('Provider not configured, skipping', { provider: step.provider });
        continue;
      }

      if (!step.isFree && step.costPerUnit > maxCost) continue;

      const usage = await this.tracker.getUsage(step.provider, modality);
      const dailyRemaining = step.dailyLimit - usage.dailyCount;
      const monthlyRemaining = step.monthlyLimit - usage.monthlyCount;

      if (dailyRemaining <= 0) {
        log.info('Daily limit reached for provider', {
          provider: step.provider,
          modality,
          limit: step.dailyLimit,
          used: usage.dailyCount,
        });
        continue;
      }

      if (monthlyRemaining <= 0) {
        log.info('Monthly limit reached for provider', {
          provider: step.provider,
          modality,
          limit: step.monthlyLimit,
          used: usage.monthlyCount,
        });
        continue;
      }

      await this.tracker.incrementUsage(step.provider, modality);

      log.info('Relay selected provider', {
        modality,
        provider: step.provider,
        model: step.model,
        isFree: step.isFree,
        dailyRemaining,
        monthlyRemaining,
        stepInChain: i + 1,
        totalSteps: sortedSteps.length,
      });

      return {
        provider: step.provider,
        model: step.model,
        isFree: step.isFree,
        stepIndex: i,
        dailyRemaining: Math.max(0, dailyRemaining - 1),
        monthlyRemaining: Math.max(0, monthlyRemaining - 1),
        chainExhausted: false,
      };
    }

    log.warn('Entire relay chain exhausted', { modality, totalSteps: sortedSteps.length });
    return null;
  }

  async executeWithRelay<T>(
    modality: RelayModality,
    executor: (provider: RelayProvider, model: string) => Promise<T>,
    options?: { preferFree?: boolean; maxCost?: number }
  ): Promise<{ result: T; provider: RelayProvider; model: string; isFree: boolean; relayAttempts: number }> {
    const chain = this.getChain(modality);
    const preferFree = options?.preferFree !== false;

    let sortedSteps = [...chain.steps].sort((a, b) => a.priority - b.priority);
    if (preferFree) {
      sortedSteps = sortedSteps.sort((a, b) => {
        if (a.isFree && !b.isFree) return -1;
        if (!a.isFree && b.isFree) return 1;
        return a.priority - b.priority;
      });
    }

    let lastError: Error | null = null;

    for (let i = 0; i < sortedSteps.length; i++) {
      const step = sortedSteps[i];

      if (!this.isProviderConfigured(step.provider)) continue;
      if (!step.isFree && step.costPerUnit > (options?.maxCost ?? Infinity)) continue;

      const usage = await this.tracker.getUsage(step.provider, modality);
      if (usage.dailyCount >= step.dailyLimit) continue;
      if (usage.monthlyCount >= step.monthlyLimit) continue;

      try {
        const result = await executor(step.provider, step.model);

        await this.tracker.incrementUsage(step.provider, modality);

        log.info('Relay execution succeeded', {
          modality,
          provider: step.provider,
          model: step.model,
          isFree: step.isFree,
          relayStep: i + 1,
          totalSteps: sortedSteps.length,
        });

        return {
          result,
          provider: step.provider,
          model: step.model,
          isFree: step.isFree,
          relayAttempts: i + 1,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        log.warn('Relay step failed, trying next', {
          modality,
          provider: step.provider,
          step: i + 1,
          error: lastError.message,
        });
      }
    }

    throw new Error(
      `${chain.fallbackMessage} Last error: ${lastError?.message || 'All providers exhausted'}`
    );
  }

  async getUsageReport(modality?: RelayModality): Promise<Array<{
    provider: RelayProvider;
    modality: RelayModality;
    dailyUsed: number;
    dailyLimit: number;
    monthlyUsed: number;
    monthlyLimit: number;
    isFree: boolean;
    isAvailable: boolean;
    percentUsed: number;
  }>> {
    const chains = modality
      ? [this.getChain(modality)]
      : RELAY_CHAINS;

    const report: Array<{
      provider: RelayProvider;
      modality: RelayModality;
      dailyUsed: number;
      dailyLimit: number;
      monthlyUsed: number;
      monthlyLimit: number;
      isFree: boolean;
      isAvailable: boolean;
      percentUsed: number;
    }> = [];

    for (const chain of chains) {
      for (const step of chain.steps) {
        const usage = await this.tracker.getUsage(step.provider, chain.modality);
        const isAvailable = usage.dailyCount < step.dailyLimit && usage.monthlyCount < step.monthlyLimit;

        report.push({
          provider: step.provider,
          modality: chain.modality,
          dailyUsed: usage.dailyCount,
          dailyLimit: step.dailyLimit,
          monthlyUsed: usage.monthlyCount,
          monthlyLimit: step.monthlyLimit,
          isFree: step.isFree,
          isAvailable,
          percentUsed: Math.round((usage.dailyCount / step.dailyLimit) * 10000) / 100,
        });
      }
    }

    return report;
  }

  async flushUsage(): Promise<void> {
    await this.tracker.flush();
  }

  destroy(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
    this.tracker.flush().catch(() => {});
  }
}

let instance: RelaySystem | null = null;

export function getRelaySystem(): RelaySystem {
  if (!instance) {
    instance = new RelaySystem();
  }
  return instance;
}

export async function getNextAIProvider(options?: { preferFree?: boolean; maxCost?: number }) {
  const relay = getRelaySystem();
  return relay.getNextAvailable(RelayModality.REASONING, options);
}

export async function getNextVoiceProvider(options?: { preferFree?: boolean; maxCost?: number }) {
  const relay = getRelaySystem();
  return relay.getNextAvailable(RelayModality.VOICE, options);
}

export async function getNextImageProvider(options?: { preferFree?: boolean; maxCost?: number }) {
  const relay = getRelaySystem();
  return relay.getNextAvailable(RelayModality.IMAGE, options);
}

export async function getNextVideoProvider(options?: { preferFree?: boolean; maxCost?: number }) {
  const relay = getRelaySystem();
  return relay.getNextAvailable(RelayModality.VIDEO, options);
}

export async function getNextAudioProvider(options?: { preferFree?: boolean; maxCost?: number }) {
  const relay = getRelaySystem();
  return relay.getNextAvailable(RelayModality.AUDIO, options);
}