import { logger } from "./logger";

export interface FactCheckResult {
  score: number;
  verdict: "reliable" | "uncertain" | "hallucination";
  claims: Array<{ claim: string; supported: boolean; confidence: number }>;
  suggestions: string[];
}

const API_KEY = process.env.OPENAI_API_KEY ?? "";

class HallucinationDetector {
  async analyze(response: string, context?: string): Promise<FactCheckResult> {
    if (!API_KEY) return this.fallbackAnalyze(response);
    try {
      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: "Tu es un expert en verification de faits. Analyse la reponse et retourne du JSON avec: score (0-100), claims (array de {claim, supported, confidence}), suggestions (array de string)." },
            { role: "user", content: `Contexte: ${context ?? "Aucun"}\nReponse: ${response}` },
          ],
          response_format: { type: "json_object" },
        }),
      });
      if (!r.ok) throw new Error(`API error: ${r.status}`);
      const data = await r.json() as { choices: Array<{ message: { content: string } }> };
      const parsed = JSON.parse(data.choices[0]!.message.content);
      const score = parsed.score ?? 50;
      const verdict: FactCheckResult["verdict"] = score >= 80 ? "reliable" : score >= 40 ? "uncertain" : "hallucination";
      logger.info("hallucination_check", { score, verdict });
      return { score, verdict, claims: parsed.claims ?? [], suggestions: parsed.suggestions ?? [] };
    } catch (error) {
      logger.error("hallucination_check_failed", { error: String(error) });
      return this.fallbackAnalyze(response);
    }
  }

  private fallbackAnalyze(response: string): FactCheckResult {
    const sentences = response.split(/[.!?]+/).filter((s) => s.trim().length > 20);
    return {
      score: 50, verdict: "uncertain",
      claims: sentences.slice(0, 5).map((s) => ({ claim: s.trim(), supported: false, confidence: 50 })),
      suggestions: ["API cle non configuree - verification limitee"],
    };
  }
}

export const hallucinationDetector = new HallucinationDetector();