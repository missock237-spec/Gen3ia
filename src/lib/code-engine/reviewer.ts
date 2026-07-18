/**
 * AI Code Reviewer — Analyse automatique de code
 * 
 * Avant deploiement ou execution, un agent reviewer analyse :
 * - Securite (patterns dangereux, injections)
 * - Performance (complexite, boucles inutiles)
 * - Style (conventions, nommage)
 * - Bonnes pratiques (gestion d'erreur, typage)
 */

export interface ReviewResult {
  score: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  summary: string;
  issues: ReviewIssue[];
  suggestions: string[];
  metrics: {
    lines: number;
    functions: number;
    classes: number;
    complexity: number;
    commentRatio: number;
  };
}

export interface ReviewIssue {
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  category: 'security' | 'performance' | 'style' | 'error-handling' | 'typing' | 'best-practice';
  message: string;
  line?: number;
  suggestion?: string;
}

/**
 * Analyse la securite du code
 */
function securityReview(code: string, lines: string[]): ReviewIssue[] {
  const issues: ReviewIssue[] = [];

  const securityPatterns = [
    { pattern: /eval\s*\(/, severity: 'critical' as const, message: 'eval() est une faille de securite majeure', suggestion: 'Utilise JSON.parse() ou une approche plus sure' },
    { pattern: /new\s+Function\s*\(/, severity: 'critical' as const, message: 'Constructeur Function dangereux', suggestion: 'Evite la creation dynamique de fonctions' },
    { pattern: /innerHTML/, severity: 'high' as const, message: 'innerHTML expose aux attaques XSS', suggestion: 'Utilise textContent ou innerText' },
    { pattern: /document\.write/, severity: 'high' as const, message: 'document.write() dangereux', suggestion: 'Utilise des methodes DOM modernes' },
    { pattern: /localStorage.*(?:token|key|secret|password)/i, severity: 'high' as const, message: 'Donnees sensibles dans localStorage', suggestion: 'Utilise un stockage crypte cote serveur' },
    { pattern: /\/\/\s*(?:TODO|FIXME|HACK|XXX)/, severity: 'low' as const, message: 'Code temporaire detecte', suggestion: 'Resous les TODOs avant deploiement' },
  ];

  for (const { pattern, severity, message, suggestion } of securityPatterns) {
    if (pattern.test(code)) {
      const line = lines.findIndex(l => pattern.test(l)) + 1;
      issues.push({ severity, category: 'security', message, line: line || undefined, suggestion });
    }
  }

  return issues;
}

/**
 * Analyse la performance du code
 */
function performanceReview(code: string, lines: string[]): ReviewIssue[] {
  const issues: ReviewIssue[] = [];

  // Boucles dans des boucles
  const nestedLoops = (code.match(/for\s*\(/g) || []).length;
  if (nestedLoops > 2) {
    issues.push({
      severity: 'medium', category: 'performance',
      message: nestedLoops + ' boucles for detectees, peut impacter les performances',
      suggestion: 'Envisage d\'utiliser map/filter/reduce ou un index' });
  }

  // await dans des boucles
  if (/for\s*\(.*await/.test(code)) {
    issues.push({
      severity: 'high', category: 'performance',
      message: 'await dans une boucle for : execution sequentielle lente',
      suggestion: 'Utilise Promise.all() pour paralleliser' });
  }

  // Tableaux volumineux
  const largeArrays = code.match(/Array\.from\(\{length:\s*(\d+)\}?\)/);
  if (largeArrays && parseInt(largeArrays[1]) > 10000) {
    issues.push({
      severity: 'medium', category: 'performance',
      message: 'Creation d\'un tableau de ' + largeArrays[1] + ' elements en memoire',
      suggestion: 'Utilise un generateur ou traite par lots' });
  }

  return issues;
}

/**
 * Analyse le style et les conventions
 */
function styleReview(code: string, lines: string[]): ReviewIssue[] {
  const issues: ReviewIssue[] = [];

  // Longueur de ligne
  lines.forEach((line, i) => {
    if (line.length > 120 && !line.trim().startsWith('//')) {
      issues.push({
        severity: 'low', category: 'style',
        message: 'Ligne ' + (i + 1) + ' trop longue (' + line.length + ' caracteres)',
        line: i + 1,
        suggestion: 'Limite les lignes a 120 caracteres max' });
    }
  });

  // Variables non utilisees (simples detection)
  const constVars = code.match(/const\s+(\w+)\s*=/g);
  if (constVars && constVars.length > 10) {
    issues.push({
      severity: 'info', category: 'best-practice',
      message: constVars.length + ' constantes declarees, verifie qu\'elles sont toutes utilisees',
      suggestion: 'Utilise un linter pour detecter les variables inutilisees' });
  }

  return issues;
}

/**
 * Analyse la gestion d'erreur
 */
function errorHandlingReview(code: string): ReviewIssue[] {
  const issues: ReviewIssue[] = [];

  const asyncFns = (code.match(/async\s+function/g) || []).length;
  const tryCatches = (code.match(/try\s*\{/g) || []).length;

  if (asyncFns > tryCatches) {
    issues.push({
      severity: 'high', category: 'error-handling',
      message: asyncFns + ' fonctions async mais seulement ' + tryCatches + ' blocs try/catch',
      suggestion: 'Ajoute une gestion d\'erreur pour chaque fonction async' });
  }

  if (!code.includes('catch') && code.includes('async')) {
    issues.push({
      severity: 'high', category: 'error-handling',
      message: 'Aucun bloc catch detecte dans du code asynchrone',
      suggestion: 'Ajoute try/catch pour capturer les erreurs' });
  }

  return issues;
}

/**
 * Analyse le typage
 */
function typingReview(code: string): ReviewIssue[] {
  const issues: ReviewIssue[] = [];

  if (/:\s*any/g.test(code)) {
    issues.push({
      severity: 'medium', category: 'typing',
      message: 'Utilisation du type any detectee',
      suggestion: 'Remplace any par un type specifique ou unknown' });
  }

  return issues;
}

/**
 * Execute une revue complete du code
 */
export function reviewCode(code: string): ReviewResult {
  const lines = code.split('\n');

  const allIssues: ReviewIssue[] = [
    ...securityReview(code, lines),
    ...performanceReview(code, lines),
    ...styleReview(code, lines),
    ...errorHandlingReview(code),
    ...typingReview(code),
  ];

  // Trier par severite
  allIssues.sort((a, b) => {
    const order = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
    return order[a.severity] - order[b.severity];
  });

  // Calculer le score
  const severityWeights = { critical: 30, high: 15, medium: 7, low: 3, info: 1 };
  const deductions = allIssues.reduce((sum, issue) => sum + (severityWeights[issue.severity] || 0), 0);
  const score = Math.max(0, Math.min(100, 100 - deductions));

  // Grade
  const grade = score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : score >= 40 ? 'D' : 'F';

  // Metriques
  const fnCount = (code.match(/function\s+\w+\s*\(/g) || []).length;
  const classCount = (code.match(/class\s+\w+/g) || []).length;
  const commentLines = lines.filter(l => l.trim().startsWith('//') || l.trim().startsWith('/*') || l.trim().startsWith('*')).length;
  const complexity = Math.max(1, (code.match(/if\s*\(|for\s*\(|while\s*\(|switch\s*\(|catch\s*\(/g) || []).length);

  // Suggestions
  const suggestions = allIssues
    .filter(i => i.suggestion)
    .map(i => i.suggestion as string)
    .filter((v, i, a) => a.indexOf(v) === i) // dedup
    .slice(0, 5);

  // Resume
  const criticalCount = allIssues.filter(i => i.severity === 'critical').length;
  const highCount = allIssues.filter(i => i.severity === 'high').length;
  const summary = criticalCount > 0
    ? criticalCount + ' probleme(s) critique(s) et ' + highCount + ' haute(s) priorite(s) detecte(s)'
    : highCount > 0
      ? highCount + ' probleme(s) haute priorite detecte(s)'
      : allIssues.length === 0
        ? 'Aucun probleme detecte, code de bonne qualite'
        : allIssues.length + ' amelioration(s) suggeree(s)';

  return {
    score,
    grade,
    summary,
    issues: allIssues,
    suggestions,
    metrics: {
      lines: lines.length,
      functions: fnCount,
      classes: classCount,
      complexity,
      commentRatio: lines.length > 0 ? Math.round((commentLines / lines.length) * 100) : 0,
    },
  };
}

/**
 * Genere un rapport de review lisible
 */
export function generateReviewReport(review: ReviewResult): string {
  const lines: string[] = [];
  lines.push('=== AI CODE REVIEW ===');
  lines.push('Score: ' + review.score + '/100 (Grade ' + review.grade + ')');
  lines.push('');
  lines.push('Metriques:');
  lines.push('  Lignes: ' + review.metrics.lines);
  lines.push('  Fonctions: ' + review.metrics.functions);
  lines.push('  Classes: ' + review.metrics.classes);
  lines.push('  Complexite: ' + review.metrics.complexity);
  lines.push('  Commentaires: ' + review.metrics.commentRatio + '%');
  lines.push('');
  lines.push('Problemes detectes: ' + review.issues.length);
  for (const issue of review.issues) {
    const label = { critical: '🔴', high: '🟠', medium: '🟡', low: '🔵', info: '⚪' }[issue.severity];
    lines.push('  ' + label + ' [' + issue.severity + '] ' + issue.message + (issue.line ? ' (ligne ' + issue.line + ')' : ''));
  }
  lines.push('');
  if (review.suggestions.length > 0) {
    lines.push('Suggestions:');
    review.suggestions.forEach(s => lines.push('  - ' + s));
  }
  return lines.join('\n');
}