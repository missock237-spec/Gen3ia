# 🔍 CI — Vérification des migrations Prisma

Le job suivant doit être ajouté en haut de `.github/workflows/ci.yml`
(⚠️ le plugin GitHub du chat ne peut pas écrire directement dans `.github/`,
la modification du workflow se fait **manuellement en local**).

## ⚠️ Prérequis — régénérer le lockfile

`npm ci` échoue tant que `package-lock.json` est vide (`packages: {}`).
**Avant toute exécution CI** :

```bash
npm install --no-audit --no-fund   # régénère package-lock.json
npx prisma generate
git add package-lock.json && git commit -m "chore: lock" && git push
```

Tant que le lock n'est pas commité, utilisez `npm install` dans le workflow
à la place de `npm ci` (voir `docs/fix-npm-install.md`).

Collez ce bloc dans `jobs:` du fichier `.github/workflows/ci.yml` :

```yaml
  prisma-diff:
    name: Vérifier schéma vs migrations (BLOCKING)
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16-alpine
        env: { POSTGRES_USER: gen3ia, POSTGRES_PASSWORD: gen3ia, POSTGRES_DB: gen3ia_shadow }
        ports: ["5433:5432"]
        options: --health-cmd pg_isready --health-interval 10s --health-timeout 5s --health-retries 5
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm install --no-audit --no-fund   # régénère le lock/installe
      - run: npx prisma generate
        env: { DATABASE_URL: postgresql://gen3ia:gen3ia@localhost:5432/gen3ia_test }
      - name: Prisma migrate diff (échoue si schéma ≠ migrations)
        run: |
          npx prisma migrate diff \
            --from-schema-datasource prisma/schema.prisma \
            --to-migrations prisma/migrations \
            --shadow-database-url postgresql://gen3ia:gen3ia@localhost:5433/gen3ia_shadow \
            --exit-code || {
              echo "❌ Schéma Prisma et migrations DÉSALIGNÉS."
              echo "   Exécutez : npx prisma migrate dev --name ma_modification"
              exit 1
            }
  check-migration-structure:
    name: Valider structure migrations (BLOCKING)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: |
          [ -f prisma/migrations/migration_lock.toml ] || { echo "❌ migration_lock.toml manquant"; exit 1; }
          for d in prisma/migrations/*/; do
            [ -f "$$d/migration.sql" ] || { echo "❌ $$d sans migration.sql"; exit 1; }
          done
          echo "✅ Structure migrations valide"
```

## Pourquoi

- **`--exit-code`** : Prisma retourne un code non-zéro dès que `schema.prisma` et les migrations divergent.
- **`migration_lock.toml`** : Prisma exige `.toml` (passé `.json` était inopérant).
- **Structure** : chaque migration = dossier + `migration.sql` (les `.sql` à plat sont ignorés).
