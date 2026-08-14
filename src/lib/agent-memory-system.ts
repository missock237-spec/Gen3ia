/**
 * Agent Memory Persistence & Context Injection System
 */

export enum MemoryTier {
  PERSISTENT = 'PERSISTENT',
  SESSION = 'SESSION',
  EPHEMERAL = 'EPHEMERAL',
}

export enum MemoryCategory {
  PREFERENCE = 'PREFERENCE',
  FACT = 'FACT',
  DECISION = 'DECISION',
  CONTEXT = 'CONTEXT',
  INSTRUCTION = 'INSTRUCTION',
}

export interface AgentMemory {
  id: string;
  agentId: string;
  userId: string;
  tier: MemoryTier;
  category: MemoryCategory;
  key: string;
  value: string;
  confidence: number; // 0-1
  createdAt: Date | string;
  updatedAt: Date | string;
  lastAccessedAt: Date | string;
  accessCount: number;
  relevanceScore?: number;
  tags: string[];
}

export interface MemoryContext {
  agentId: string;
  userId: string;
  conversationId?: string;
  currentTopic?: string;
  userMessage?: string;
}

// Mock Firestore Pattern per requirement
const db = {
  collection: (name: string) => ({
    add: async (data: any) => ({ id: 'mock-' + Date.now() }),
    get: async () => ({ docs: [] as any[] }),
    where: () => ({
      get: async () => ({ docs: [] as any[] }),
      limit: () => ({
        get: async () => ({ docs: [] as any[] }),
      }),
    }),
    doc: (id: string) => ({
      delete: async () => undefined,
      update: async (data: any) => undefined,
      get: async () => ({ exists: false }),
    }),
  }),
};

export class AgentMemorySystem {
  private memoryStore: Map<string, AgentMemory> = new Map();

  /**
   * Store a new memory
   */
  async store(memory: Omit<AgentMemory, 'id' | 'createdAt'>): Promise<AgentMemory> {
    const id = 'mem_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    const now = new Date().toISOString();

    const newMemory: AgentMemory = {
      id,
      agentId: memory.agentId,
      userId: memory.userId,
      tier: memory.tier || MemoryTier.PERSISTENT,
      category: memory.category || MemoryCategory.FACT,
      key: memory.key,
      value: memory.value,
      confidence: typeof memory.confidence === 'number' ? Math.min(Math.max(memory.confidence, 0), 1) : 1.0,
      createdAt: now,
      updatedAt: memory.updatedAt || now,
      lastAccessedAt: memory.lastAccessedAt || now,
      accessCount: memory.accessCount ?? 0,
      relevanceScore: memory.relevanceScore ?? 0,
      tags: Array.isArray(memory.tags) ? memory.tags : [],
    };

    this.memoryStore.set(id, newMemory);
    await db.collection('agent_memories').add(newMemory);

    return newMemory;
  }

  /**
   * Get all stored memories for an agent and user, optionally filtered by category
   */
  async getMemories(agentId: string, userId: string, category?: MemoryCategory): Promise<AgentMemory[]> {
    const all = Array.from(this.memoryStore.values());
    return all.filter((m) => {
      const matchAgent = m.agentId === agentId;
      const matchUser = m.userId === userId;
      const matchCategory = !category || m.category === category;
      return matchAgent && matchUser && matchCategory;
    });
  }

  /**
   * Recall memories using keyword matching + tag matching + recency + access frequency scoring
   */
  async recall(context: MemoryContext): Promise<AgentMemory[]> {
    const candidateMemories = Array.from(this.memoryStore.values()).filter(
      (m) => m.agentId === context.agentId && m.userId === context.userId
    );

    const scoredMemories = candidateMemories.map((m) => {
      const score = this.calculateRelevanceScore(m, context);
      return {
        ...m,
        relevanceScore: score,
      };
    });

    // Sort descending by relevance score
    scoredMemories.sort((a, b) => (b.relevanceScore ?? 0) - (a.relevanceScore ?? 0));

    // Update access count and last accessed time for top matched memories
    const now = new Date().toISOString();
    for (const mem of scoredMemories) {
      if ((mem.relevanceScore ?? 0) > 0) {
        const stored = this.memoryStore.get(mem.id);
        if (stored) {
          stored.accessCount = (stored.accessCount || 0) + 1;
          stored.lastAccessedAt = now;
          stored.updatedAt = now;
          this.memoryStore.set(mem.id, stored);
          await db.collection('agent_memories').doc(mem.id).update({
            accessCount: stored.accessCount,
            lastAccessedAt: now,
            updatedAt: now,
          });
        }
      }
    }

    return scoredMemories;
  }

