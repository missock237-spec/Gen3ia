/**
 * Agent Memory Engine — Per-agent learning database
 *
 * Features:
 * - Auto-categorization (preference, episodic, procedural, semantic, general)
 * - Keyword-based TF-IDF style search + relevance scoring
 * - Relevance decay over time
 * - Learning from conversations
 * - Memory pruning
 */

import { db } from '@/lib/db';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MemoryCategory = 'preference' | 'episodic' | 'procedural' | 'semantic' | 'general';
export type MemorySource = 'interaction' | 'observation' | 'feedback' | 'system';

export interface StoreMemoryOptions {
  category?: MemoryCategory;
  context?: Record<string, unknown>;
  source?: MemorySource;
  relevance?: number;
  tags?: string[];
  expiresAt?: Date;
}

export interface RetrieveMemoriesOptions {
  category?: MemoryCategory;
  limit?: number;
  minRelevance?: number;
  includeExpired?: boolean;
}

export interface MemoryStats {
  totalMemories: number;
  categories: Record<string, number>;
  averageRelevance: number;
  mostAccessed: { id: string; content: string; accessCount: number }[];
  recentMemories: { id: string; content: string; createdAt: Date }[];
  topTags: { tag: string; count: number }[];
}

export interface AgentMemoryResult {
  id: string;
  agentId: string;
  userId: string;
  category: string;
  content: string;
  context: Record<string, unknown>;
  source: string;
  relevance: number;
  tags: string[];
  accessCount: number;
  lastAccessedAt: Date;
  createdAt: Date;
  expiresAt: Date | null;
}

// ---------------------------------------------------------------------------
// Keyword analysis for auto-categorization
// ---------------------------------------------------------------------------

const CATEGORY_KEYWORDS: Record<MemoryCategory, string[]> = {
  preference: [
    'prefer', 'like', 'dislike', 'favorite', 'want', 'dont want', "don't want",
    'always', 'never', 'usually', 'hate', 'love', 'enjoy', 'choose', 'rather',
    'better', 'best', 'worst', 'style', 'tone', 'format', 'language',
  ],
  episodic: [
    'yesterday', 'last time', 'previously', 'before', 'remember when',
    'earlier', 'recently', 'once', 'ago', 'last week', 'last month',
    'happened', 'occurred', 'event', 'meeting', 'conversation',
  ],
  procedural: [
    'how to', 'step', 'process', 'method', 'procedure', 'workflow',
    'first', 'then', 'next', 'finally', 'instruction', 'guide',
    'recipe', 'algorithm', 'approach', 'technique', 'way to',
  ],
  semantic: [
    'fact', 'definition', 'means', 'is a', 'refers to', 'known as',
    'concept', 'theory', 'principle', 'rule', 'law', 'property',
    'characteristic', 'attribute', 'belongs to', 'category of',
  ],
  general: [],
};

function autoCategorize(content: string): MemoryCategory {
  const lowerContent = content.toLowerCase();
  let bestCategory: MemoryCategory = 'general';
  let bestScore = 0;

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (category === 'general') continue;
    let score = 0;
    for (const keyword of keywords) {
      if (lowerContent.includes(keyword)) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      bestCategory = category as MemoryCategory;
    }
  }

  return bestCategory;
}

function extractTags(content: string): string[] {
  const lowerContent = content.toLowerCase();
  const tags = new Set<string>();

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (category === 'general') continue;
    for (const keyword of keywords) {
      if (lowerContent.includes(keyword)) { tags.add(category); break; }
    }
  }

  const topicPatterns = [
    /\b(python|javascript|typescript|react|next\.js|node\.js|rust|go|java)\b/gi,
    /\b(api|database|server|client|frontend|backend|deploy|docker|kubernetes)\b/gi,
    /\b(email|calendar|task|project|team|meeting|report|document)\b/gi,
    /\b(sales|marketing|support|research|analytics|finance|accounting)\b/gi,
    /\b(twitter|facebook|instagram|linkedin|youtube|tiktok|whatsapp)\b/gi,
  ];

  for (const pattern of topicPatterns) {
    const matches = lowerContent.match(pattern);
    if (matches) {
      for (const match of matches) tags.add(match.toLowerCase());
    }
  }

  return Array.from(tags).slice(0, 10);
}

