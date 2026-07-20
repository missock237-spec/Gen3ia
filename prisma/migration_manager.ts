// ============================================================
// PRISMA MIGRATION MANAGER — Versionner et exécuter les migrations
// ============================================================
// Usage: bun run tsx prisma/migration_manager.ts
// ============================================================

import { execSync } from "child_process";
import fs from "fs";
import path from "path";

const MIGRATIONS_DIR = path.join(__dirname, "migrations");

interface Migration {
  id: string;
  name: string;
  sql: string;
  appliedAt: string | null;
}

function getMigrations(): Migration[] {
  const dirs = fs.readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  return dirs.map((dir) => {
    const sqlPath = path.join(MIGRATIONS_DIR, dir, "migration.sql");
    const metaPath = path.join(MIGRATIONS_DIR, dir, "migration.json");
    const sql = fs.existsSync(sqlPath) ? fs.readFileSync(sqlPath, "utf-8") : "";
    let meta: { name: string; appliedAt?: string } = { name: dir };
    if (fs.existsSync(metaPath)) {
      meta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
    }
    return { id: dir, name: meta.name, sql, appliedAt: meta.appliedAt ?? null };
  });
}

function createMigration(name: string): void {
  const id = `${Date.now()}_${name.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
  const dir = path.join(MIGRATIONS_DIR, id);
  fs.mkdirSync(dir, { recursive: true });

  const meta = { name, createdAt: new Date().toISOString(), appliedAt: null };
  fs.writeFileSync(path.join(dir, "migration.json"), JSON.stringify(meta, null, 2));
  fs.writeFileSync(path.join(dir, "migration.sql"), "");

  console.log(`✅ Migration créée : ${id}`);
  console.log(`📁 ${dir}/`);
}

function applyMigration(id: string): void {
  const migration = getMigrations().find((m) => m.id === id);
  if (!migration) {
    console.error(`❌ Migration "${id}" introuvable`);
    return;
  }

  console.log(`🔄 Application de la migration : ${migration.id} - ${migration.name}`);

  try {
    execSync(`psql "${process.env.DATABASE_URL}" -c "${migration.sql.replace(/"/g, '\\"')}"`, {
      stdio: "inherit",
      env: { ...process.env },
    });

    const metaPath = path.join(MIGRATIONS_DIR, id, "migration.json");
    const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
    meta.appliedAt = new Date().toISOString();
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));

    console.log(`✅ Migration appliquée : ${id}`);
  } catch (error) {
    console.error(`❌ Erreur lors de l'application de ${id}:`, error);
  }
}

function applyAllPending(): void {
  const migrations = getMigrations();
  const pending = migrations.filter((m) => !m.appliedAt);

  if (pending.length === 0) {
    console.log("✅ Toutes les migrations sont appliquées");
    return;
  }

  console.log(`📦 ${pending.length} migration(s) en attente`);
  for (const m of pending) {
    applyMigration(m.id);
  }
}

function status(): void {
  const migrations = getMigrations();
  console.log("\n📋 Statut des migrations :");
  console.log("───────────────────────────────────────");
  for (const m of migrations) {
    const status = m.appliedAt ? `✅ ${m.appliedAt}` : "⏳ En attente";
    console.log(`${m.id.padEnd(30)} ${status}`);
  }
}

// CLI
const command = process.argv[2];
const arg = process.argv[3];

switch (command) {
  case "create":
    if (!arg) { console.error("Usage: bun migration_manager.ts create <nom>"); process.exit(1); }
    createMigration(arg);
    break;
  case "apply":
    if (!arg) { applyAllPending(); } else { applyMigration(arg); }
    break;
  case "status":
    status();
    break;
  default:
    console.log(`
🔧 PRISMA MIGRATION MANAGER

Usage:
  bun migration_manager.ts create <nom>    Créer une nouvelle migration
  bun migration_manager.ts apply [id]      Appliquer une ou toutes les migrations
  bun migration_manager.ts status          Voir le statut des migrations
    `);
    break;
}