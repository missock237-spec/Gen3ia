/**
 * Analyse statique ALLOW-LIST du code soumis à code_runner (v3.6).
 *
 * Passage d'une liste de REFUS (deny-list, contournable par omission) à une
 * liste d'AUTORISATION stricte :
 *  1. les commentaires et chaînes littérales sont retirés (pas de faux
 *     positifs sur du texte, pas de dissimulation d'identifiants) ;
 *  2. les accès de propriété dangereux (constructor, __proto__, prototype,
 *     call/apply/bind, caller/callee) sont refusés explicitement ;
 *  3. chaque identifiant LIBRE (hors propriétés) doit être soit un mot-clé
 *     JavaScript, soit une globale du bac à sable, soit une variable DÉCLARÉE
 *     par le code lui-même — tout le reste est refusé (fail-closed) ;
 *  4. la taille du code est plafonnée.
 *
 * Cette analyse s'exécute dans le processus principal AVANT tout lancement
 * de worker (échec rapide, pas de coût d'isolat). L'exécution elle-même est
 * ensuite isolée dans un Worker Thread dédié (cf. ./runner.ts).
 */

/** Taille maximale acceptée pour un programme soumis (16 Ko). */
export const MAX_CODE_BYTES = 16_384;

/** Mots-clés, mots réservés et littéraux du langage (toujours autorisés). */
const KEYWORDS = new Set([
  "abstract", "arguments", "as", "async", "await", "break", "case", "catch", "class",
  "const", "continue", "debugger", "default", "delete", "do", "else", "enum", "export",
  "extends", "false", "finally", "for", "from", "function", "get", "if", "implements",
  "import", "in", "instanceof", "interface", "let", "new", "null", "of", "package",
  "private", "protected", "public", "readonly", "return", "satisfies", "set", "static",
  "switch", "throw", "true", "try", "type", "typeof", "undefined",
  "var", "void", "while", "with", "yield", "NaN", "Infinity",
])

/**
 * `this` et `super` sont REFUSÉS : dans un script VM, `this` au niveau global
 * désigne l'objet global du contexte — unique porte vers les intrinsics non
 * fournis (Proxy, Reflect, Symbol…). Le bac à sable exige du code
 * fonctionnel pur ; les factory functions remplacent les classes à `this`.
 */
const DENIED_KEYWORDS: ReadonlyMap<string, string> = new Map([
  ["this", "« this » n'est pas disponible dans le bac à sable : écris du code fonctionnel pur (factory function au lieu de classe)."],
  ["super", "« super » n'est pas disponible dans le bac à sable (pas d'héritage de classe)."],
]);

/**
 * Globales exposées dans le bac à sable — et SEULES celles-là.
 * Aucun accès réseau, fichiers, processus, timers ou réflexion hôte.
 */
export const SANDBOX_GLOBALS: readonly string[] = [
  "Math", "JSON", "Date", "Number", "String", "Boolean", "Array", "Object",
  "Map", "Set", "RegExp", "Error", "TypeError", "RangeError", "BigInt",
  "isNaN", "parseInt", "parseFloat", "isFinite",
  "encodeURIComponent", "decodeURIComponent", "encodeURI", "decodeURI",
  "console", "undefined", "NaN", "Infinity",
];
const GLOBALS_SET = new Set(SANDBOX_GLOBALS);

/** Propriétés refusées sur TOUT objet (vecteurs d'échappement/reflexion). */
const DENIED_PROPERTIES: ReadonlySet<string> = new Set([
  "constructor", "prototype", "__proto__", "__proto", "__defineGetter__",
  "__defineSetter__", "__lookupGetter__", "__lookupSetter__",
  "call", "apply", "bind", "caller", "callee", "arguments",
]);

export interface SandboxViolation {
  identifier: string
  occurrences: number
}

