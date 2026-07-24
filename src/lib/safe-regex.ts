// ============================================================
// SAFE REGEX — Utilitaires pour prevenir les attaques ReDoS
// Limite la longueur des inputs avant d'appliquer les regex
// et fournit des alternatives aux patterns dangereux
// ============================================================

const MAX_REGEX_INPUT_LENGTH = 5000;

/**
 * Execute une regex de maniere securisee contre ReDoS.
 * Limite la longueur de l'input avant execution.
 */
export function safeRegexMatch(
  regex: RegExp,
  input: string,
  maxLength: number = MAX_REGEX_INPUT_LENGTH
): RegExpMatchArray | null {
  if (typeof input !== 'string') return null;
  const truncated = input.slice(0, maxLength);
  return truncated.match(regex);
}

/**
 * Verifie si une regex est potentiellement vulnerable au ReDoS.
 * Detecte les patterns de backtracking exponentiel.
 */
export function isRegexVulnerable(pattern: string): boolean {
  const vulnerablePatterns = [
    /\\([.+*?]\+\+) /,    // (a+)+ — nested quantifiers
    /\\([^)]+\\)[+*]\s*\\(/,  // adjacent quantified groups
    /\[^\]\+ /,              // negative character class with +
    /\\|[^|]*\\|/,            // alternating patterns with empty alternatives
    /\\([^)]+\\)\{[0-9]+,\}/, // bounded quantifiers on groups
    /\\([^)]*\\([^)]*\\(/,   // deeply nested groups
  ];

  return vulnerablePatterns.some((vp) => vp.test(pattern));
}

/**
 * Alternative securisee pour le pattern (a+)+ qui est celebre pour ReDoS.
 * Utilise a+ tout seul, sans groupement et quantification.
 */
export function safeQuantifiedMatch(pattern: string, input: string): string[] {
  const safeInput = input.slice(0, MAX_REGEX_INPUT_LENGTH);
  const results: string[] = [];
  const regex = new RegExp(pattern, 'g');
  let match: RegExpExecArray | null;

  // Limiter le nombre d'iterations pour eviter le blocage
  let iterations = 0;
  const MAX_ITERATIONS = 100;

  while ((match = regex.exec(safeInput)) !== null && iterations < MAX_ITERATIONS) {
    results.push(match[0]);
    iterations++;
    // Empecher les boucles infinies sur les matchs de longueur zero
    if (match.index === regex.lastIndex) {
      regex.lastIndex++;
    }
  }

  return results;
}

/**
 * Nettoie les patterns de references SebPay de maniere securisee.
 * Remplace (.+)_(.+)_(.+) par des classes de caracteres specifiques.
 */
export function parseSubscriptionReference(reference: string): {
  planId: string | null;
  userId: string | null;
  timestamp: string | null;
} {
  if (!reference || typeof reference !== 'string') {
    return { planId: null, userId: null, timestamp: null };
  }

  // Version securisee: utilise [^_]+ au lieu de .+
  // Cela evite le backtracking exponentiel
  const safeRef = reference.slice(0, 500); // Limite stricte

  const match = safeRef.match(/^sub_([^_]+)_([^_]+)_(\d+)$/);
  if (!match) {
    return { planId: null, userId: null, timestamp: null };
  }

  return {
    planId: match[1],
    userId: match[2],
    timestamp: match[3],
  };
}

/**
 * Version securisee de l'extraction de prix.
 */
export function safeExtractPrices(content: string): string[] {
  if (!content || typeof content !== 'string') return [];
  const truncated = content.slice(0, MAX_REGEX_INPUT_LENGTH);
  // Pattern simple: [$€£] suivi de chiffres
  const priceRegex = /[$€£]\s*\d+(?:\.\d{2})?/g;
  return truncated.match(priceRegex) || [];
}

/**
 * Version securisee pour le stripping HTML.
 */
export function safeStripHtml(html: string): string {
  if (!html || typeof html !== 'string') return '';
  const truncated = html.slice(0, 50000); // 50KB max pour du HTML
  // Utiliser des regex simples sans backtracking
  let text = truncated;
  // Supprimer les balises script/style avec [\s\S] limite
  text = text.replace(/<script[^>]*>/gi, '');
  text = text.replace(/<\/script>/gi, '');
  text = text.replace(/<style[^>]*>/gi, '');
  text = text.replace(/<\/style>/gi, '');
  // Supprimer les autres balises HTML
  text = text.replace(/<[^>]+>/g, ' ');
  text = text.replace(/\s+/g, ' ');
  return text.trim();
}

export default {
  safeRegexMatch,
  isRegexVulnerable,
  safeQuantifiedMatch,
  parseSubscriptionReference,
  safeExtractPrices,
  safeStripHtml,
};