// ---------------------------------------------------------------------------
// TF-IDF style keyword scoring
// ---------------------------------------------------------------------------

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

function termFrequency(tokens: string[]): Map<string, number> {
  const tf = new Map<string, number>();
  const total = tokens.length;
  if (total === 0) return tf;
  for (const token of tokens) tf.set(token, (tf.get(token) || 0) + 1);
  for (const [key, val] of tf.entries()) tf.set(key, val / total);
  return tf;
}

function keywordMatchScore(queryTokens: string[], contentTokens: string[]): number {
  if (queryTokens.length === 0 || contentTokens.length === 0) return 0;

  const contentTF = termFrequency(contentTokens);
  const querySet = new Set(queryTokens);
  let score = 0;
  let matchedTerms = 0;

  for (const qToken of queryTokens) {
    if (contentTF.has(qToken)) {
      score += contentTF.get(qToken)!;
      matchedTerms++;
    }
    for (const [cToken, cFreq] of contentTF.entries()) {
      if (cToken.startsWith(qToken) || qToken.startsWith(cToken)) {
        if (!querySet.has(cToken)) {
          score += cFreq * 0.5;
          matchedTerms++;
        }
      }
    }
  }

  const coverage = matchedTerms / queryTokens.length;
  return Math.min(1, score * coverage);
}

// ---------------------------------------------------------------------------
// Relevance decay
// ---------------------------------------------------------------------------

function decayRelevance(
  baseRelevance: number,
  lastAccessedAt: Date,
  accessCount: number
): number {
  const now = new Date();
  const daysSinceAccess = (now.getTime() - lastAccessedAt.getTime()) / (1000 * 60 * 60 * 24);
  const lambda = 0.05;
  const decayFactor = Math.exp(-lambda * daysSinceAccess);
  const accessBoost = Math.min(2, 1 + Math.log2(accessCount + 1) * 0.2);
  return Math.min(1, baseRelevance * decayFactor * accessBoost);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function safeParseJSON<T>(json: string | undefined | null, fallback: T = [] as unknown as T): T {
  if (!json) return fallback;
  try { return JSON.parse(json) as T; } catch { return fallback; }
}

function calculateStringSimilarity(a: string, b: string): number {
  const shorter = a.length < b.length ? a : b;
  const longer = a.length < b.length ? b : a;
  if (longer.length === 0) return 1;
  const editDistance = levenshtein(shorter, longer);
  return (longer.length - editDistance) / longer.length;
}

function levenshtein(a: string, b: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      matrix[i][j] = b[i - 1] === a[j - 1]
        ? matrix[i - 1][j - 1]
        : 1 + Math.min(matrix[i - 1][j - 1], matrix[i][j - 1], matrix[i - 1][j]);
    }
  }
  return matrix[b.length][a.length];
}

function serializeMemory(memory: {
  id: string;
  agentId: string;
  userId: string;
  category: string;
  content: string;
  context: string;
  source: string;
  relevance: number;
  tags: string;
  accessCount: number;
  lastAccessedAt: Date;
  createdAt: Date;
  expiresAt: Date | null;
}): AgentMemoryResult {
  return {
    id: memory.id,
    agentId: memory.agentId,
    userId: memory.userId,
    category: memory.category,
    content: memory.content,
    context: safeParseJSON<Record<string, unknown>>(memory.context, {}),
    source: memory.source,
    relevance: memory.relevance,
    tags: safeParseJSON<string[]>(memory.tags, []),
    accessCount: memory.accessCount,
    lastAccessedAt: memory.lastAccessedAt,
    createdAt: memory.createdAt,
    expiresAt: memory.expiresAt,
  };
}

// ---------------------------------------------------------------------------
// Core: storeMemory
// ---------------------------------------------------------------------------

