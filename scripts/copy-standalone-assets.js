#!/usr/bin/env node

/**
 * copy-standalone-assets.js
 *
 * Copies static assets into the Next.js standalone output directory.
 * Used by the Docker deployment (output: "standalone").
 *
 * On Vercel, this script is a no-op — Vercel handles static assets automatically.
 * Errors are logged clearly instead of silently swallowed.
 */

const fs = require("fs");
const path = require("path");

const STANDALONE_DIR = path.join(process.cwd(), ".next", "standalone");

function copyDir(src, dest) {
  if (!fs.existsSync(src)) {
    console.warn(`⚠️  Source not found: ${src}`);
    return false;
  }
  fs.cpSync(src, dest, { recursive: true });
  console.log(`✅ Copied: ${src} → ${dest}`);
  return true;
}

function main() {
  if (!fs.existsSync(STANDALONE_DIR)) {
    console.log("ℹ️  No standalone directory found — skipping (likely Vercel build).");
    return;
  }

  console.log("📦 Copying standalone assets...");

  // Copy .next/static into standalone/.next/static
  const staticSrc = path.join(process.cwd(), ".next", "static");
  const staticDest = path.join(STANDALONE_DIR, ".next", "static");
  copyDir(staticSrc, staticDest);

  // Copy public/ into standalone/public
  const publicSrc = path.join(process.cwd(), "public");
  const publicDest = path.join(STANDALONE_DIR, "public");
  copyDir(publicSrc, publicDest);

  console.log("📦 Standalone assets copy complete.");
}

main();
