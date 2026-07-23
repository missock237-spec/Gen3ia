/**
 * Streaming LLM en temps réel via OpenAI SDK.
 * Remplace la simulation du stream/route.ts par un vrai streaming.
 */

import OpenAI from "openai";
import { logger } from "@/lib/logger";

interface StreamConfig {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
}

interface StreamEvent {
  type: "start" | "thought" | "token" | "tool_call" | "complete" | "error";
  content?: string;
  userId?: string;
  step?: number;
  toolName?: string;
  toolArgs?: string;
  finishReason?: string;
  timestamp?: string;
}

export class LLMStreamer {
  private client: OpenAI | null = null;

  constructor() {
    this.initClient();
  }

  private initClient(): void {
    const apiKey = process.env.OPENAI_API_KEY;
    if (apiKey) {
      this.client = new OpenAI({ apiKey });
      logger.info("LLMStreamer: OpenAI client initialized");
    } else {
      logger.warn("LLMStreamer: No OPENAI_API_KEY, using fallback simulation");
    }
  }

  async *streamResponse(
    message: string,
    userId?: string,
    config: StreamConfig = {}
  ): AsyncGenerator<StreamEvent, void, unknown> {
    const model = config.model || "gpt-4o-mini";
    const temperature = config.temperature ?? 0.7;
    const maxTokens = config.maxTokens ?? 1024;
    const systemPrompt =
      config.systemPrompt ||
      "Tu es Genova, un assistant IA autonome. Réponds de façon concise et précise en français.";

    yield {
      type: "start",
      content: "Agent Genova démarré",
      userId,
      timestamp: new Date().toISOString(),
    };

    yield {
      type: "thought",
      content: "Analyse de la requête...",
      step: 1,
      timestamp: new Date().toISOString(),
    };

    if (this.client) {
      try {
        const stream = await this.client.chat.completions.create({
          model,
          temperature,
          max_tokens: maxTokens,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: message },
          ],
          stream: true,
        });

        let fullContent = "";

        for await (const chunk of stream) {
          const delta = chunk.choices?.[0]?.delta;

          if (delta?.content) {
            fullContent += delta.content;
            yield {
              type: "token",
              content: delta.content,
              userId,
              timestamp: new Date().toISOString(),
            };
          }

          if (delta?.tool_calls) {
            for (const toolCall of delta.tool_calls) {
              yield {
                type: "tool_call",
                toolName: toolCall.function?.name,
                toolArgs: toolCall.function?.arguments,
                timestamp: new Date().toISOString(),
              };
            }
          }

          const finishReason = chunk.choices?.[0]?.finish_reason;
          if (finishReason) {
            yield {
              type: "complete",
              content: fullContent,
              userId,
              finishReason,
              timestamp: new Date().toISOString(),
            };
            return;
          }
        }

        yield {
          type: "complete",
          content: fullContent,
          userId,
          finishReason: "stop",
          timestamp: new Date().toISOString(),
        };
      } catch (error) {
        logger.error("LLM stream error", { error });
        yield {
          type: "error",
          content: `Erreur LLM: ${error instanceof Error ? error.message : "Erreur inconnue"}`,
          timestamp: new Date().toISOString(),
        };
      }
    } else {
      logger.info("LLMStreamer: Using fallback simulation");

      const thoughts = [
        "Recherche des informations pertinentes...",
        "Consultation des connecteurs disponibles...",
        "Élaboration du plan d'action...",
      ];

      for (let i = 0; i < thoughts.length; i++) {
        yield {
          type: "thought",
          content: thoughts[i],
          step: i + 2,
          timestamp: new Date().toISOString(),
        };
      }

      const response = `Requête traitée: "${message.substring(0, 100)}"`;
      for (const char of response) {
        yield {
          type: "token",
          content: char,
          userId,
          timestamp: new Date().toISOString(),
        };
      }

      yield {
        type: "complete",
        content: response,
        userId,
        finishReason: "stop",
        timestamp: new Date().toISOString(),
      };
    }
  }
}

export const llmStreamer = new LLMStreamer();
