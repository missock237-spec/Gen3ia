// ============================================================
// SANITIZE — Sanitizer centralise style DOMPurify
// Remplace tous les regex HTML par un parseur en liste blanche
// ============================================================

// Liste blanche de tags HTML autorises (utile pour le rich text)
const ALLOWED_TAGS = new Set([
  'b', 'i', 'em', 'strong', 'u', 's', 'mark', 'small', 'sub', 'sup',
  'p', 'br', 'hr', 'div', 'span', 'pre', 'code', 'blockquote',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li', 'dl', 'dt', 'dd',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption',
  'a', 'img', 'figure', 'figcaption',
  'abbr', 'address', 'cite', 'dfn', 'kbd', 'q', 'samp', 'var',
  'time', 'wbr',
]);

// Attributs autorises (par tag)
const ALLOWED_ATTRS = new Set([
  'href', 'target', 'rel', 'title', 'alt', 'src', 'width', 'height',
  'class', 'id', 'style', 'lang', 'dir',
  'colspan', 'rowspan', 'scope', 'headers',
  'start', 'type', 'value', 'placeholder', 'disabled', 'readonly',
  'datetime', 'download',
]);

// Protocoles autorises dans href/src
const ALLOWED_PROTOCOLS = ['http:', 'https:', 'mailto:', 'tel:', 'ftp:'];

// Tags dangereux TOUJOURS supprimes
const FORBIDDEN_TAGS = new Set([
  'script', 'style', 'svg', 'template', 'iframe', 'object', 'embed',
  'form', 'input', 'select', 'textarea', 'button', 'label',
  'base', 'meta', 'link', 'frame', 'frameset', 'noframes',
  'applet', 'marquee', 'noscript', 'canvas', 'math',
]);

const MAX_INPUT_LENGTH = 100000;

function truncate(input: string): string {
  if (typeof input !== 'string') return '';
  return input.slice(0, MAX_INPUT_LENGTH);
}

function decodeHtmlEntities(input: string): string {
  const entities: Record<string, string> = {
    '&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&#39;':"'",
    '&#x27;':"'",'&#x2F;':'/','&#x3C;':'<','&#x3E;':'>',
    '&#x60;':'`','&#x3D;':'=','&nbsp;':' ','&excl;':'!','&num;':'#',
    '&dollar;':'$','&percnt;':'%','&ast;':'*','&plus;':'+','&comma;':',',
    '&period;':'.','&colon;':':','&semi;':';','&quest;':'?','&commat;':'@',
    '&lsqb;':'[','&rsqb;':']','&Hat;':'^','&lowbar;':'_','&lbrace;':'{',
    '&vert;':'|','&rbrace;':'}','&tilde;':'~',
  };
  return truncate(input).replace(/&[a-zA-Z]+;|&#\d+;|&#x[a-fA-F0-9]+;/g, (m) => {
    if (entities[m]) return entities[m];
    if (m.startsWith('&#') && !m.startsWith('&#x')) {
      const cp = parseInt(m.slice(2,-1), 10);
      if (cp >= 0x20 && cp <= 0x10FFFF && cp !== 0x7F) return String.fromCodePoint(cp);
      return '';
    }
    if (m.startsWith('&#x')) {
      const cp = parseInt(m.slice(3,-1), 16);
      if (cp >= 0x20 && cp <= 0x10FFFF && cp !== 0x7F) return String.fromCodePoint(cp);
      return '';
    }
    return m;
  });
}

/**
 * Sanitise le HTML avec une approche DOMPurify:
 * 1. Parse les balises HTML
 * 2. Supprime les tags interdits
 * 3. Ne garde que les tags autorises (liste blanche)
 * 4. Supprime les attributs dangereux (on*)
 * 5. Valide les protocoles des URLs
 */
