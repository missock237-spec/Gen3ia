// ============================================================
// COMPRESSEUR DE CONTEXTE — Réduit la consommation de tokens
// ============================================================
// Pour les conversations longues, résume automatiquement les
// anciens tours de conversation pour garder un contexte pertinent
// sans exploser le budget de tokens.
// ============================================================

import { logger } from "./logger";

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
  timestamp: string;
  tokens?: number;
}

interface CompressionResult {
  messages: ChatMessage[];
  summary: string;
  originalTokens: number;
  compressedTokens: number;
  savedTokens: number;
  savedPercent: string;
}

interface CompressorConfig {
  maxTokensBeforeCompression: number;
  keepRecentMessages: number;
  summaryModel: string;
  minSummaryLength: number;
}

const DEFAULT_CONFIG: CompressorConfig = {
  maxTokensBeforeCompression: 4096,
  keepRecentMessages: 6,
  summaryModel: "gpt-4o-mini",
  minSummaryLength: 100,
};

// Estimation approximative du nombre de tokens
function estimateTokens(text: string): number {
  // Ratio moyen : 1 token ≈ 4 caractères pour du texte mixte
  return Math.ceil(text.length / 4);
}

function estimateMessagesTokens(messages: ChatMessage[]): number {
  return messages.reduce((sum, msg) => sum + (msg.tokens ?? estimateTokens(msg.content)), 0);
}

class ContextCompressor {
  private config: CompressorConfig;

  constructor(config: Partial<CompressorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Compresse une liste de messages si elle dépasse le seuil de tokens.
   */
  async compress(messages: ChatMessage[]): Promise<CompressionResult> {
    const originalTokens = estimateMessagesTokens(messages);

    if (originalTokens <= this.config.maxTokensBeforeCompression) {
      return {
        messages,
        summary: "",
        originalTokens,
        compressedTokens: originalTokens,
        savedTokens: 0,
        savedPercent: "0%",
      };
    }

    logger.info("context_compression_started", {
      originalTokens,
      messageCount: messages.length,
      threshold: this.config.maxTokensBeforeCompression,
    });

    // Séparer : messages récents (gardés intacts) + anciens (à résumer)
    const recentMessages = messages.slice(-this.config.keepRecentMessages);
    const oldMessages = messages.slice(0, -this.config.keepRecentMessages);

    // Générer le résumé des anciens messages
    const summary = await this.summarizeMessages(oldMessages);

    // Construire le nouveau contexte
    const compressedMessages: ChatMessage[] = [
      {
        role: "system",
        content: `[Résumé de la conversation précédente]\n${summary}\n\n---\n*Ce résumé a été généré automatiquement pour économiser des tokens. Les ${this.config.keepRecentMessages} derniers messages sont conservés intégralement.*`,
        timestamp: new Date().toISOString(),
        tokens: estimateTokens(summary),
      },
      ...recentMessages,
    ];

    const compressedTokens = estimateMessagesTokens(compressedMessages);
    const savedTokens = originalTokens - compressedTokens;

    logger.info("context_compression_completed", {
      originalTokens,
      compressedTokens,
      savedTokens,
      savedPercent: `${((savedTokens / originalTokens) * 100).toFixed(0)}%`,
      originalMessages: messages.length,
      compressedMessages: compressedMessages.length,
    });

    return {
      messages: compressedMessages,
      summary,
      originalTokens,
      compressedTokens,
      savedTokens,
      savedPercent: `${((savedTokens / originalTokens) * 100).toFixed(0)}%`,
    };
  }

  /**
   * Résume une liste de messages via un LLM (ou fallback simple).
   */
  private async summarizeMessages(messages: ChatMessage[]): Promise<string> {
    const apiKey = process.env.OPENAI_API_KEY ?? "";

    if (apiKey) {
      try {
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: this.config.summaryModel,
            messages: [
              {
                role: "system",
                content: "Vous êtes un assistant qui résume des conversations. Conservez les informations clés, les décisions prises, les préférences utilisateur et le contexte important. Répondez en français.",
              },
              {
                role: "user",
                content: `Résumez cette conversation en ${this.config.minSummaryLength} mots minimum :\n\n${messages.map((m) => `[${m.role.toUpperCase()}] ${m.content}`).join("\n\n")}`,
              },
            ],
            max_tokens: 1024,
            temperature: 0.3,
          }),
        });

        if (!response.ok) throw new Error(`API error: ${response.status}`);
        const data = await response.json() as {
          choices: Array<{ message: { content: string } }>;
        };
        return data.choices[0]?.message?.content ?? "[Résumé non disponible]";
      } catch (error) {
        logger.error("context_summary_api_failed", {
          error: error instanceof Error ? error.message : String(error),
        });
        // Fallback : résumé extraitif simple
      }
    }

    // Fallback : extraire les premières phrases de chaque message
    const sentences = messages
      .flatMap((m) => m.content.split(/[.!?]+/).filter((s) => s.trim().length > 20))
      .slice(0, 10);

    if (sentences.length === 0) return "[Conversation antérieure]";

    return `Résumé extraitif des ${messages.length} échanges précédents :\n${sentences.map((s) => `- ${s.trim()}.`).join("\n")}`;
  }

  /**
   */
  getConfig(): CompressorConfig {
    return { ...this.config };
  }

  /**
   */
  estimateTokens(text: string): number {
    return estimateTokens(text);
  }
}

export const contextCompressor = new ContextCompressor();
export default contextCompressor;