  /**
   * Scoring formula:
   * relevanceScore = (keywordMatch * 0.3) + (tagMatch * 0.2) + (recency * 0.2) + (frequency * 0.15) + (confidence * 0.15)
   */
  private calculateRelevanceScore(memory: AgentMemory, context: MemoryContext): number {
    const contextText = `${context.userMessage || ''} ${context.currentTopic || ''}`.toLowerCase();
    const contextTokens = contextText
      .split(/\W+/)
      .filter((t) => t.length > 2);

    // 1. Keyword match (0.3 weight)
    let keywordMatch = 0;
    const keyValText = `${memory.key} ${memory.value}`.toLowerCase();
    if (contextTokens.length > 0) {
      const matchedTokens = contextTokens.filter((token) => keyValText.includes(token));
      keywordMatch = matchedTokens.length / contextTokens.length;
    } else {
      keywordMatch = 0.5;
    }
    keywordMatch = Math.min(Math.max(keywordMatch, 0), 1);

    // 2. Tag match (0.2 weight)
    let tagMatch = 0;
    if (memory.tags && memory.tags.length > 0) {
      const lowerTags = memory.tags.map((t) => t.toLowerCase());
      const matchedTags = lowerTags.filter((tag) => contextText.includes(tag) || contextTokens.includes(tag));
      tagMatch = matchedTags.length / memory.tags.length;
    } else {
      tagMatch = 0;
    }
    tagMatch = Math.min(Math.max(tagMatch, 0), 1);

    // 3. Recency (0.2 weight)
    const nowTime = Date.now();
    const lastAccessTime = new Date(memory.lastAccessedAt || memory.createdAt).getTime();
    const hoursSinceAccess = Math.max(0, (nowTime - lastAccessTime) / (1000 * 60 * 60));
    // Decay over 72 hours
    const recency = Math.exp(-hoursSinceAccess / 72);

    // 4. Frequency (0.15 weight)
    const frequency = Math.min((memory.accessCount || 0) / 10, 1.0);

    // 5. Confidence (0.15 weight)
    const confidence = Math.min(Math.max(memory.confidence ?? 1.0, 0), 1.0);

    const totalScore =
      keywordMatch * 0.3 +
      tagMatch * 0.2 +
      recency * 0.2 +
      frequency * 0.15 +
      confidence * 0.15;

    return Number(totalScore.toFixed(4));
  }

  /**
   * Delete a memory by id
   */
  async forget(memoryId: string): Promise<void> {
    this.memoryStore.delete(memoryId);
    await db.collection('agent_memories').doc(memoryId).delete();
  }

  /**
   * Update memory by id
   */
  async updateMemory(id: string, updates: Partial<AgentMemory>): Promise<void> {
    const existing = this.memoryStore.get(id);
    if (!existing) {
      return;
    }

    const updated: AgentMemory = {
      ...existing,
      ...updates,
      id: existing.id,
      updatedAt: new Date().toISOString(),
    };

    this.memoryStore.set(id, updated);
    await db.collection('agent_memories').doc(id).update(updates);
  }

  /**
   * Appends relevant memories to the system prompt in a structured section
   */
  async injectIntoPrompt(context: MemoryContext, basePrompt: string): Promise<string> {
    const memories = await this.recall(context);
    const relevant = memories.filter((m) => (m.relevanceScore ?? 0) >= 0.1);

    if (relevant.length === 0) {
      return basePrompt;
    }

    const formattedMemories = relevant
      .map(
        (m) =>
          `-[${m.category} | ${m.tier}] Key: "${m.key}" -> Value: "${m.value}" (Confidence: ${m.confidence})`
      )
      .join('\n');

    const injectionBlock = `\n\n### Agent Contextual Memories\nThe following relevant stored memories were retrieved for this interaction:\n${formattedMemories}\n`;

    return `${basePrompt}${injectionBlock}`;
  }

