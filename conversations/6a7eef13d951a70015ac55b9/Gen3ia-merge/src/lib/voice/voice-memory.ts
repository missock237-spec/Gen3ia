import { createLogger } from '@/lib/logger';
import { db } from '@/lib/db';
const log = createLogger('voice-memory');
export interface VoiceMemoryEntry { id: string; userId: string; agentId?: string; type: 'preference' | 'conversation' | 'command' | 'emotion'; transcription: string; audioEmbedding?: number[]; metadata: Record<string, unknown>; createdAt: string; }
function extractKeywords(text: string): string[] {
  const stopWords = new Set(['a','an','the','is','are','was','were','be','been','being','have','has','had','do','does','did','will','would','could','should','may','might','can','shall','to','of','in','for','on','with','at','by','from','as','into','about','like','through','after','over','between','out','against','during','without','before','under','around','among','and','but','or','nor','not','so','yet','both','either','neither','each','every','all','any','few','more','most','other','some','such','no','only','own','same','than','too','very','just','because','if','when','while','how','what','which','who','whom','this','that','these','those','i','me','my','we','our','you','your','he','him','his','she','her','it','its','they','them','their']);
  return text.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/).filter(w => w.length > 2 && !stopWords.has(w));
}
function computeRelevance(queryKeywords: string[], contentKeywords: string[]): number {
  if (queryKeywords.length === 0 || contentKeywords.length === 0) return 0;
  let matches = 0;
  for (const qk of queryKeywords) { if (contentKeywords.some(ck => ck.includes(qk) || qk.includes(ck))) matches++; }
  return matches / queryKeywords.length;
}
export class VoiceMemorySystem {
  constructor() {}
  async storeMemory(userId: string, transcription: string, audioBuffer?: Buffer, metadata: Record<string, unknown> = {}): Promise<VoiceMemoryEntry> {
    const type = (metadata.type as VoiceMemoryEntry['type']) ?? 'conversation';
    const lower = transcription.toLowerCase();
    const category = lower.includes('i prefer') || lower.includes('i like') ? 'preference' : lower.startsWith('call ') || lower.startsWith('send ') ? 'command' : lower.includes('i feel') ? 'emotion' : 'general';
    const keywords = extractKeywords(transcription);
    try {
      const record = await db.voiceMemory.create({ data: { userId, voiceSessionId: metadata.sessionId as string | undefined, category, content: transcription, durationMs: (metadata.durationMs as number) ?? 0, language: (metadata.language as string) ?? 'en-US', confidence: (metadata.confidence as number) ?? 0.8, tags: JSON.stringify(keywords.slice(0, 20)), metadata: JSON.stringify(metadata) } });
      return { id: record.id, userId: record.userId, agentId: metadata.agentId as string | undefined, type, transcription: record.content, metadata, createdAt: record.createdAt.toISOString() };
    } catch (error) { log.error('Failed to store voice memory', { error: String(error) }); throw error; }
  }
  async searchMemories(userId: string, query: string, limit: number = 10): Promise<VoiceMemoryEntry[]> {
    const queryKeywords = extractKeywords(query);
    const memories = await db.voiceMemory.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: Math.min(limit * 5, 200) });
    const scored = memories.map(m => ({ memory: m, score: computeRelevance(queryKeywords, extractKeywords(m.content)) * 0.7 + Math.max(0, 1 - (Date.now() - m.createdAt.getTime()) / (7 * 24 * 60 * 60 * 1000)) * 0.2 + m.confidence * 0.1 }));
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit).map(({ memory }) => ({ id: memory.id, userId: memory.userId, type: (memory.category === 'command' ? 'command' : memory.category === 'preference' ? 'preference' : 'conversation') as VoiceMemoryEntry['type'], transcription: memory.content, metadata: JSON.parse(memory.metadata || '{}'), createdAt: memory.createdAt.toISOString() }));
  }
  async getConversationContext(userId: string, currentQuery: string): Promise<string> {
    const memories = await this.searchMemories(userId, currentQuery, 5);
    if (memories.length === 0) return '';
    return 'Relevant voice memories:\n' + memories.map((m, i) => `[Memory ${i + 1} - ${m.type}]: ${m.transcription.slice(0, 200)}`).join('\n');
  }
  async deleteMemory(memoryId: string): Promise<boolean> {
    try { await db.voiceMemory.delete({ where: { id: memoryId } }); return true; } catch { return false; }
  }
  async listMemories(userId: string, options: { category?: string; limit?: number; offset?: number } = {}): Promise<{ memories: Array<{ id: string; content: string; category: string; confidence: number; tags: string[]; createdAt: Date }>; total: number }> {
    const { category, limit = 20, offset = 0 } = options;
    const where = { userId, ...(category ? { category } : {}) };
    const [memories, total] = await Promise.all([
      db.voiceMemory.findMany({ where, orderBy: { createdAt: 'desc' }, take: limit, skip: offset }),
      db.voiceMemory.count({ where }),
    ]);
    return { memories: memories.map(m => ({ id: m.id, content: m.content, category: m.category, confidence: m.confidence, tags: JSON.parse(m.tags || '[]'), createdAt: m.createdAt })), total };
  }
}