export async function storeMemory(
  agentId: string,
  userId: string,
  content: string,
  options: StoreMemoryOptions = {}
): Promise<AgentMemoryResult> {
  const category = options.category || autoCategorize(content);
  const tags = options.tags || extractTags(content);

  let relevance = options.relevance ?? 0.5;
  if (options.category) relevance = Math.min(1, relevance + 0.1);
  if (category === 'preference') relevance = Math.max(relevance, 0.7);
  if (category === 'procedural') relevance = Math.max(relevance, 0.6);

  const existingMemories = await db.agentMemory.findMany({
    where: {
      agentId,
      userId,
      content: { contains: content.substring(0, 50) },
    },
    take: 5,
  });

  for (const existing of existingMemories) {
    const similarity = calculateStringSimilarity(content, existing.content);
    if (similarity > 0.85) {
      const updated = await db.agentMemory.update({
        where: { id: existing.id },
        data: {
          relevance: Math.min(1, existing.relevance + 0.1),
          accessCount: existing.accessCount + 1,
          lastAccessedAt: new Date(),
          tags: JSON.stringify([...new Set([...tags, ...safeParseJSON<string[]>(existing.tags)])]),
        },
      });
      return serializeMemory(updated);
    }
  }

  const memory = await db.agentMemory.create({
    data: {
      agentId,
      userId,
      category,
      content,
      context: JSON.stringify(options.context || {}),
      source: options.source || 'interaction',
      relevance,
      tags: JSON.stringify(tags),
      expiresAt: options.expiresAt || null,
    },
  });

  return serializeMemory(memory);
}

// ---------------------------------------------------------------------------
// Core: retrieveMemories
// ---------------------------------------------------------------------------

export async function retrieveMemories(
  agentId: string,
  userId: string,
  query: string,
  options: RetrieveMemoriesOptions = {}
): Promise<AgentMemoryResult[]> {
  const { category, limit = 10, minRelevance = 0.2, includeExpired = false } = options;

  const where: Record<string, unknown> = { agentId, userId };
  if (category) where.category = category;

  if (!includeExpired) {
    where.OR = [
      { expiresAt: null },
      { expiresAt: { gt: new Date() } },
    ];
  }

  // Fetch a larger pool for client-side relevance ranking
  const candidates = await db.agentMemory.findMany({
    where,
    orderBy: [{ relevance: 'desc' }, { lastAccessedAt: 'desc' }],
    take: limit * 5,
  });

  if (candidates.length === 0) return [];

  const queryTokens = tokenize(query);

  // Score each candidate: base relevance × time decay × keyword match
  const scored = candidates.map((mem) => {
    const contentTokens = tokenize(mem.content);
    const kwScore = queryTokens.length > 0 ? keywordMatchScore(queryTokens, contentTokens) : 0;
    const decayed = decayRelevance(mem.relevance, mem.lastAccessedAt, mem.accessCount);
    const finalScore = decayed * 0.6 + kwScore * 0.4;
    return { mem, finalScore };
  });

  // Sort by final score descending, filter by minRelevance
  const results = scored
    .filter((s) => s.finalScore >= minRelevance)
    .sort((a, b) => b.finalScore - a.finalScore)
    .slice(0, limit)
    .map((s) => s.mem);

  // Update access count and lastAccessedAt for retrieved memories
  const ids = results.map((m) => m.id);
  if (ids.length > 0) {
    await db.agentMemory.updateMany({
      where: { id: { in: ids } },
      data: { accessCount: { increment: 1 }, lastAccessedAt: new Date() },
    });
  }

  return results.map(serializeMemory);
}

// ---------------------------------------------------------------------------
// Core: getMemoryStats
// ---------------------------------------------------------------------------

export async function getMemoryStats(
  agentId: string,
  userId: string
): Promise<MemoryStats> {
  const memories = await db.agentMemory.findMany({
    where: { agentId, userId },
    orderBy: { accessCount: 'desc' },
    take: 500,
  });

  const totalMemories = memories.length;

  const categories: Record<string, number> = {};
  let relevanceSum = 0;
  const tagCounts: Record<string, number> = {};

  for (const m of memories) {
    categories[m.category] = (categories[m.category] || 0) + 1;
    relevanceSum += m.relevance;
    for (const tag of safeParseJSON<string[]>(m.tags, [])) {
      tagCounts[tag] = (tagCounts[tag] || 0) + 1;
    }
  }

  const averageRelevance =
    totalMemories > 0 ? Math.round((relevanceSum / totalMemories) * 100) / 100 : 0;

  const mostAccessed = memories
    .sort((a, b) => b.accessCount - a.accessCount)
    .slice(0, 5)
    .map((m) => ({ id: m.id, content: m.content.substring(0, 100), accessCount: m.accessCount }));

  const recentMemories = [...memories]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 5)
    .map((m) => ({ id: m.id, content: m.content.substring(0, 100), createdAt: m.createdAt }));

  const topTags = Object.entries(tagCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([tag, count]) => ({ tag, count }));

  return { totalMemories, categories, averageRelevance, mostAccessed, recentMemories, topTags };
}

