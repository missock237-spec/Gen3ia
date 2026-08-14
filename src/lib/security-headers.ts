// ============================================================
// Gen3ia — HTTP Security Headers
// ============================================================
//  En Afrique, le WiFi public est omniprésent dans les cafés
//  et universités. Les attaques MITM (man-in-the-middle) y sont
//  courantes. Ces en-têtes protègent les utilisateurs.
// ============================================================

export interface SecurityHeaders {
  [key: string]: string;
}

/**
 * Génère tous les en-têtes de sécurité HTTP.
 */
export function getSecurityHeaders(): SecurityHeaders {
  return {
    // Force HTTPS pendant 2 ans (protection longue durée)
    'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',

    // Empêche le MIME sniffing (injection de scripts déguisés)
    'X-Content-Type-Options': 'nosniff',

    // Empêche l'intégration dans un iframe (clickjacking)
    'X-Frame-Options': 'DENY',

    // Ne révèle l'URL d'origine que vers le même domaine
    'Referrer-Policy': 'strict-origin-when-cross-origin',

    // Restreint l'accès aux API sensibles du navigateur
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

    // Désactive la pré-résolution DNS (évite les fuites)
    'X-DNS-Prefetch-Control': 'off',

    // Isolement du contexte de navigation
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'require-corp',
    'Cross-Origin-Resource-Policy': 'same-origin',

    // Empêche Flash/PDF d'accéder au domaine
    'X-Permitted-Cross-Domain-Policies': 'none',

    // Désactive l'ouverture automatique des fichiers téléchargés
    'X-Download-Options': 'noopen',
  };
}

/**
 * Applique les en-têtes de sécurité à une Response.
 */
export function applySecurityHeaders(response: Headers): void {
  const headers = getSecurityHeaders();
  for (const [key, value] of Object.entries(headers)) {
    response.set(key, value);
  }
}
