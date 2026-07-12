# Guide de contribution — Genova

Merci de ton intérêt pour Genova ! Ce guide t'explique comment contribuer efficacement.

## Prérequis

- Lire le [README](./README.md) et configurer l'environnement de développement
- Avoir une issue GitHub associée à ta contribution (ou en créer une)

## Workflow Git

1. Fork le repo
2. Crée une branche à partir de `main` :
   ```bash
   git checkout -b feat/mon-feature
   # ou
   git checkout -b fix/mon-bug
   ```
3. Fais tes modifications en suivant les conventions ci-dessous
4. Lance les tests et le linter :
   ```bash
   bun run lint
   bun run test
   ```
5. Commit avec un message conventionnel (voir section Commits)
6. Ouvre une Pull Request vers `main`

## Convention de commits

Nous suivons [Conventional Commits](https://www.conventionalcommits.org/) :

```
feat: ajouter support Telegram
fix: corriger timeout AI router sur 429
docs: mettre à jour README
test: ajouter tests pour auth.ts
refactor: extraire logique session en helper
chore: mettre à jour dépendances
```

## Convention de code

- **TypeScript strict** — pas de `any`, pas de `@ts-ignore`
- **ESLint** — `bun run lint` doit passer sans erreur
- **Nommage** :
  - Variables/fonctions : `camelCase`
  - Composants React : `PascalCase`
  - Fichiers : `kebab-case`
  - Constantes : `UPPER_SNAKE_CASE`
- **Tests** : tout nouveau module critique doit avoir des tests unitaires
- **Commentaires** : expliquer le "pourquoi", pas le "quoi"

## Structure des dossiers

```
src/
├── app/           # Next.js App Router (pages + API routes)
├── components/    # Composants React réutilisables
├── hooks/         # React hooks custom
└── lib/           # Logique métier, services, clients
    ├── ai-router.ts
    ├── auth.ts
    ├── db.ts
    └── ...
```

## Pull Requests

- Titre clair en français ou anglais
- Description : contexte, solution, tests effectués
- Lier l'issue correspondante (`Closes #123`)
- Une PR = un sujet (ne pas mélanger feat + fix)
- Toutes les CI doivent passer avant merge

## Signaler un bug

Utilise le [template d'issue bug](.github/ISSUE_TEMPLATE/bug_report.md).

## Proposer une fonctionnalité

Utilise le [template d'issue feature](.github/ISSUE_TEMPLATE/feature_request.md).