export interface StaticAnalysis {
  ok: boolean
  /** Identifiants libres non autorisés (vide si ok). */
  violations: SandboxViolation[]
  /** Propriété refusée rencontrée (si ok = false pour cette raison). */
  deniedProperty?: string
  reason?: string
  bytes: number
}

/**
 * Retire commentaires et chaînes littérales ('…', "…", `…` en gérant les
 * échappements). Machine à états simple — pas de regex récursive.
 * Les contenus retirés sont remplacés par des espaces (les positions
 * des identifiants restent cohérentes pour la collecte des déclarations).
 */
export function stripCommentsAndStrings(code: string): string {
  const out: string[] = []
  let i = 0
  const n = code.length
  let mode: "code" | "line" | "block" | "single" | "double" | "template" = "code"
  while (i < n) {
    const c = code[i]
    const next = i + 1 < n ? code[i + 1] : ""
    switch (mode) {
      case "code": {
        if (c === "/" && next === "/") { mode = "line"; out.push("  "); i += 2; continue }
        if (c === "/" && next === "*") { mode = "block"; out.push("  "); i += 2; continue }
        if (c === "'") { mode = "single"; out.push(" "); i += 1; continue }
        if (c === '"') { mode = "double"; out.push(" "); i += 1; continue }
        if (c === "`") { mode = "template"; out.push(" "); i += 1; continue }
        out.push(c); i += 1; continue
      }
      case "line": {
        if (c === "\n") { mode = "code"; out.push("\n") } else { out.push(" ") }
        i += 1; continue
      }
      case "block": {
        if (c === "*" && next === "/") { mode = "code"; out.push("  "); i += 2; continue }
        if (c === "\n") out.push("\n"); else out.push(" ")
        i += 1; continue
      }
      case "single": case "double": {
        if (c === "\\") { out.push("  "); i += 2; continue }
        if ((mode === "single" && c === "'") || (mode === "double" && c === '"')) { mode = "code"; out.push(" ") }
        else if (c === "\n") { mode = "code"; out.push("\n") } // littéral non fermé → erreur de syntaxe en VM
        else out.push(" ")
        i += 1; continue
      }
      case "template": {
        if (c === "\\") { out.push("  "); i += 2; continue }
        if (c === "`") { mode = "code"; out.push(" ") }
        else if (c === "\n") out.push("\n")
        else out.push(" ")
        i += 1; continue
      }
    }
  }
  return out.join("")
}

/** Extrait les identifiants d'un fragment de code (mots, pas propriétés). */
function extractIdentifiers(text: string): string[] {
  return text.match(/[A-Za-z_$][A-Za-z0-9_$]*/g) ?? []
}

/**
 * Collecte (best-effort volontairement conservateur) les identifiants
 * DÉCLARÉS par le programme : const/let/var/class/function nommés,
 * paramètres de fonctions et flèches (y compris déstructurés),
 * variables de boucle for et paramètres catch.
 * Un identifiant libre non déclaré est refusé — écrire les déclarations
 * explicitement est le contrat de l'outil.
 */
