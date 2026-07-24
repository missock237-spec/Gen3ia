// ============================================================
// SSRF PROTECT — Protection contre les falsifications de requêtes serveur
// ============================================================

const BLOCKED_IP_RANGES = [
  '10.',
  '172.16.', '172.17.', '172.18.', '172.19.', '172.20.', '172.21.', '172.22.', '172.23.', '172.24.', '172.25.', '172.26.', '172.27.', '172.28.', '172.29.', '172.30.', '172.31.',
  '192.168.',
  '127.',
  '0.',
  '100.',
  '::1',
  'fc00:', 'fd00:',
  '169.254.',
  '::ffff:10.', '::ffff:172.16.', '::ffff:192.168.', '::ffff:127.',
];

const BLOCKED_HOSTNAMES = [
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '[::1]',
  'metadata.google.internal',
  '169.254.169.254',
  '100.100.100.200',
  'metadata.internal',
];

const ALLOWED_HTTP_PROTOCOLS = ['http:', 'https:'];

const ALLOWED_DOMAINS_BY_CATEGORY: Record<string, string[]> = {
  huggingface: [
    'api-inference.huggingface.co',
    'huggingface.co',
    'cdn.huggingface.co',
  ],
  openai: [
    'api.openai.com',
    'oapi.openai.com',
  ],
  openrouter: [
    'openrouter.ai',
    'api.openrouter.ai',
  ],
  groq: [
    'api.groq.com',
    'wss.api.groq.com',
  ],
  resend: [
    'api.resend.com',
  ],
  stripe: [
    'api.stripe.com',
    'api.stripe.com',
  ],
  github: [
    'api.github.com',
    'github.com',
    'raw.githubusercontent.com',
    'avatars.githubusercontent.com',
  ],
  vercel: [
    'vercel.app',
    '*.vercel.app',
    'api.vercel.app',
  ],
  internal: [
    'localhost',
    '127.0.0.1',
  ],
};

export interface SSRFCheckResult {
  safe: boolean;
  error?: string;
  sanitizedUrl?: string;
  category?: string;
}

function isIPAddress(hostname: string): boolean {
  const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  const match = hostname.match(ipv4Regex);
  if (match) {
    return match.slice(1).every(octet => parseInt(octet) >= 0 && parseInt(octet) <= 255);
  }
  // IPv6
  return hostname.includes(':') && !hostname.startsWith('[');
}

function isPrivateIP(hostname: string): boolean {
  if (!isIPAddress(hostname) && !hostname.startsWith('::ffff:')) {
    // Essayer de résoudre le hostname — en environnement serveur on bloque les privés
    return BLOCKED_HOSTNAMES.includes(hostname.toLowerCase());
  }

  const normalizedHostname = hostname.startsWith('::ffff:') ? hostname.slice(7) : hostname;

  for (const range of BLOCKED_IP_RANGES) {
    if (normalizedHostname.startsWith(range)) {
      return true;
    }
  }
  return false;
}

function matchDomainAgainstList(hostname: string, allowedDomains: string[]): boolean {
  const lowerHostname = hostname.toLowerCase();

  for (const domain of allowedDomains) {
    if (domain.startsWith('*.')) {
      // Wildcard domain: *.example.com
      const suffix = domain.slice(1); // .example.com
      if (lowerHostname.endsWith(suffix) || lowerHostname === suffix.slice(1)) {
        return true;
      }
    } else if (domain === lowerHostname || lowerHostname.endsWith('.' + domain)) {
      return true;
    }
  }
  return false;
}

/**
 * Valide une URL contre les risques SSRF.
 * Vérifie que le domaine est autorisé selon la catégorie fournie.
 */
export function validateUrl(
  url: string,
  allowedCategory?: string
): SSRFCheckResult {
  if (!url || typeof url !== 'string') {
    return { safe: false, error: 'URL invalide ou vide' };
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { safe: false, error: 'URL malformée' };
  }

  // Vérifier le protocole
  if (!ALLOWED_HTTP_PROTOCOLS.includes(parsed.protocol)) {
    return { safe: false, error: `Protocole non autorisé: ${parsed.protocol}` };
  }

  const hostname = parsed.hostname;

  // Bloquer les IP privées
  if (isPrivateIP(hostname)) {
    return { safe: false, error: `Accès à une adresse interne non autorisé: ${hostname}` };
  }

  // Bloquer les hostnames dangereux connus
  if (BLOCKED_HOSTNAMES.includes(hostname.toLowerCase())) {
    // Autoriser localhost seulement pour les catégories internes
    if (allowedCategory !== 'internal') {
      return { safe: false, error: `Accès à ${hostname} non autorisé` };
    }
  }

  // Vérifier la liste blanche si une catégorie est spécifiée
  if (allowedCategory && ALLOWED_DOMAINS_BY_CATEGORY[allowedCategory]) {
    if (!matchDomainAgainstList(hostname, ALLOWED_DOMAINS_BY_CATEGORY[allowedCategory])) {
      return {
        safe: false,
        error: `Domaine ${hostname} non autorisé pour la catégorie ${allowedCategory}`,
      };
    }
    return { safe: true, sanitizedUrl: url, category: allowedCategory };
  }

  // Sans catégorie spécifique, vérifier juste qu'on n'attaque pas l'interne
  return { safe: true, sanitizedUrl: url };
}

/**
 * Effectue un fetch sécurisé avec validation SSRF.
 * Utilise validateUrl en interne avant d'exécuter la requête.
 */
export async function safeFetch(
  url: string,
  options: RequestInit = {},
  allowedCategory?: string
): Promise<Response> {
  const validation = validateUrl(url, allowedCategory);
  if (!validation.safe) {
    throw new Error(`SSRF bloqué: ${validation.error}`);
  }

  // Timeout par défaut de 10 secondes
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch(url, {
      ...options,
      signal: options.signal || controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Valide qu'un path de modèle HuggingFace est sûr.
 * Exemple: "black-forest-labs/FLUX.1-schnell"
 */
export function validateModelPath(modelPath: string): SSRFCheckResult {
  if (!modelPath || typeof modelPath !== 'string') {
    return { safe: false, error: 'Model path invalide' };
  }

  // Validation stricte: seulement lettres, chiffres, tirets, points, slashes
  const validPattern = /^[a-zA-Z0-9_\-.\/]+$/;
  if (!validPattern.test(modelPath)) {
    return { safe: false, error: 'Model path contient des caractères non autorisés' };
  }

  // Limiter la longueur
  if (modelPath.length > 200) {
    return { safe: false, error: 'Model path trop long' };
  }

  // Empêcher les tentatives de path traversal
  if (modelPath.includes('..') || modelPath.includes('~')) {
    return { safe: false, error: 'Path traversal détecté' };
  }

  return { safe: true, sanitizedUrl: modelPath };
}

export default { validateUrl, safeFetch, validateModelPath };
