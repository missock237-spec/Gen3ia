// ============================================================
// Gen3ia — HTTP Security Headers (Edge-safe)
// ============================================================
//  En Afrique, le WiFi public est omniprésent dans les cafés
//  et universités. Les attaques MITM y sont courantes.
//  Ces en-têtes protègent les utilisateurs.
//
//  ATTENTION : Ce module doit être Edge-safe (pas de Node APIs).
// ============================================================

export interface SecurityHeaders {
  [key: string]: string;
}

/**
 * Génère tous les en-têtes de sécurité HTTP (hors CSP, géré séparément).
 */
export function getSecurityHeaders(isProduction: boolean): SecurityHeaders {
  const headers: SecurityHeaders = {
    // Force HTTPS pendant 2 ans (protection longue durée)
    'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',

    // Empêche le MIME sniffing (injection de scripts déguisés)
    'X-Content-Type-Options': 'nosniff',

    // Empêche l'intégration dans un iframe (clickjacking)
    'X-Frame-Options': 'DENY',

    // Ne révèle l'URL d'origine que vers le même domaine
    'Referrer-Policy': 'strict-origin-when-cross-origin',

    // Restreint l'accès aux API sensibles du navigateur
    // (payment=(self) pour Campay/MoMo, reste bloqué)
    'Permissions-Policy': [
      'camera=()',
      'microphone=()',
      'geolocation=()',
      'payment=(self)',
      'usb=()',
      'bluetooth=()',
      'magnetometer=()',
      'gyroscope=()',
    ].join(', '),

    // Désactive la pré-résolution DNS (évite les fuites sur WiFi public)
    'X-DNS-Prefetch-Control': 'off',

    // Isolement du contexte de navigation (Spectre mitigation)
    // NOTE : 'require-corp' bloque le chargement des scripts Firebase
    // (Google Identity Services, Firestore SDK) et les iframes OAuth.
    // On utilise 'credentialless' qui offre une protection comparable
    // tout en étant compatible avec les CDN tiers.
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'credentialless',
    'Cross-Origin-Resource-Policy': 'cross-origin',

    // Empêche Flash/PDF d'accéder au domaine
    'X-Permitted-Cross-Domain-Policies': 'none',

    // Désactive l'ouverture automatique des fichiers téléchargés (IE/Edge legacy)
    'X-Download-Options': 'noopen',
  };

  // HSTS seulement en production (HTTPS requis)
  if (!isProduction) {
    delete headers['Strict-Transport-Security'];
  }

  return headers;
}

/**
 * Applique tous les en-têtes de sécurité à une Response,
 * y compris le CSP avec nonce.
 */
export function applySecurityHeaders(
  response: Headers,
  isProduction: boolean,
  cspHeader: string,
  nonce: string
): void {
  const headers = getSecurityHeaders(isProduction);
  for (const [key, value] of Object.entries(headers)) {
    response.set(key, value);
  }
  response.set('Content-Security-Policy', cspHeader);
  response.set('x-nonce', nonce);
}
