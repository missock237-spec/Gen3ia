#!/usr/bin/env node
/**
 * Pre-build — nettoyage d'artefacts git + injection de version.
 *
 * 1. Nettoie les corruptions SHA-tail et conflits git.
 * 2. Lit le fichier VERSION comme source de vérité.
 * 3. Injecte NEXT_PUBLIC_APP_VERSION, NEXT_PUBLIC_GIT_SHA, NEXT_PUBLIC_BUILD_TIME
 *    dans un .env.prebuild lu par Next.js au build.
 * 4. Synchronise package.json "version" avec VERSION.
 * 5. Met à jour le CACHE_VERSION du Service Worker pour invalider les anciens caches.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ============================================================
// PHASE 1: Nettoyage des artefacts git
// ============================================================

const SHA_TAIL_REGEX = / [a-f0-9]{7} \([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\)/g;
const SHA_STANDALONE_REGEX = /^[ \t]*[a-f0-9]{7} \([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\)[ \t]*$/gm;
const CONFLICT_REGEX = /^<{7}.*\n[\s\S]*?^={7}\n[\s\S]*?^>{7}/gm;

function findFiles(dir, extensions) {
  const results = [];
  const skipDirs = new Set([
    'node_modules', '.next', '.git', 'dist', 'build', 'coverage',
    '.turbo', '.vercel', 'out', '__pycache__', 'scripts'
  ]);
  function walk(currentDir) {
    let entries;
    try { entries = fs.readdirSync(currentDir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        if (!skipDirs.has(entry.name)) walk(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (extensions.includes(ext)) results.push(fullPath);
      }
    }
  }
  walk(dir);
  return results;
}

function cleanFile(filePath) {
  let content;
  try { content = fs.readFileSync(filePath, 'utf8'); } catch { return { changed: false }; }
  const original = content;
  let shaTails = 0, standalone = 0, conflicts = 0;
  content = content.replace(SHA_TAIL_REGEX, () => { shaTails++; return ''; });
  content = content.replace(SHA_STANDALONE_REGEX, () => { standalone++; return ''; });
  if (content.includes('<<<<<<<') && content.includes('>>>>>>>')) {
    content = content.replace(CONFLICT_REGEX, (match) => {
      conflicts++;
      const lines = match.split('\n');
      const sepIdx = lines.findIndex(l => l.startsWith('======='));
      if (sepIdx === -1) return '';
      return lines.slice(1, sepIdx).join('\n');
    });
  }
  content = content.replace(/^[ \t]*(<{7}|={7}|>{7})[^\n]*$/gm, () => { conflicts++; return ''; });
  content = content.replace(/\n{3,}/g, '\n\n');
  if (content === original) return { changed: false };
  try {
    fs.writeFileSync(filePath, content, 'utf8');
    return { changed: true, shaTails, standalone, conflicts };
  } catch { return { changed: false }; }
}

console.log('[prebuild] Phase 1: Cleaning git artifacts...');
const extensions = ['.ts', '.tsx', '.js', '.jsx', '.css', '.mjs', '.cjs'];
const files = findFiles(process.cwd(), extensions);
console.log(`[prebuild] Scanning ${files.length} files...`);
let cleaned = 0;
for (const file of files) {
  const result = cleanFile(file);
  if (result.changed) {
    const rel = path.relative(process.cwd(), file);
    console.log(`[prebuild] CLEANED ${rel}: shaTails=${result.shaTails || 0} standalone=${result.standalone || 0} conflicts=${result.conflicts || 0}`);
    cleaned++;
  }
}
console.log(cleaned > 0 ? `[prebuild] Cleaned ${cleaned} file(s).` : '[prebuild] No git artifacts found.');

// ============================================================
// PHASE 2: Injection de version (source de vérité = fichier VERSION)
// ============================================================

console.log('[prebuild] Phase 2: Version injection...');

const VERSION_FILE = path.join(process.cwd(), 'VERSION');
const ENV_FILE = path.join(process.cwd(), '.env.prebuild');
const PKG_FILE = path.join(process.cwd(), 'package.json');
const SW_FILE = path.join(process.cwd(), 'public', 'sw.js');

let appVersion = '0.0.0-unknown';
try {
  appVersion = fs.readFileSync(VERSION_FILE, 'utf8').trim();
  if (!/^\d+\.\d+\.\d+/.test(appVersion)) {
    console.warn(`[prebuild] VERSION format invalide: "${appVersion}"`);
    appVersion = '0.0.0-invalid';
  }
} catch (err) {
  console.warn(`[prebuild] VERSION non trouvé: ${err.message}`);
}

let gitSha = 'unknown';
try {
  gitSha = execSync('git rev-parse --short HEAD', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
} catch { gitSha = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || 'unknown'; }

let gitBranch = 'unknown';
try {
  gitBranch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
} catch { gitBranch = process.env.VERCEL_GIT_COMMIT_REF || 'unknown'; }

const buildTime = new Date().toISOString();
const buildEnv = process.env.NODE_ENV || 'development';
const buildId = `${appVersion}-${gitSha}`;

const envContent = [
  `# Auto-generated by scripts/prebuild.js — DO NOT EDIT MANUALLY`,
  `NEXT_PUBLIC_APP_VERSION=${appVersion}`,
  `NEXT_PUBLIC_GIT_SHA=${gitSha}`,
  `NEXT_PUBLIC_GIT_BRANCH=${gitBranch}`,
  `NEXT_PUBLIC_BUILD_TIME=${buildTime}`,
  `NEXT_PUBLIC_BUILD_ID=${buildId}`,
  `NEXT_PUBLIC_BUILD_ENV=${buildEnv}`,
].join('\n') + '\n';

fs.writeFileSync(ENV_FILE, envContent, 'utf8');
console.log(`[prebuild] Version: ${appVersion} | SHA: ${gitSha} | Branch: ${gitBranch} | Env: ${buildEnv}`);

// Synchroniser package.json
try {
  const pkg = JSON.parse(fs.readFileSync(PKG_FILE, 'utf8'));
  if (pkg.version !== appVersion) {
    pkg.version = appVersion;
    fs.writeFileSync(PKG_FILE, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
    console.log(`[prebuild] Synced package.json -> ${appVersion}`);
  }
} catch (err) {
  console.warn(`[prebuild] package.json sync skipped: ${err.message}`);
}

// Mettre à jour le CACHE_VERSION du Service Worker pour forcer l'invalidation
try {
  let swContent = fs.readFileSync(SW_FILE, 'utf8');
  const cacheVersion = `gen3ia-v${appVersion}-${gitSha}`;
  if (!swContent.includes(cacheVersion)) {
    swContent = swContent.replace(
      /const CACHE_VERSION = ['"][^'"]+['"];/,
      `const CACHE_VERSION = '${cacheVersion}';`
    );
    fs.writeFileSync(SW_FILE, swContent, 'utf8');
    console.log(`[prebuild] SW cache version: ${cacheVersion}`);
  }
} catch (err) {
  console.warn(`[prebuild] SW update skipped: ${err.message}`);
}

console.log(`[prebuild] Done. Build ID: ${buildId}`);
