// ============================================================
// Gen3ia — Content Security Policy (CSP) Builder
// ============================================================
//  Le CSP est la première ligne de défense contre le XSS.
//  On utilise un nonce par requête pour autoriser les scripts
//  inline générés par Next.js de façon sécurisée.
// ============================================================

import { randomBytes } from 'crypto';

/**
 * Génère un nonce CSP aléatoire (base64).
 */
export function generateCspNonce(): string {
  return randomBytes(16).toString('base64');
}

/**
 * Construit l'en-tête CSP avec le nonce fourni.
 */
export function buildCspHeader(nonce: string, isProduction: boolean): string {
  const directives: string[] = [
    // Par défaut : rien n'est autorisé sauf explicitement
    "default-src 'self'",

    // Scripts : seulement avec nonce, plus unsafe-inline en dev
    isProduction
      ? `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`
      : `script-src 'self' 'nonce-${nonce}' 'unsafe-inline' 'unsafe-eval'`,

    // Styles : inline autorisé (Next.js styled-components)
    "style-src 'self' 'unsafe-inline'",

    // Images : data URIs + même origine + Firebase + Campay
    "img-src 'self' data: blob: https://*.googleusercontent.com https://*.campay.net",
    "img-src 'self' data: blob: https://*.googleusercontent.com",

    // Polices : Google Fonts + même origine
    "font-src 'self' https://fonts.gstatic.com data:",

    // Connexions API : même origine + Firebase + WebSocket dev + WhatsApp
    isProduction
      ? "connect-src 'self' https://*.firebaseio.com https://*.googleapis.com wss://*.firebaseio.com https://graph.facebook.com https://*.campay.net"
      : "connect-src 'self' https://*.firebaseio.com https://*.googleapis.com wss://*.firebaseio.com ws://localhost:* https://graph.facebook.com https://*.campay.net",

    // Frames : interdit (anti clickjacking)
    "frame-ancestors 'none'",

    // Formulaires : seulement vers le même domaine
    "form-action 'self'",

    // Base URL : seulement le même domaine
    "base-uri 'self'",

    // Objets/plugins : interdit (Flash, Java)
    "object-src 'none'",

    // Manifeste : autorisé
    "manifest-src 'self'",

    // Workers : autorisé
    "worker-src 'self'",

    // Pré-chargement : autorisé
    "prefetch-src 'self'",
  ];

  return directives.join('; ');
}

/**
 * Mode report-only pour tester le CSP sans bloquer.
 */
export function buildCspReportOnly(nonce: string, isProduction: boolean): string {
  const csp = buildCspHeader(nonce, isProduction);
  return csp;
}
