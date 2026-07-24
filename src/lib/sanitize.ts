// ============================================================
// SANITIZE — Nettoyage robuste des entrées utilisateur (anti-ReDoS)
// ============================================================

// Decodage HTML entites
const HTML_ENTITIES: Record<string, string> = {
  '&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&#39;':"'",
  '&#x27;':"'",'&#x2F;':'/','&#x3C;':'<','&#x3E;':'>',
  '&#x60;':'`','&#x3D;':'=','&nbsp;':' ','&excl;':'!','&num;':'#',
  '&dollar;':'$','&percnt;':'%','&ast;':'*','&plus;':'+','&comma;':',',
  '&period;':'.','&colon;':':','&semi;':';','&quest;':'?','&commat;':'@',
  '&lsqb;':'[','&rsqb;':']','&Hat;':'^','&lowbar;':'_','&lbrace;':'{',
  '&vert;':'|','&rbrace;':'}','&tilde;':'~',
};

const MAX_INPUT_LENGTH = 100000;

function truncate(input: string): string {
  if (typeof input !== 'string') return '';
  return input.slice(0, MAX_INPUT_LENGTH);
}

function decodeHtmlEntities(input: string): string {
  return truncate(input).replace(/&[a-zA-Z]+;|&#\d+;|&#x[a-fA-F0-9]+;/g, (m) => {
    if (HTML_ENTITIES[m]) return HTML_ENTITIES[m];
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

const DANGEROUS_PROTOCOLS = ['javascript:','data:','vbscript:','blob:','file:','ftp:',
  'jar:','mailto:','telnet:','ssh:','sftp:','smb:','dict:','gopher:','php:','expect:','shell:','view-source:'];

export function sanitizeUrl(url: string): string {
  if (typeof url !== 'string') return '';
  let s = decodeHtmlEntities(url.trim()).slice(0, 2000);
  const m = s.match(/^([a-zA-Z][a-zA-Z0-9+\-.]*):/);
  if (m) {
    const p = m[1].toLowerCase() + ':';
    if (DANGEROUS_PROTOCOLS.includes(p)) return '';
  }
  return s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F\x80-\x9F]/g,'');
}

export function sanitizeHtml(input: string): string {
  if (typeof input !== 'string') return '';
  let s = decodeHtmlEntities(truncate(input));
  // Anti-ReDoS: utiliser des remplacements simples sans backtracking
  // Au lieu de <script[\s\S]*?>[\s\S]*?<\/script>, on supprime par etapes
  const tagsToRemove = ['script', 'style', 'svg', 'template', 'iframe', 'object', 'embed'];
  for (const tag of tagsToRemove) {
    // Supprimer les tags ouvrants et fermants separement — pas de backtracking
    s = s.replace(new RegExp(`<${tag}[^>]*>`, 'gi'), ' ');
    s = s.replace(new RegExp(`<\/${tag}>`, 'gi'), ' ');
  }
  s = s.replace(/<[\/]*?[a-zA-Z][^>]*>/g, ' ');
  s = s.replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, ' ');
  s = s.replace(/\s+(?:formaction|action|formnovalidate|formenctype|formmethod|formtarget)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, ' ');
  s = s.replace(/expression\s*\(/gi, ' ');
  s = s.replace(/url\s*\(/gi, ' ');
  s = s.replace(/-moz-binding\s*:/gi, ' ');
  return s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F\x80-\x9F]/g,'').trim();
}

export function sanitizeForDb(input: string): string {
  if (typeof input !== 'string') return '';
  return decodeHtmlEntities(truncate(input)).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F\x80-\x9F]/g,'');
}

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

export function sanitizeModelPath(input: string): string {
  if (typeof input !== 'string') return '';
  const s = truncate(input).replace(/[^a-zA-Z0-9_\-./]/g, '');
  if (s.includes('..') || s.startsWith('/') || s.startsWith('~')) return '';
  return s;
}

export function escapeShellArg(input: string): string {
  if (typeof input !== 'string') return '';
  return truncate(input).replace(/[^a-zA-Z0-9._\-]/g, '');
}

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
