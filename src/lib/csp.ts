// ============================================================
// Gen3ia — Content Security Policy (CSP) Builder (Edge-safe)
// ============================================================
//  Le CSP est la première ligne de défense contre le XSS.
//  On utilise un nonce par requête pour autoriser les scripts
//  inline générés par Next.js de façon sécurisée.
//
//  ATTENTION : Ce module doit être Edge-safe (pas de Node crypto,
//  pas de fs, pas de Buffer). Utilise Web Crypto API uniquement.
// ============================================================

const IS_PROD = process.env.NODE_ENV === 'production';

/**
 * Génère un nonce CSP aléatoire (base64url, sans padding).
 * Edge-safe : utilise Web Crypto API (crypto.getRandomValues + btoa).
 */
export function generateCspNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/=+$/, '');
}

/**
 * Construit l'en-tête CSP complet avec le nonce fourni.
 * En production : 'unsafe-inline'/'unsafe-eval' ABSENTS de script-src.
 * En dev : autorisés pour HMR (Hot Module Replacement).
 */
export function buildCspHeader(nonce: string): string {
  const scriptSrc = IS_PROD
    ? `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://www.googletagmanager.com https://www.google-analytics.com https://*.jsdelivr.net`
    : `script-src 'self' 'nonce-${nonce}' 'unsafe-inline' 'unsafe-eval' https://www.googletagmanager.com https://www.google-analytics.com https://*.jsdelivr.net`;

  return [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: blob: https://*.githubusercontent.com https://*.googleusercontent.com https://cdn.huggingface.co https://www.google-analytics.com https://www.googletagmanager.com https://storage.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    // API : OpenAI, Anthropic, Groq, OpenRouter, HuggingFace, Firebase, Sentry, Campay, WhatsApp
    "connect-src 'self' https://api.openai.com https://api.anthropic.com https://api.groq.com https://openrouter.ai https://api-inference.huggingface.co https://*.sentry.io https://www.google-analytics.com https://firestore.googleapis.com https://identitytoolkit.googleapis.com https://fcm.googleapis.com https://*.campay.net https://graph.facebook.com wss://*.firebaseio.com",
    "frame-ancestors 'none'",
    "object-src 'none'",
    // frame-src : Firebase Auth utilise des iframes pour les popups OAuth
    // et la vérification d'email. On autorise les domaines Firebase et Google.
    "frame-src 'self' https://*.firebaseapp.com https://*.google.com https://accounts.google.com",
    // form-action : OAuth redirects vers Google/GitHub
    "form-action 'self' https://accounts.google.com https://github.com",
    // worker-src : Firebase SDK peut utiliser des Web Workers
    "worker-src 'self' blob:",
    "base-uri 'self'",
    "manifest-src 'self'",
    "upgrade-insecure-requests",
  ].join('; ');
}
