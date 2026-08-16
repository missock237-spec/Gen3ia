// ============================================================
// INPUT SANITIZER — Point d'entrée unique pour la sanitization
// Délègue à sanitize.ts pour une couverture exhaustive
// ============================================================

import { sanitizeUrl, sanitizeHtml, sanitizeForDb, sanitizeFilename, sanitizeModelPath, escapeShellArg, sanitizePrompt as robustSanitizePrompt } from './sanitize';
import { PromptValidator } from '@/lib/security/prompt-validator';

const promptValidator = new PromptValidator();

export {
  sanitizeUrl,
  sanitizeHtml,
  sanitizeFilename,
};

export function sanitizeJson(input: unknown, maxDepth: number = 10): { valid: boolean; data: unknown; error?: string } {
  if (input === null || input === undefined) return { valid: true, data: input };
  let parsed: unknown;
  if (typeof input === 'string') { try { parsed = JSON.parse(input); } catch { return { valid: false, data: null, error: 'Invalid JSON format' }; } }
  else { parsed = input; }
  const depth = measureDepth(parsed);
  if (depth > maxDepth) return { valid: false, data: null, error: `JSON nesting exceeds max depth of ${maxDepth}` };
  if (typeof parsed === 'object' && parsed !== null) {
    const pollutionCheck = checkPrototypePollution(parsed as Record<string, unknown>);
    if (!pollutionCheck.safe) return { valid: false, data: null, error: pollutionCheck.reason };
  }
  return { valid: true, data: parsed };
}

function measureDepth(obj: unknown, currentDepth: number = 0): number {
  if (obj === null || typeof obj !== 'object') return currentDepth;
  if (Array.isArray(obj)) {
    if (obj.length === 0) return currentDepth + 1;
    return Math.max(...obj.map((item) => measureDepth(item, currentDepth + 1)));
  }
  const entries = Object.entries(obj as Record<string, unknown>);
  if (entries.length === 0) return currentDepth + 1;
  return Math.max(...entries.map(([, value]) => measureDepth(value, currentDepth + 1)));
}

function checkPrototypePollution(obj: Record<string, unknown>, visited: Set<unknown> = new Set()): { safe: boolean; reason?: string } {
  if (visited.has(obj)) return { safe: true };
  visited.add(obj);
  const dangerousKeys = ['__proto__', 'constructor', 'prototype'];
  for (const key of Object.keys(obj)) {
    if (dangerousKeys.includes(key)) return { safe: false, reason: `Dangerous key "${key}" detected` };
    const value = obj[key];
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      const nestedCheck = checkPrototypePollution(value as Record<string, unknown>, visited);
      if (!nestedCheck.safe) return nestedCheck;
    }
  }
  return { safe: true };
}

export function stripNullBytes(input: string): string {
  if (typeof input !== 'string') return '';
  return input.replace(/\0/g, '').replace(/[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}

/**
 * Utilise sanitize.ts pour un échappement base de données robuste.
 */
export function escapeForDb(input: string): string {
  return sanitizeForDb(input);
}

export function validateApiKey(key: string): { valid: boolean; error?: string } {
  if (typeof key !== 'string') return { valid: false, error: 'API key must be a string' };
  if (key.length === 0) return { valid: false, error: 'API key cannot be empty' };
  if (key.length > 512) return { valid: false, error: 'API key is too long' };
  const validPattern = /^[a-zA-Z0-9._-]+$/;
  if (!validPattern.test(key)) return { valid: false, error: 'Invalid characters in API key' };
  return { valid: true };
}

export function sanitizePrompt(input: string): string {
  if (typeof input !== 'string') return '';
  const validation = promptValidator.validatePrompt(input);
  return robustSanitizePrompt(validation.sanitizedPrompt);
}

// Re-export de sanitizePrompt avec PromptValidator intégré
function sanitizePromptInternal(input: string): string {
  if (typeof input !== 'string') return '';
  let sanitized = input;
  sanitized = stripNullBytes(sanitized);
  sanitized = sanitized.replace(/<[^>]*>/g, '');
  sanitized = sanitized.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
  sanitized = sanitized.replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, '');
  sanitized = sanitized.replace(/[\u200B-\u200D\uFEFF]/g, '');
  sanitized = sanitized.replace(/\s{3,}/g, ' ').trim();
  return sanitized;
}
