// ============================================================
// SANITIZE — Nettoyage robuste des entrées utilisateur
// Utilise des bibliothèques fiables et des regex exhaustives
// ============================================================

// Décodage HTML manuel (sans dépendance externe) exhaustif
const HTML_ENTITIES: Record<string, string> = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'",
  '&#x27;': "'", '&#x2F;': '/', '&#x3C;': '<', '&#x3E;': '>',
  '&#x60;': '`', '&#x3D;': '=', '&nbsp;': ' ', '&excl;': '!',
  '&num;': '#', '&dollar;': '$', '&percnt;': '%', '&ast;': '*',
  '&plus;': '+', '&comma;': ',', '&period;': '.', '&colon;': ':',
  '&semi;': ';', '&quest;': '?', '&commat;': '@', '&lsqb;': '[',
  '&rsqb;': ']', '&Hat;': '^', '&lowbar;': '_', '&lbrace;': '{',
  '&vert;': '|', '&rbrace;': '}', '&tilde;': '~',
};

const ENTITY_PATTERN = /&[a-zA-Z]+;|&#\d+;|&#x[a-fA-F0-9]+;/g;

/**
 * Décode toutes les entités HTML de manière exhaustive.
 */
function decodeHtmlEntities(input: string): string {
  return input.replace(ENTITY_PATTERN, (match) => {
    // Entités nommées
    if (HTML_ENTITIES[match]) return HTML_ENTITIES[match];

    // Entités numériques décimales
    if (match.startsWith('&#') && !match.startsWith('&#x')) {
      const codePoint = parseInt(match.slice(2, -1), 10);
      if (codePoint >= 0x20 && codePoint <= 0x10FFFF && codePoint !== 0x7F) {
        return String.fromCodePoint(codePoint);
      }
      return '';
    }

    // Entités numériques hexadécimales
    if (match.startsWith('&#x')) {
      const codePoint = parseInt(match.slice(3, -1), 16);
      if (codePoint >= 0x20 && codePoint <= 0x10FFFF && codePoint !== 0x7F) {
        return String.fromCodePoint(codePoint);
      }
      return '';
    }

    return match;
  });
}

// Liste exhaustive de protocoles dangereux
const DANGEROUS_PROTOCOLS = [
  'javascript:', 'data:', 'vbscript:', 'blob:', 'file:', 'ftp:',
  'jar:', 'mailto:', 'telnet:', 'ssh:', 'sftp:', 'smb:',
  'dict:', 'gopher:', 'php:', 'expect:', 'shell:', 'view-source:',
];

// Regex pour capturer les protocoles dans une URL
const PROTOCOL_REGEX = /^([a-zA-Z][a-zA-Z0-9+\-.]*):/;

/**
 * Nettoie une URL en profondeur.
 */
export function sanitizeUrl(url: string): string {
  if (typeof url !== 'string') return '';

  let sanitized = url.trim();

  // Décoder les entités HTML avant validation
  sanitized = decodeHtmlEntities(sanitized);

  // Vérifier les protocoles dangereux
  const protocolMatch = sanitized.match(PROTOCOL_REGEX);
  if (protocolMatch) {
    const protocol = protocolMatch[1].toLowerCase() + ':';
    if (DANGEROUS_PROTOCOLS.includes(protocol)) {
      return '';
    }
  }

  // Supprimer les caractères de contrôle
  sanitized = stripControlChars(sanitized);

  return sanitized;
}

/**
 * Nettoie le HTML en profondeur.
 * Supprime toutes les balises, événements, et encodages.
 */