export function collectDeclarations(stripped: string): Set<string> {
  const declared = new Set<string>()
  const addWordTokens = (fragment: string) => {
    for (const id of extractIdentifiers(fragment)) declared.add(id)
  }

  // const/let/var/function/class <name>
  for (const m of stripped.matchAll(/(?:const|let|var|function|class)\s+([A-Za-z_$][A-Za-z0-9_$]*)/g)) {
    declared.add(m[1])
  }
  // Destructuration : const { a, b } = …, const [x, y] = …
  for (const m of stripped.matchAll(/(?:const|let|var)\s*[{[]([^}\]]{0,400})[}\]]/g)) {
    addWordTokens(m[1])
  }
  // Paramètres de fonction nommée/anonyme : function f(a, b) { }
  for (const m of stripped.matchAll(/function\s*[A-Za-z_$][A-Za-z0-9_$]*\s*\(([^()]*)\)/g)) {
    addWordTokens(m[1])
  }
  // Paramètres entre parenthèses suivis d'une flèche : (a, b) => …
  for (const m of stripped.matchAll(/\(([^()]{0,300})\)\s*=>/g)) {
    addWordTokens(m[1])
  }
  // Flèche uniparamètre sans parenthèses : x => …
  for (const m of stripped.matchAll(/(?:^|[^\w$])([A-Za-z_$][A-Za-z0-9_$]*)\s*=>/g)) {
    declared.add(m[1])
  }
  // Boucles : for (const item of …) / for (let k in …)
  for (const m of stripped.matchAll(/for\s*\(\s*(?:const|let|var)?\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*(?:of|in)/g)) {
    declared.add(m[1])
  }
  // Gestion d'exception : catch (err)
  for (const m of stripped.matchAll(/catch\s*\(([^()]*)\)/g)) {
    addWordTokens(m[1])
  }
  // Clés d'objets littéraux : { a: 1, b: 2 } — ce sont des NOMS de propriétés
  // (jamais résolus contre la portée globale : les autoriser est sans risque
  // et évite les faux positifs sur les constructions JSON fréquentes).
  for (const m of stripped.matchAll(/[{,]\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*:/g)) {
    declared.add(m[1])
  }
  return declared
}

/**
 * Analyse ALLOW-LIST complète d'un programme.
 * @param code source brut soumis par l'agent
 */
export function analyzeCode(code: string): StaticAnalysis {
  const bytes = Buffer.byteLength(code, "utf8")
  if (bytes === 0) {
    return { ok: false, violations: [], reason: "Code vide.", bytes }
  }
  if (bytes > MAX_CODE_BYTES) {
    return {
      ok: false, violations: [],
      reason: `Code trop volumineux (${bytes} octets, max ${MAX_CODE_BYTES}). Découpe le traitement en étapes plus petites.`,
      bytes,
    }
  }

  const stripped = stripCommentsAndStrings(code)

  // 0. Mots-clés interdits (this/super) — porte vers les intrinsics du contexte.
  for (const [word, reason] of DENIED_KEYWORDS) {
    if (new RegExp(`\\b${word}\\b`).test(stripped)) {
      return { ok: false, violations: [], reason, bytes }
    }
  }

  // 1. Propriétés interdites (refusées même comme accès légitime).
  for (const m of stripped.matchAll(/\.([A-Za-z_$][A-Za-z0-9_$]*)/g)) {
    if (DENIED_PROPERTIES.has(m[1])) {
      return {
        ok: false, violations: [], deniedProperty: m[1],
        reason: `Accès de propriété interdit : « .${m[1]} » (vecteur d'échappement d'isolat).`,
        bytes,
      }
    }
  }

  // 2. Identifiants libres : retirer les accès de propriété avant extraction.
  const withoutProperties = stripped.replace(/\.[A-Za-z_$][A-Za-z0-9_$]*/g, " ")
  const identifiers = extractIdentifiers(withoutProperties)
  const declared = collectDeclarations(stripped)

  const counts = new Map<string, number>()
  for (const id of identifiers) {
    if (KEYWORDS.has(id) || GLOBALS_SET.has(id) || declared.has(id)) continue
    counts.set(id, (counts.get(id) ?? 0) + 1)
  }
  const violations = [...counts.entries()]
    .map(([identifier, occurrences]) => ({ identifier, occurrences }))
    .sort((a, b) => b.occurrences - a.occurrences)

  if (violations.length > 0) {
    const list = violations.slice(0, 5).map((v) => `« ${v.identifier} »`).join(", ")
    return {
      ok: false, violations,
      reason:
        `Identifiants non autorisés hors bac à sable : ${list}. ` +
        `Les globales disponibles sont : ${SANDBOX_GLOBALS.join(", ")}. ` +
        `Déclare explicitement tes variables (const/let/function) et n'utilise ni API hôte, ni réseau, ni fichiers.`,
      bytes,
    }
  }

  return { ok: true, violations: [], bytes }
}