// ---------------------------------------------------------------------------
// Core: updateMemory
// ---------------------------------------------------------------------------

export async function updateMemory(
  agentId: string,
  userId: string,
  memoryId: string,
  updates: Partial<Pick<AgentMemoryResult, 'content' | 'relevance' | 'tags' | 'expiresAt'>>
): Promise<AgentMemoryResult | null> {
  const existing = await db.agentMemory.findFirst({
    where: { id: memoryId, agentId, userId },
  });

  if (!existing) return null;

  const data: Record<string, unknown> = {};
  if (updates.content !== undefined) data.content = updates.content;
  if (updates.relevance !== undefined) data.relevance = Math.min(1, Math.max(0, updates.relevance));
  if (updates.tags !== undefined) data.tags = JSON.stringify(updates.tags);
  if (updates.expiresAt !== undefined) data.expiresAt = updates.expiresAt;

  const updated = await db.agentMemory.update({
    where: { id: memoryId },
    data,
  });

  return serializeMemory(updated);
}

// ---------------------------------------------------------------------------
// Core: deleteMemory
// ---------------------------------------------------------------------------

export async function deleteMemory(
  agentId: string,
  userId: string,
  memoryId: string
): Promise<boolean> {
  const existing = await db.agentMemory.findFirst({
    where: { id: memoryId, agentId, userId },
  });

  if (!existing) return false;

  await db.agentMemory.delete({ where: { id: memoryId } });
  return true;
}

// ---------------------------------------------------------------------------
// Core: pruneMemories
// ---------------------------------------------------------------------------

export async function pruneMemories(
  agentId: string,
  userId: string,
  options: {
    maxMemories?: number;
    minRelevance?: number;
    deleteExpired?: boolean;
  } = {}
): Promise<number> {
  const { maxMemories = 1000, minRelevance = 0.05, deleteExpired = true } = options;
  let deleted = 0;

  // Remove expired memories
  if (deleteExpired) {
    const result = await db.agentMemory.deleteMany({
      where: {
        agentId,
        userId,
        expiresAt: { lt: new Date() },
      },
    });
    deleted += result.count;
  }

  // Remove low-relevance memories
  const lowRelevanceResult = await db.agentMemory.deleteMany({
    where: {
      agentId,
      userId,
      relevance: { lt: minRelevance },
    },
  });
  deleted += lowRelevanceResult.count;

  // Enforce max memory count (remove oldest/least relevant)
  const total = await db.agentMemory.count({ where: { agentId, userId } });
  if (total > maxMemories) {
    const toDelete = await db.agentMemory.findMany({
      where: { agentId, userId },
      orderBy: [{ relevance: 'asc' }, { lastAccessedAt: 'asc' }],
      take: total - maxMemories,
      select: { id: true },
    });
    const ids = toDelete.map((m) => m.id);
    if (ids.length > 0) {
      const pruneResult = await db.agentMemory.deleteMany({
        where: { id: { in: ids } },
      });
      deleted += pruneResult.count;
    }
  }

  return deleted;
}

// ---------------------------------------------------------------------------
// Core: learnFromConversation
// ---------------------------------------------------------------------------

export async function learnFromConversation(
  agentId: string,
  userId: string,
  messages: Array<{ role: string; content: string }>,
  learnings: string[]
): Promise<AgentMemoryResult[]> {
  const stored: AgentMemoryResult[] = [];

  for (const learning of learnings) {
    if (!learning || learning.trim().length < 10) continue;
    const memory = await storeMemory(agentId, userId, learning, {
      source: 'interaction',
      context: {
        messageCount: messages.length,
        extractedAt: new Date().toISOString(),
      },
    });
    stored.push(memory);
  }

  return stored;
}