  /**
   * Heuristic extraction of potential memories from conversation
   */
  async extractMemoriesFromConversation(context: MemoryContext, aiResponse: string): Promise<AgentMemory[]> {
    const userMsg = context.userMessage || '';
    const textToAnalyze = `${userMsg}\n${aiResponse}`;
    const extracted: AgentMemory[] = [];

    // 1. Preferences
    const prefRegex = /(?:I prefer|My favorite|I like|I love|I enjoy|my preference is)\s+([^.!?\n]+)/gi;
    let match: RegExpExecArray | null;
    while ((match = prefRegex.exec(userMsg)) !== null) {
      const val = match[1].trim();
      if (val.length > 2) {
        const mem = await this.store({
          agentId: context.agentId,
          userId: context.userId,
          tier: MemoryTier.PERSISTENT,
          category: MemoryCategory.PREFERENCE,
          key: `Preference: ${val.substring(0, 30)}`,
          value: `User stated preference: ${val}`,
          confidence: 0.85,
          updatedAt: new Date().toISOString(),
          lastAccessedAt: new Date().toISOString(),
          accessCount: 1,
          tags: ['preference', 'extracted'],
        });
        extracted.push(mem);
      }
    }

    // 2. Instructions
    const instructionRegex = /(?:Remember that|Always|Never|Make sure to|Be sure to)\s+([^.!?\n]+)/gi;
    while ((match = instructionRegex.exec(userMsg)) !== null) {
      const val = match[1].trim();
      if (val.length > 2) {
        const mem = await this.store({
          agentId: context.agentId,
          userId: context.userId,
          tier: MemoryTier.PERSISTENT,
          category: MemoryCategory.INSTRUCTION,
          key: `Instruction: ${val.substring(0, 30)}`,
          value: `Standing instruction: ${val}`,
          confidence: 0.9,
          updatedAt: new Date().toISOString(),
          lastAccessedAt: new Date().toISOString(),
          accessCount: 1,
          tags: ['instruction', 'rule'],
        });
        extracted.push(mem);
      }
    }

    // 3. Decisions
    const decisionRegex = /(?:We decided to|I decided to|Let's go with|Agreed on|Chosen option)\s+([^.!?\n]+)/gi;
    while ((match = decisionRegex.exec(textToAnalyze)) !== null) {
      const val = match[1].trim();
      if (val.length > 2) {
        const mem = await this.store({
          agentId: context.agentId,
          userId: context.userId,
          tier: MemoryTier.SESSION,
          category: MemoryCategory.DECISION,
          key: `Decision: ${val.substring(0, 30)}`,
          value: `Decision reached: ${val}`,
          confidence: 0.8,
          updatedAt: new Date().toISOString(),
          lastAccessedAt: new Date().toISOString(),
          accessCount: 1,
          tags: ['decision', 'session'],
        });
        extracted.push(mem);
      }
    }

    // 4. Facts
    const factRegex = /(?:My name is|I am a|I work as|I live in|My location is|My company is)\s+([^.!?\n]+)/gi;
    while ((match = factRegex.exec(userMsg)) !== null) {
      const val = match[1].trim();
      if (val.length > 2) {
        const mem = await this.store({
          agentId: context.agentId,
          userId: context.userId,
          tier: MemoryTier.PERSISTENT,
          category: MemoryCategory.FACT,
          key: `Fact: ${val.substring(0, 30)}`,
          value: `User fact: ${val}`,
          confidence: 0.95,
          updatedAt: new Date().toISOString(),
          lastAccessedAt: new Date().toISOString(),
          accessCount: 1,
          tags: ['fact', 'user-info'],
        });
        extracted.push(mem);
      }
    }

    return extracted;
  }
}

export const agentMemorySystem = new AgentMemorySystem();
