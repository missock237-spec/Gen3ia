// ============================================================
// GUARDRAIL — Détection et blocage des injections de prompt
// ============================================================
// Protège les agents contre :
//   - Injection de prompt ("Ignore les instructions précédentes")
//   - Jailbreak ("Act as DAN", "Do anything now")
//   - Extraction de prompt système
//   - Contenu interdit
// ============================================================

import { logger } from "./logger";

const MALICIOUS_PATTERNS: Array<{ pattern: RegExp; severity: "low" | "medium" | "high" | "critical"; label: string }> = [
  // Tentatives de jailbreak
  { pattern: /ignore\s*(?:all\s*)?(?:previous|above|prior|the\s+above|all)\s*(?:instructions|directions|prompts?|commands?)/i, severity: "critical", label: "jailbreak_ignore_prompt" },
  { pattern: /(?:act\s+as|pretend\s+(?:to\s+)?be|you\s+are\s+now)\s+(?:dan|do\s+anything\s+now|jailbreak|unfiltered|uncensored)/i, severity: "critical", label: "jailbreak_dan" },
  { pattern: /you\s+(?:have|are)\s+(?:to\s+)?(?:bypass|ignore|override|break)\s+(?:your|the)\s+(?:rules|guidelines|ethics|safety|restrictions)/i, severity: "critical", label: "jailbreak_bypass" },

  // Extraction de prompt système
  { pattern: /(?:print|display|show|reveal|output|return)\s+(?:your|the)\s+(?:system\s+)?(?:prompt|instructions|directions|message|initial)/i, severity: "high", label: "prompt_extraction" },
  { pattern: /what\s+(?:are|is)\s+(?:your|the)\s+(?:system\s+)?(?:prompt|instructions|guidelines|rules)/i, severity: "high", label: "prompt_extraction_question" },
  { pattern: /(?:repeat|say|write|type|output)\s+(?:the\s+)?(?:first|above|previous|initial)\s+\w+(?:\s+sentence|\s+line|\s+paragraph|\s+words?)/i, severity: "high", label: "prompt_leak" },

  // Injection de code
  { pattern: /```\s*(?:sql|bash|sh|powershell|cmd|python|javascript|js)\s*[\s\S]*?(?:drop\s+table|delete\s+from|rm\s+-rf|format\s+|shutdown|reboot)/i, severity: "critical", label: "malicious_code" },
  { pattern: /(?:<script|javascript:|onerror=|onload=|onclick=)/i, severity: "high", label: "xss_attempt" },

  // Contournement de modération
  { pattern: /(?:dan|dual\s+(?:role|personality)|unethical|illegal|harmful|dangerous)\s+(?:mode|response|output)/i, severity: "medium", label: "moderation_bypass" },

  // Contenu interdit
  { pattern: /(?:how\s+to|instructions?\s+for|steps?\s+to)\s*(?:make|create|build|manufacture)\s*(?:bomb|explosive|weapon|drug|poison|illegal)/i, severity: "critical", label: "dangerous_content" },
  { pattern: /(?:hack|crack|exploit|breach|unauthorized)\s*(?:into|access|login|password|account|system)/i, severity: "high", label: "hacking_attempt" },
];

const SEVERITY_SCORES: Record<string, number> = {
  low: 1,
  medium: 5,
  high: 15,
  critical: 30,
};

const BLOCK_THRESHOLD = 10;
const WARN_THRESHOLD = 3;

export interface GuardrailResult {
  allowed: boolean;
  score: number;
  detections: Array<{ label: string; severity: string; pattern: string; position: number }>;
  action: "allow" | "block" | "warn";
  message?: string;
}

class GuardrailEngine {
  /**
   * Analyse un texte et retourne si l'accès est autorisé.
   */
  analyze(input: string): GuardrailResult {
    const detections: GuardrailResult["detections"] = [];
    let totalScore = 0;

    for (const { pattern, severity, label } of MALICIOUS_PATTERNS) {
      const match = input.match(pattern);
      if (match) {
        const score = SEVERITY_SCORES[severity] ?? 5;
        totalScore += score;
        detections.push({
          label,
          severity,
          pattern: pattern.source.slice(0, 100),
          position: match.index ?? 0,
        });
      }
    }

    let action: GuardrailResult["action"] = "allow";
    let message: string | undefined;

    if (totalScore >= BLOCK_THRESHOLD) {
      action = "block";
      message = `Requête bloquée par le guardrail (score: ${totalScore}). ${detections.map((d) => `[${d.severity.toUpperCase()}] ${d.label}`).join(", ")}`;
    } else if (totalScore >= WARN_THRESHOLD) {
      action = "warn";
      message = `Requête suspecte (score: ${totalScore}).`;
    }

    if (detections.length > 0) {
      logger.warn("guardrail_detection", {
        action,
        score: totalScore,
        detectionCount: detections.length,
        detections: detections.map((d) => `${d.label}(${d.severity})`),
      });
    }

    return {
      allowed: action !== "block",
      score: totalScore,
      detections,
      action,
      message,
    };
  }

  getActivePatterns() {
    return MALICIOUS_PATTERNS.map((p) => ({
      label: p.label,
      severity: p.severity,
      pattern: p.pattern.source.slice(0, 120),
    }));
  }
}

export const guardrail = new GuardrailEngine();
export default guardrail;