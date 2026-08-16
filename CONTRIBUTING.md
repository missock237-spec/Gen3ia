# Contribuer à Gen3ia

Bienvenue ! 🎉 Merci de votre intérêt pour Gen3ia — l'OS pour agents IA autonomes.

Ce guide vous accompagne pas à pas : de l'installation de l'environnement de développement jusqu'à la soumission d'une Pull Request avec des exemples concrets.

---

## Table des matières

1. [Prérequis techniques](#1-prérequis-techniques)
2. [Installation pas à pas](#2-installation-pas-à-pas)
3. [Configuration IDE (VS Code)](#3-configuration-ide-vs-code)
4. [Structure du projet](#4-structure-du-projet)
5. [Écrire du code](#5-écrire-du-code)
6. [Exécuter les tests](#6-exécuter-les-tests)
7. [Conventions de code](#7-conventions-de-code)
8. [Soumettre une Pull Request](#8-soumettre-une-pull-request)
9. [Aller plus loin](#9-aller-plus-loin)

---

## 1. Prérequis techniques

Avant de commencer, assurez-vous d'avoir installé :

| Outil | Version minimale | Commande pour vérifier |
|-------|------------------|------------------------|
| **Node.js** | 20.x | `node --version` |
| **npm** | 10.x | `npm --version` |
| **PostgreSQL** | 16 | `psql --version` |
| **Redis** | 7 (optionnel) | `redis-cli --version` |
| **Docker** | 24+ (optionnel) | `docker --version` |
| **Git** | 2.40+ | `git --version` |

> **💡 Astuce** : Si vous n'avez pas PostgreSQL/Redis en local, vous pouvez les lancer via Docker : `docker compose up -d postgres redis`

---

## 2. Installation pas à pas

### Étape 1 : Cloner le projet

```bash
git clone https://github.com/missock237-spec/Gen3ia.git
cd Gen3ia
```

### Étape 2 : Installer les dépendances

```bash
# Installation complète
npm install --legacy-peer-deps

# Vérifier que tout est bien installé
npm ls --depth=0 2>/dev/null | head -20
```

### Étape 3 : Configurer l'environnement

```bash
# Copier le fichier d'exemple
cp .env.example .env.local

# Éditer les variables essentielles
# AUTH_SECRET : clé secrète pour les JWT (32+ caractères)
# DATABASE_URL : connexion à PostgreSQL
nano .env.local
```

Minimal requis dans `.env.local` :
```env
NODE_ENV=development
NEXT_PUBLIC_APP_URL=http://localhost:3000
DATABASE_URL=postgresql://gen3ia:password@localhost:5432/gen3ia
AUTH_SECRET=ma- cle-secrete-de-32-caracteres-minimum
REDIS_URL=redis://localhost:6379
```

### Étape 4 : Lancer les services

```bash
# Avec Docker (recommandé)
docker compose up -d postgres redis

# Ou sans Docker : lancez PostgreSQL et Redis manuellement
# PostgreSQL : brew services start postgresql@16
# Redis : brew services start redis
```

### Étape 5 : Initialiser la base de données

```bash
# Générer le client Prisma
npx prisma generate

# Pousser le schéma (créer les tables)
npx prisma db push

# Optionnel : Seed (données de démo)
npx tsx prisma/seed.ts

# Vérifier les tables
psql -d gen3ia -c '\dt'
```

### Étape 6 : Lancer le serveur de développement

```bash
npm run dev
```

Ouvrez http://localhost:3000 — vous devriez voir l'interface Gen3ia.

### 🎉 Félicitations ! Votre environnement est prêt.

---

## 3. Configuration IDE (VS Code)

Extensions recommandées :

| Extension | Utilité |
|-----------|---------|
| [ESLint](vscode:extension/dbaeumer.vscode-eslint) | Linting TypeScript |
| [Prettier](vscode:extension/esbenp.prettier-vscode) | Formatage automatique |
| [Prisma](vscode:extension/prisma.prisma) | Support Prisma ORM |
| [Tailwind CSS](vscode:extension/bradlc.vscode-tailwindcss) | Autocomplétion Tailwind |
| [Jest Runner](vscode:extension/firsttris.vscode-jest-runner) | Lancer les tests |
| [Thunder Client](vscode:extension/rangav.vscode-thunder-client) | Tester les API |

Fichier `.vscode/settings.json` recommandé :
```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": "explicit"
  },
  "typescript.preferences.importModuleSpecifier": "non-relative",
  "files.exclude": {
    "**/.next": true,
    "**/node_modules": true,
    "**/coverage": true
  }
}
```

---

## 4. Structure du projet

```
Gen3ia/
├── apps/web/             # Application Next.js
│   └── src/
│       ├── app/          # App Router (routes API, pages)
│       ├── components/   # Composants React (shadcn/ui)
│       ├── hooks/        # Hooks React personnalisés
│       └── __tests__/    # Tests unitaires et d'intégration
├── packages/core/        # Librairie partagée @gen3ia/core
│   └── src/
│       ├── repositories/ # Pattern Repository (CRUD)
│       ├── errors.ts     # Classes d'erreur standardisées
│       └── logger.ts     # Logger structuré
├── prisma/               # Schéma Prisma et migrations
├── monitoring/           # Config Prometheus, Grafana, Loki
│   ├── grafana/          # Dashboards pré-configurés
│   ├── loki/             # Configuration Loki
│   └── traefik/          # Configuration Traefik
├── k6-load-tests/        # Tests de charge k6
└── docs/                 # Documentation
    └── archive/          # Notes archivées
```

### Où mettre votre code ?

| Type de code | Où le placer |
|-------------|-------------|
| **Route API** | `apps/web/src/app/api/<nom>/route.ts` |
| **Nouveau composant** | `apps/web/src/components/<nom>.tsx` |
| **Logique métier** | `apps/web/src/lib/<service>.ts` |
| **Fonction utilitaire** | `packages/core/src/<util>.ts` |
| **Test unitaire** | `apps/web/src/__tests__/<nom>.test.ts` |

---

## 5. Écrire du code

### Ajouter une route API

Créez un fichier `apps/web/src/app/api/hello/route.ts` :

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';

const log = createLogger('api-hello');

export async function GET(request: NextRequest) {
  log.info('hello_endpoint_called', { path: request.url });

  return NextResponse.json({
    message: 'Bonjour depuis Gen3ia !',
    timestamp: new Date().toISOString(),
  });
}
```

### Ajouter un test

Créez `apps/web/src/__tests__/hello.test.ts` :

```typescript
import { describe, it, expect } from 'vitest';

describe('API Hello', () => {
  it('retourne un message de bienvenue', async () => {
    const { GET } = await import('@/app/api/hello/route');

    const res = await GET(new Request('http://localhost:3000/api/hello') as any);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.message).toContain('Gen3ia');
  });
});
```

### Ajouter un schéma de validation Zod

Dans `apps/web/src/lib/validation.ts` :

```typescript
import { z } from 'zod';

export const helloInputSchema = z.object({
  name: z.string().min(1, 'Nom requis').max(50),
  age: z.number().int().min(0).max(150).optional(),
});

export type HelloInput = z.infer<typeof helloInputSchema>;
```

> **📖 Rappel** : Quand vous ajoutez/modifiez un schéma Zod, la documentation Swagger se met à jour automatiquement via `GET /api/docs/openapi`.

---

## 6. Exécuter les tests

### Commandes essentielles

```bash
# Tous les tests
npm run test

# Tests avec coverage (seuil minimum: 80% statements, 75% branches)
npm run test:coverage

# Tests de sécurité (OWASP Top 10)
npm run test:security

# Tests spécifiques
npx vitest run src/__tests__/credit-scenarios.test.ts

# Mode watch (les tests se relancent automatiquement)
npm run test:watch

# Tests de charge (nécessite k6 installé)
k6 run k6-load-tests/smoke-test.js
```

### Exemple : lancer un test spécifique

```bash
# Un seul fichier
npx vitest run src/__tests__/auth.test.ts

# Pattern de nom
npx vitest run src/__tests__/security --reporter verbose

# Avec filtrage
npx vitest run --testNamePattern="login"
```

### Structure des tests

```
src/__tests__/
├── auth.test.ts                # Tests d'authentification
├── credit-scenarios.test.ts    # Tests de crédits
├── security/
│   ├── owasp-top10.test.ts    # Tests OWASP Top 10
│   ├── brute-force.test.ts    # Protection brute force
│   └── jwt-service.test.ts    # Service JWT
├── webhook-security.test.ts   # Sécurité des webhooks
├── vector-store-adapter.test.ts # Vector DB (SQLite/Qdrant)
└── unit/                      # Tests unitaires
```

---

## 7. Conventions de code

### Conventions de commits

Utilisez le format `type(scope): description` :

```
feat(agents): ajouter le mode sudo au terminal intelligent
fix(auth): corriger le refresh token expiré
docs(api): mettre à jour la documentation Swagger
test(credits): ajouter les scénarios de recharge
refactor(logger): extraire le transport Loki
chore(deps): mettre à jour next.js vers 16.1.1
```

| Type | Quand l'utiliser |
|------|-----------------|
| `feat:` | Nouvelle fonctionnalité |
| `fix:` | Correction de bug |
| `docs:` | Documentation (README, JSDoc, guides) |
| `test:` | Ajout ou modification de tests |
| `refactor:` | Réorganisation sans changement fonctionnel |
| `chore:` | Maintenance (dépendances, CI, config) |
| `perf:` | Optimisation de performance |
| `style:` | Formatage (espaces, virgules...) |
| `ci:` | Pipeline CI/CD |
| `breaking:` | Changement cassant l'API |

### Style de code

- **Langue** : Code en anglais, commentaires en français
- **Types** : Toujours typer les fonctions et variables exportées
- **Async** : Utiliser `async/await`, pas de `.then()`
- **Imports** : Utiliser les alias `@/` (configurés dans tsconfig)
- **Logs** : Utiliser `createLogger('mon-service')` au lieu de `console.log`
- **Erreurs** : Utiliser les classes d'erreur standardisées de `@/lib/errors`

### Bonnes pratiques

```typescript
// ✅ Bien : types explicites, logger structuré, async/await
export async function getAgent(id: string): Promise<Agent | null> {
  log.info('get_agent', { agentId: id });
  return db.agent.findUnique({ where: { id } });
}

// ❌ Éviter : console.log, any, promesses non gérées
function getAgent(id) {
  console.log('Getting agent', id);
  return db.agent.findUnique({ where: { id } }).then(r => r);
}
```

---

## 8. Soumettre une Pull Request

### Processus étape par étape

```bash
# 1. Créer une branche depuis main
git checkout main
git pull origin main
git checkout -b feat/mon-awesome-feature

# 2. Coder, coder, coder...

# 3. Lancer les vérifications
npm run lint
npm run test:security
npm run test
npm run test:coverage   # Coverage doit être ≥ 80%

# 4. Commiter
git add .
git commit -m "feat(scope): description courte

Description détaillée de ce que fait ce commit.
- Point 1
- Point 2"

# 5. Pusher
git push origin feat/mon-awesome-feature

# 6. Ouvrir la Pull Request
# Sur GitHub : Compare & Pull Request
```

### Template de PR

```markdown
## Résumé

[Description de votre changement en 2-3 phrases]

## Changements

- [ ] Nouvelle fonctionnalité
- [ ] Correction de bug
- [ ] Réfabrication
- [ ] Documentation
- [ ] Tests

## Type de changement

- [ ] Breaking change (nécessite une mise à jour)
- [ ] Non-breaking (rétrocompatible)

## Comment tester

1. Lancer `npm run dev`
2. [Étapes pour reproduire/tester]
3. Vérifier que [résultat attendu]

## Checklist

- [ ] Les tests passent (`npm run test`)
- [ ] Le coverage est ≥ 80% (`npm run test:coverage`)
- [ ] Le lint passe (`npm run lint`)
- [ ] Les tests OWASP passent (`npm run test:security`)
- [ ] La documentation Swagger est à jour (`open http://localhost:3000/api/docs/swagger`)
- [ ] Des tests ont été ajoutés pour les nouvelles fonctionnalités
- [ ] Le code suit les conventions de style
- [ ] Les messages de commit suivent la convention

## Captures d'écran (si applicable)

[Annexer des captures]

## Issues liées

Fixes #123
Closes #456
```

### Exemple concret de PR

**Titre** : `feat(terminal): ajouter l'auto-complétion des chemins`

**Description** :
> Ajoute l'auto-complétion avec la touche Tab dans le terminal intelligent.
> Les suggestions incluent les commandes système et les fichiers du répertoire courant.
>
> **Changements** :
> - Nouveau hook `useTerminalAutocomplete` dans `hooks/`
> - Backend `/api/terminal/autocomplete` avec `fs.readdir`
> - Tests d'intégration dans `terminal-autocomplete.test.ts`
> - Documentation mise à jour dans le README
>
> **Comment tester** :
> 1. Ouvrir le terminal dans Gen3ia
> 2. Taper `cd ` puis appuyer sur Tab
> 3. Voir la liste des dossiers apparaître
>
> **Checklist** : ✅ Tests, lint, coverage, docs

### Que se passe-t-il après la soumission ?

1. **CI s'exécute automatiquement** : lint → type-check → tests → build → k6 → sécurité
2. **Un maintainer review** votre PR (généralement sous 48h)
3. **Vous pouvez recevoir des commentaires** — ne vous inquiétez pas, c'est normal !
4. **Une fois approuvée**, la PR est mergée dans `main`
5. **Un tag de version** est créé automatiquement

> **💡 Conseil** : Pour les PRs complexes, discutez d'abord de votre approche dans une Issue avant de coder.

---

## 9. Aller plus loin

### Ressources

| Ressource | Lien |
|-----------|------|
| Documentation API (Swagger) | `http://localhost:3000/api/docs/swagger` |
| Spec OpenAPI (JSON) | `http://localhost:3000/api/docs/openapi` |
| Architecture du projet | [ARCHITECTURE.md](./ARCHITECTURE.md) |
| Changelog | [CHANGELOG.md](./CHANGELOG.md) |
| Sécurité | [SECURITY.md](./SECURITY.md) |
| Issues GitHub | https://github.com/missock237-spec/Gen3ia/issues |

### Commandes utiles

```bash
# Générer la documentation API statique
npm run docs:generate

# Lancer la stack monitoring complète
docker compose -f docker-compose.monitoring.yml up -d

# Lancer l'environnement staging (production-like)
docker compose -f docker-compose.staging.yml --env-file .env.staging up -d

# Audit de sécurité complet
npm run security:all

# Nettoyer les fichiers résiduels
bash scripts/cleanup.sh
```

### Signaler un bug

Si vous trouvez un bug, ouvrez une [Issue GitHub](https://github.com/missock237-spec/Gen3ia/issues/new) avec :

1. **Titre clair** : décrivant le problème
2. **Étapes pour reproduire** : du début à la fin
3. **Comportement attendu** : ce qui devrait se passer
4. **Comportement réel** : ce qui se passe vraiment
5. **Environnement** : OS, Node.js, navigateur, version de Gen3ia
6. **Logs ou captures d'écran** : si possible

### Signaler une vulnérabilité de sécurité

Merci de **NE PAS** ouvrir une issue publique. Envoyez un email à `security@gen3ia.ai`.

---

Merci de contribuer à Gen3ia ! 🚀

*Chaque contribution, même petite, rend le projet meilleur.*