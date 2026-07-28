# Contribuer à Gen3ia

Merci de votre intérêt pour Gen3ia ! 🎉

## 📋 Prérequis

- Node.js 20+
- npm 10+
- PostgreSQL 16+
- Redis 7+ (optionnel)
- Docker (optionnel)

## 🚀 Setup de développement

```bash
# Cloner le projet
git clone https://github.com/missock237-spec/Gen3ia.git
cd Gen3ia

# Installer les dépendances
npm install --legacy-peer-deps

# Configurer l'environnement
cp .env.example .env.local

# Démarrer les services
docker compose up -d postgres redis

# Migrations Prisma
npx prisma generate
npx prisma db push
npx tsx prisma/seed.ts

# Lancer le projet
npm run dev
```

## 📦 Structure du projet

```
Gen3ia/
├── apps/                  # Applications
│   └── web/              # (futur - Next.js)
├── packages/              # Packages partagés
│   └── core/             # @gen3ia/core
├── prisma/               # Schéma et migrations
├── public/               # Assets statiques
├── src/                  # Code source
│   ├── app/              # App Router Next.js
│   ├── components/       # Composants React
│   ├── hooks/            # Hooks React
│   ├── lib/              # Librairies (db, logger, security...)
│   ├── services/         # Services métier
│   ├── workers/          # Workers BullMQ
│   └── __tests__/        # Tests
└── scripts/              # Scripts utilitaires
```

## 🧪 Tests

```bash
# Tous les tests
npm run test

# Coverage (seuil: 80%)
npm run test:coverage

# Tests spécifiques
npx vitest run src/__tests__/react-loop.test.ts

# Mode watch
npm run test:watch
```

## 📝 Convention de commits

| Type | Usage | Exemple |
|------|-------|---------|
| `feat:` | Nouvelle fonctionnalité | `feat: add sudo mode` |
| `fix:` | Correction de bug | `fix: rename genova to gen3ia` |
| `docs:` | Documentation | `docs: update README` |
| `test:` | Tests | `test: add ReAct tests` |
| `refactor:` | Refactoring | `refactor: extract logger` |
| `chore:` | Maintenance | `chore: update deps` |
| `breaking:` | Changement cassant | `breaking: new API v2` |

## 🔄 Workflow PR

1. **Fork** le projet
2. Crée une branche : `feat/ma-fonctionnalite`
3. **Commit** avec les conventions ci-dessus
4. **Teste** : `npm run test`
5. **Coverage** : `npm run test:coverage` (≥ 80%)
6. **Push** ta branche
7. Ouvre une **Pull Request** vers `main`
8. Attends la review

### Bonnes pratiques

- ✅ Ajoute des tests pour chaque nouvelle fonctionnalité
- ✅ Maintiens le coverage ≥ 80%
- ✅ Suis la convention de commits
- ✅ Documente dans le README si nécessaire
- ✅ Vérifie que `npm run lint` passe
- ✅ N'oublie pas le Dockerfile pour les nouvelles dépendances

## 🐳 Docker

```bash
# Build
npm run build

# Lancer
docker compose up -d

# Avec seed
SEED_DATABASE=true docker compose up -d
```

## 📧 Contact

- **Issues** : GitHub Issues
- **Security** : security@gen3ia.ai
- **Email** : contact@gen3ia.online

---

Merci de contribuer à Gen3ia ! 🚀
