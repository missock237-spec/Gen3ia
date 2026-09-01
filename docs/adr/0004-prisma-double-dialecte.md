# ADR-0004 — Prisma avec double dialecte (SQLite dev / Postgres prod)

## Statut
Accepté (v3.0, étendu v3.1)

## Contexte
Le développement local doit démarrer sans infrastructure ; la production
serverless exige une base partagée persistante.

## Décision
- `prisma/schema.sqlite.prisma` et `prisma/schema.pg.prisma` maintenus en
  miroir ; `scripts/select-schema.mjs` copie le bon dialecte vers
  `schema.prisma` selon le préfixe de DATABASE_URL (postinstall).
- `src/lib/db-init.ts` crée le schéma à l'exécution, idempotent, pour les
  deux dialectes (DDL + ALTER silencieux pour les colonnes ajoutées).
- v3.1 : correction du bug v3.0 (POSTGRES_DDL référencé mais non défini).

## Justification
- Zéro migration manuelle au premier déploiement (l'auto-création couvre
  Vercel + SQLite local).
- Postgres reste requis pour partager les données entre instances
  serverless — documenté dans .env.example.

## Conséquences
- Chaque changement de schéma doit être répliqué dans les 3 fichiers + le
  DDL d'initialisation (discipline acceptée, vérifiée par les tests
  d'intégration sur SQLite).
- Les index composites doivent rester compatibles SQLite.
