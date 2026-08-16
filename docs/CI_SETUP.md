# Configuration CI/CD Genova

Pour que le CI/CD fonctionne complètement, ajoute ces secrets dans GitHub → Settings → Secrets and variables → Actions :

1. `DATABASE_URL` - URL de votre base PostgreSQL
2. `AUTH_SECRET` - Clé secrète pour l'authentification

## Workflows disponibles

- `.github/workflows/ci.yml` - Lint + CodeQL (déjà actif)
- `.github/workflows/main.yml` - Build complet (nécessite secrets DB)

## Commandes locales
```bash
bun install
bunx prisma generate
bun run build
```
