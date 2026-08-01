# Prisma Migrations — Convention

> ⚠️ **Source de vérité :** `prisma/schema.prisma` définit le SCHÉMA.
> Ce dossier contient les MIGRATIONS alimentant la base via `prisma migrate`.

## Convention correcte

Chaque migration est un **dossier** contenant un fichier `migration.sql` :

```
prisma/migrations/
├── migration_lock.toml        # REQUIS (provider = postgresql)
├── 20260720000000_init/
│   └── migration.sql
├── 20260722000000_checkpoint_supervisor/
│   └── migration.sql
└── ...
```

## Commandes

```bash
# Appliquer les migrations non encore appliquées
npx prisma migrate deploy

# Créer une nouvelle migration après modification de schema.prisma
npx prisma migrate dev --name ma_modification

# Vérifier la divergence schéma vs migrations (CI)
npx prisma migrate diff --from-schema-datasource prisma/schema.prisma \
  --to-schema prisma/schema.prisma --exit-code
```

## Ce qui est OBSOLÈTE (à supprimer)

- ❌ Fichiers `.sql` à plat (`00001_*.sql`, `00002_*.sql`, …) — **Prisma les ignore**, convention abandonnée
- ❌ `migration_lock.json` (Prisma exige `.toml`)
- ❌ `migration_meta.json` (gestionnaire maison — utiliser `_prisma_migrations`)
- ❌ `migration_manager.ts` (gestionnaire maison — utiliser `prisma migrate`)

## Packages tools

- `001_init` → migration de base (27KB)
- `002_complete_schema` → migration complète (40KB)
- `add_checkpoint_supervisor` → migration du supervisor

Ces migrations **couvertes par la convention Prisma** (dossiers `/migration.sql`) sont valides.

## CI

Le workflow `.github/workflows/prisma-check.yml` échoue si le schéma diverge des migrations (`prisma migrate diff --exit-code`).