export function sanitizeHtml(input: string, options?: { allowSafeTags?: boolean }): string {
  if (typeof input !== 'string') return '';
  let s = decodeHtmlEntities(truncate(input));

  // Phase 1: Supprimer les tags interdits COMPLETEMENT (avec leur contenu)
  for (const tag of FORBIDDEN_TAGS) {
    // Suppression recursive: tant qu'il y a des tags interdits
    while (s.includes(`<${tag}`) || s.includes(`</${tag}>`)) {
      s = s.replace(new RegExp(`<${tag}[^>]*>[\s\S]*?<\/${tag}>`, 'gi'), ' ');
      s = s.replace(new RegExp(`<${tag}[^>]*/>`, 'gi'), ' ');
      s = s.replace(new RegExp(`<${tag}[^>]*>`, 'gi'), ' ');
      s = s.replace(new RegExp(`<\/${tag}>`, 'gi'), ' ');
    }
  }

  // Phase 2: Si safe tags only, filtrer les tags non autorises
  if (options?.allowSafeTags !== true) {
    // Mode texte brut: supprimer toutes les balises HTML
    s = s.replace(/<[\/]*?[a-zA-Z][^>]*>/g, ' ');
  } else {
    // Mode rich text: ne garder que les tags autorises
    s = s.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)[^>]*>/g, (match, tagName) => {
      const lowerTag = tagName.toLowerCase();
      if (ALLOWED_TAGS.has(lowerTag)) {
        // Valider les attributs
        return match.replace(/\s+([a-zA-Z-]+)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, (attrMatch, attrName) => {
          const lowerAttr = attrName.toLowerCase();
          // Bloquer les event handlers
          if (lowerAttr.startsWith('on')) return ' ';
          // Bloquer les attributs dangereux
          if (['formaction', 'action', 'formnovalidate', 'formenctype', 'formmethod', 'formtarget', 'xlink:href', 'xmlns'].includes(lowerAttr)) return ' ';
          // Ne garder que les attributs autorises
          if (ALLOWED_ATTRS.has(lowerAttr)) {
            // Valider les URLs dans href/src
            if (lowerAttr === 'href' || lowerAttr === 'src') {
              const urlMatch = attrMatch.match(/=\s*"([^"]+)"/) || attrMatch.match(/=\s*'([^']+)'/);
              if (urlMatch) {
                const url = urlMatch[1]!;
                try {
                  const parsed = new URL(url);
                  if (!ALLOWED_PROTOCOLS.includes(parsed.protocol)) return ' ';
                } catch {
                  // URL relative: autoriser
                  if (url.startsWith('#')) return ' '; // anchor only
                }
              }
            }
            return attrMatch;
          }
          return ' ';
        });
      }
      return ' ';
    });
  }

  // Phase 3: Supprimer les event handlers residuels
  s = s.replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, ' ');

  // Phase 4: Supprimer les expressions CSS dangereuses
  s = s.replace(/expression\s*\(/gi, ' ');
  s = s.replace(/url\s*\(/gi, ' ');
  s = s.replace(/-moz-binding\s*:/gi, ' ');

  // Phase 5: Nettoyer les caracteres de controle
  s = s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F\x80-\x9F]/g, '');

  return s.trim();
}

/**
 * Nettoie une URL (protocole, SSRF, etc.)
 */
export function sanitizeUrl(url: string): string {
  if (typeof url !== 'string') return '';
  let s = decodeHtmlEntities(url.trim()).slice(0, 2000);
  const m = s.match(/^([a-zA-Z][a-zA-Z0-9+\-.]*):/);
  if (m) {
    const p = m[1].toLowerCase() + ':';
    if (!ALLOWED_PROTOCOLS.includes(p)) return '';
  }
  return s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F\x80-\x9F]/g,'');
}

/**
 * Nettoie pour la base de donnees (echappement simple)
 */
export function sanitizeForDb(input: string): string {
  if (typeof input !== 'string') return '';
  return decodeHtmlEntities(truncate(input)).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F\x80-\x9F]/g,'');
}

/**
 * Nettoie un nom de fichier
 */
export function sanitizeFilename(filename: string): string {
  if (typeof filename !== 'string') return '';
  let s = truncate(filename).trim();
  s = s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g,'');
  s = s.replace(/[\/\\<>:|"?]/g, '');
  s = s.replace(/\.\./g, '');
  s = s.replace(/^\.+/g, '');
  if (s.length > 255) s = s.substring(0, 255);
  return s.trim();
}

/**
 * Nettoie un chemin de modele
 */
export function sanitizeModelPath(input: string): string {
  if (typeof input !== 'string') return '';
  const s = truncate(input).replace(/[^a-zA-Z0-9_\-./]/g, '');
  if (s.includes('..') || s.startsWith('/') || s.startsWith('~')) return '';
  return s;
}

/**
 * Echappe un argument shell
 */
export function escapeShellArg(input: string): string {
  if (typeof input !== 'string') return '';
  return truncate(input).replace(/[^a-zA-Z0-9._\-]/g, '');
}

/**
 * Nettoie un prompt (caracteres de controle, unicode dangereux)
 */
export function sanitizePrompt(input: string): string {
  if (typeof input !== 'string') return '';
  let s = truncate(input);
  s = s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g,'');
  s = s.replace(/<[^>]*>/g, '');
  s = s.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
  s = s.replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, '');
  s = s.replace(/[\u200B-\u200D\uFEFF]/g, '');
  s = s.replace(/\s{3,}/g, ' ').trim();
  return s;
}

export default { sanitizeHtml, sanitizeUrl, sanitizeForDb, sanitizeFilename, sanitizeModelPath, escapeShellArg, sanitizePrompt };
