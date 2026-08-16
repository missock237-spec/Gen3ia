let native;
// eslint-disable-next-line @typescript-eslint/no-require-imports
try { native = require('./agent-safety.node'); } catch { native = null; }

function fallback(input, patterns) {
  let max = 0;
  for (const [p, w] of patterns) if (p.test(input)) max = Math.max(max, w);
  return { safe: max < 0.7, score: max, reason: max >= 0.7 ? 'Detecte' : 'Ok', categories: ['fallback'] };
}

const JS_PATTERNS = [
  [/(ignore|oublie).*(instructions|prompt)/i, 0.8],
  [/(DAN|jailbreak|no filter)/i, 0.9],
  [/(API_KEY|SECRET|TOKEN)/i, 0.6],
];

export function checkPromptInjection(input) {
  return native ? native.checkPromptInjection(input) : fallback(input, JS_PATTERNS);
}
export function checkJailbreak(input) {
  return native ? native.checkJailbreak(input) : fallback(input, [[/(DAN|jailbreak)/i, 0.95]]);
}
export function checkResourceLimits(prompt, maxTokens) {
  if (native) return native.checkResourceLimits(prompt, maxTokens);
  const t = Math.ceil(prompt.length / 4);
  return { memoryMb: Math.min(t * 0.004 + 1, 128), cpuCores: 1, tokens: Math.min(t, maxTokens) };
}
export function validateSandboxAccess(path, allowed) {
  if (native) return native.validateSandboxAccess(path, allowed);
  const ok = allowed.some(d => path.startsWith(d));
  return { safe: ok, score: ok ? 0 : 1, reason: ok ? 'Ok' : 'Refuse: ' + path, categories: ['sandbox'] };
}
