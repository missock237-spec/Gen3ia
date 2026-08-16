#!/usr/bin/env node
/**
 * Pre-build cleanup — résout les marqueurs de conflit git non résolus.
 *
 * Certaines branches feature ont des fichiers avec des marqueurs de conflit
 * git (<<<<<<< HEAD, =======, >>>>>>> ...) qui n'ont jamais été résolus.
 * Ces fichiers font échouer le build Vercel.
 *
 * Ce script:
 * 1. Recherche tous les fichiers .ts/.tsx/.js/.jsx/.css avec marqueurs de conflit
 * 2. Pour chaque fichier, garde la version HEAD (avant le =======)
 * 3. Log chaque fichier modifié
 *
 * Exécuté avant `next build` via npm run prebuild.
 */
const fs = require('fs');
const path = require('path');

const CONFLICT_REGEX = /^<{7}.*\n[\s\S]*?^={7}\n[\s\S]*?^>{7}/gm;

function findFiles(dir, extensions) {
  const results = [];
  const skipDirs = new Set([
    'node_modules', '.next', '.git', 'dist', 'build', 'coverage',
    '.turbo', '.vercel', 'out', '__pycache__'
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

function resolveConflicts(filePath) {
  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch (e) {
    return false;
  }
  
  if (!content.includes('<<<<<<<') || !content.includes('>>>>>>>')) {
    return false;
  }
  
  // Check if it's a real conflict marker pattern
  const matches = content.match(CONFLICT_REGEX);
  if (!matches) {
    return false;
  }
  
  // Resolve by keeping HEAD version (before =======)
  let newContent = content.replace(CONFLICT_REGEX, (match) => {
    const lines = match.split('\n');
    // Find ======= separator
    const separatorIdx = lines.findIndex(l => l.startsWith('======='));
    if (separatorIdx === -1) return '';
    // Keep lines between <<<<<<< HEAD and =======
    const headLines = lines.slice(1, separatorIdx);
    return headLines.join('\n');
  });
  
  try {
    fs.writeFileSync(filePath, newContent, 'utf8');
    return true;
  } catch (e) {
    console.error(`Error writing ${filePath}: ${e.message}`);
    return false;
  }
}

console.log('[prebuild] Scanning for unresolved git conflict markers...');

const extensions = ['.ts', '.tsx', '.js', '.jsx', '.css', '.mjs', '.cjs'];
const files = findFiles(process.cwd(), extensions);
console.log(`[prebuild] Scanning ${files.length} files...`);

let resolved = 0;
for (const file of files) {
  if (resolveConflicts(file)) {
    console.log(`[prebuild] RESOLVED conflicts in: ${path.relative(process.cwd(), file)}`);
    resolved++;
  }
}

if (resolved > 0) {
  console.log(`[prebuild] ✅ Resolved conflicts in ${resolved} file(s).`);
} else {
  console.log('[prebuild] ✅ No conflict markers found.');
}
