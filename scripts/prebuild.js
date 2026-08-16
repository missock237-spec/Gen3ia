#!/usr/bin/env node
/**
 * Pre-build cleanup — résout les corruptions de fichiers sur branches feature.
 *
 * Trois patterns de corruption gérés:
 *
 * 1. SHA-tail corruption: certaines branches ont des lignes qui se terminent
 *    par ` <7-hex> (<36-hex-with-dashes>)`, ex:
 *      `  } 2f7c5f3 (5433aca4-1e96-4e29-8166-a30aceccff4d)`
 *    Probablement issu d'un `git log` collé par erreur dans les fichiers.
 *    → On supprime le suffixe ` <7-hex> (<36-hex-with-dashes>)`.
 *
 * 2. Lignes standalone de SHA-tail (rien d'autre sur la ligne):
 *      `2f7c5f3 (5433aca4-1e96-4e29-8166-a30aceccff4d)`
 *    → On supprime la ligne entière.
 *
 * 3. Git conflict markers (<<<<<<< HEAD, =======, >>>>>>> ...):
 *    → On résout en gardant la version HEAD (avant le =======).
 *
 * Exécuté avant `next build` via npm run prebuild.
 */
const fs = require('fs');
const path = require('path');

// Match: space + 7 hex chars + space + parens with 36 hex/dashes
// e.g. " 2f7c5f3 (5433aca4-1e96-4e29-8166-a30aceccff4d)"
const SHA_TAIL_REGEX = / [a-f0-9]{7} \([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\)/g;

// Standalone SHA-tail line (only whitespace + SHA + UUID, nothing else)
const SHA_STANDALONE_REGEX = /^[ \t]*[a-f0-9]{7} \([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\)[ \t]*$/gm;

// Git conflict markers
const CONFLICT_REGEX = /^<{7}.*\n[\s\S]*?^={7}\n[\s\S]*?^>{7}/gm;

function findFiles(dir, extensions) {
  const results = [];
  const skipDirs = new Set([
    'node_modules', '.next', '.git', 'dist', 'build', 'coverage',
    '.turbo', '.vercel', 'out', '__pycache__', 'scripts'
  ]);

  function walk(currentDir) {
    let entries;
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch (e) {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        if (!skipDirs.has(entry.name)) {
          walk(fullPath);
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (extensions.includes(ext)) {
          results.push(fullPath);
        }
      }
    }
  }

  walk(dir);
  return results;
}

function cleanFile(filePath) {
  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch (e) {
    return { changed: false, shaTails: 0, standalone: 0, conflicts: 0 };
  }

  const original = content;
  let shaTails = 0;
  let standalone = 0;
  let conflicts = 0;

  // 1. Remove SHA-tail suffixes from end of lines
  content = content.replace(SHA_TAIL_REGEX, () => { shaTails++; return ''; });

  // 2. Remove standalone SHA-tail lines
  content = content.replace(SHA_STANDALONE_REGEX, () => { standalone++; return ''; });

  // 3. Resolve git conflict markers (keep HEAD version)
  if (content.includes('<<<<<<<') && content.includes('>>>>>>>')) {
    content = content.replace(CONFLICT_REGEX, (match) => {
      conflicts++;
      const lines = match.split('\n');
      const separatorIdx = lines.findIndex(l => l.startsWith('======='));
      if (separatorIdx === -1) return '';
      const headLines = lines.slice(1, separatorIdx);
      return headLines.join('\n');
    });
  }

  // 4. Remove ORPHAN conflict markers (lines that start with <<<<<<<, =======, >>>>>>>)
  //    These remain after step 3 if a block was partial/incomplete.
  content = content.replace(/^[ \t]*(<{7}|={7}|>{7})[^\n]*$/gm, (m) => {
    conflicts++;
    return '';
  });

  // Clean up multiple blank lines that may result from removing standalone lines
  content = content.replace(/\n{3,}/g, '\n\n');

  if (content === original) {
    return { changed: false, shaTails: 0, standalone: 0, conflicts: 0 };
  }

  try {
    fs.writeFileSync(filePath, content, 'utf8');
    return { changed: true, shaTails, standalone, conflicts };
  } catch (e) {
    console.error(`[prebuild] Error writing ${filePath}: ${e.message}`);
    return { changed: false, shaTails: 0, standalone: 0, conflicts: 0 };
  }
}

console.log('[prebuild] Scanning for git artifacts (SHA tails, conflict markers)...');

const extensions = ['.ts', '.tsx', '.js', '.jsx', '.css', '.mjs', '.cjs'];
const files = findFiles(process.cwd(), extensions);
console.log(`[prebuild] Scanning ${files.length} files...`);

let changedCount = 0;
let totalShaTails = 0;
let totalStandalone = 0;
let totalConflicts = 0;

for (const file of files) {
  const result = cleanFile(file);
  if (result.changed) {
    const rel = path.relative(process.cwd(), file);
    console.log(
      `[prebuild] CLEANED ${rel}: ` +
      `shaTails=${result.shaTails} standalone=${result.standalone} conflicts=${result.conflicts}`
    );
    changedCount++;
    totalShaTails += result.shaTails;
    totalStandalone += result.standalone;
    totalConflicts += result.conflicts;
  }
}

if (changedCount > 0) {
  console.log(
    `[prebuild] ✅ Cleaned ${changedCount} file(s): ` +
    `${totalShaTails} SHA tails, ${totalStandalone} standalone SHA lines, ` +
    `${totalConflicts} conflict blocks resolved.`
  );
} else {
  console.log('[prebuild] ✅ No git artifacts found.');
}
