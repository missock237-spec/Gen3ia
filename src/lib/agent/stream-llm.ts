/** Streaming LLM avec ResourceGuard */
import OpenAI from "openai";
import { logger } from "@/lib/logger";
import { limitString } from "@/lib/resource-guard";
interface StreamConfig { model?: string; temperature?: number; maxTokens?: number; systemPrompt?: string; }
interface StreamEvent { type: "start"|"thought"|"token"|"tool_call"|"complete"|"error"; content?: string; userId?: string; step?: number; toolName?: string; toolArgs?: string; finishReason?: string; timestamp?: string; }
export class LLMStreamer {
  private client: OpenAI | null = null;
  constructor() { const apiKey = process.env.OPENAI_API_KEY; if (apiKey) { this.client = new OpenAI({ apiKey }); logger.info("LLMStreamer: OK"); } else { logger.warn("LLMStreamer: No key"); } }
  async *streamResponse(message: string, userId?: string, config: StreamConfig = {}): AsyncGenerator<StreamEvent, void, unknown> {
    const maxTokens = Math.min(config.maxTokens ?? 1024, 4096);
    const safeMsg = limitString(message, 5000);
    yield { type: "start", content: "Start", userId, timestamp: new Date().toISOString() };
    if (this.client) {
      try {
        const stream = await this.client.chat.completions.create({
          model: config.model||"gpt-4o-mini", temperature: config.temperature??0.7, max_tokens: maxTokens,
          messages: [{ role:"system", content: config.systemPrompt||"Tu es Genova" }, { role:"user", content: safeMsg }],
          stream: true,
        });
        let full = ""; let count = 0; const start = Date.now();
        for await (const chunk of stream) {
          if (count > maxTokens || Date.now()-start>60000 || full.length>100000) break;
          const d = chunk.choices?.[0]?.delta;
          if (d?.content) { full += d.content; count++; yield { type:"token", content:d.content, userId, timestamp:new Date().toISOString() }; }
          if (chunk.choices?.[0]?.finish_reason) { yield { type:"complete", content:limitString(full,100000), userId, finishReason:chunk.choices[0].finish_reason, timestamp:new Date().toISOString() }; return; }
        }
        yield { type:"complete", content:limitString(full,100000), userId, finishReason:"stop", timestamp:new Date().toISOString() };
      } catch(e) { yield { type:"error", content: `Erreur: ${e instanceof Error?e.message:""}`, timestamp:new Date().toISOString() }; }
    } else {
      const r = `Traite: ${limitString(safeMsg,100)}`;
      for (let i=0;i<r.length&&i<1000;i++) { yield { type:"token", content:r[i], userId, timestamp:new Date().toISOString() }; }
      yield { type:"complete", content:r, userId, finishReason:"stop", timestamp:new Date().toISOString() };
    }
  }
}
export const llmStreamer = new LLMStreamer();