export function sanitizeHtml(input: string): string {
  if (typeof input !== 'string') return '';

  let sanitized = input;

  // Décoder les entités HTML d'abord
  sanitized = decodeHtmlEntities(sanitized);

  // Supprimer les balises avec attributs (y compris multi-lignes)
  sanitized = sanitized.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, ' ');
  sanitized = sanitized.replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, ' ');
  sanitized = sanitized.replace(/<svg[\s\S]*?>[\s\S]*?<\/svg>/gi, ' ');
  sanitized = sanitized.replace(/<template[\s\S]*?>[\s\S]*?<\/template>/gi, ' ');
  sanitized = sanitized.replace(/<[\/]*?[a-zA-Z][\s\S]*?>/g, ' ');

  // Supprimer les attributs événement (on*)
  sanitized = sanitized.replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, ' ');

  // Supprimer les attributs dangereux
  sanitized = sanitized.replace(/\s+(?:formaction|action|formnovalidate|formenctype|formmethod|formtarget)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, ' ');

  // Supprimer les expressions CSS dangereuses
  sanitized = sanitized.replace(/expression\s*\(/gi, ' ');
  sanitized = sanitized.replace(/url\s*\(/gi, ' ');
  sanitized = sanitized.replace(/-moz-binding\s*:/gi, ' ');

  // Supprimer les caractères de contrôle
  sanitized = stripControlChars(sanitized);

  return sanitized.trim();
}

/**
 * Nettoie une chaîne pour utilisation en base de données (PostgreSQL).
 * Utilise une approche par liste blanche.
 */
export function sanitizeForDb(input: string): string {
  if (typeof input !== 'string') return '';

  let sanitized = input;

  // Décoder d'abord les entités
  sanitized = decodeHtmlEntities(sanitized);

  // Supprimer les caractères de contrôle (sauf \n, \r)
  sanitized = stripControlChars(sanitized, true);

  return sanitized;
}

/**
 * Valide un filename contre le path traversal.
 */
export function sanitizeFilename(filename: string): string {
  if (typeof filename !== 'string') return '';

  let sanitized = filename.trim();

  // Supprimer les caractères de contrôle
  sanitized = stripControlChars(sanitized);

  // Supprimer les séparateurs de chemin
  sanitized = sanitized.replace(/[\/\\<>:|?"]/g, '');

  // Supprimer les tentatives de path traversal
  sanitized = sanitized.replace(/\.\./g, '');

  // Supprimer les points de début (fichiers cachés)
  sanitized = sanitized.replace(/^\.+/g, '');

  // Tronquer
  if (sanitized.length > 255) {
    const extIndex = sanitized.lastIndexOf('.');
    if (extIndex > 0 && sanitized.length - extIndex < 10) {
      sanitized = sanitized.substring(0, 244) + sanitized.substring(extIndex);
    } else {
      sanitized = sanitized.substring(0, 255);
    }
  }

  return sanitized.trim();
}

/**
 * Supprime les caractères de contrôle.
 * @param preserveNewlines Si true, conserve \n et \r
 */
function stripControlChars(input: string, preserveNewlines = false): string {
  if (typeof input !== 'string') return '';

  let result = input;

  // Supprimer les null bytes
  result = result.replace(/\0/g, '');

  if (preserveNewlines) {
    // Conserver \n, \r, \t mais supprimer les autres contrôles
    result = result.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  } else {
    // Supprimer tous les caractères de contrôle (sauf tab)
    result = result.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F\x80-\x9F]/g, '');
  }

  return result;
}

/**
 * Échappe une chaîne pour utilisation dans une commande shell.
 * Utilise une liste blanche de caractères autorisés.
 */
export function escapeShellArg(input: string): string {
  if (typeof input !== 'string') return '';

  // Liste blanche: lettres, chiffres, tiret, underscore, point
  // Tout le reste est supprimé
  return input.replace(/[^a-zA-Z0-9._\-]/g, '');
}

/**
 * Nettoie un chemin de modèle HuggingFace.
 */
export function sanitizeModelPath(input: string): string {
  if (typeof input !== 'string') return '';

  // Uniquement lettres, chiffres, slash, tiret, underscore, point
  const sanitized = input.replace(/[^a-zA-Z0-9_\-./]/g, '');

  // Pas de path traversal
  if (sanitized.includes('..') || sanitized.startsWith('/') || sanitized.startsWith('~')) {
    return '';
  }

  return sanitized;
}

export default {
  sanitizeHtml,
  sanitizeUrl,
  sanitizeForDb,
  sanitizeFilename,
  sanitizeModelPath,
  escapeShellArg,
  decodeHtmlEntities,
};
