# ADR-0001 — Application Next.js unique plutôt que monorepo multi-services

## Statut
Accepté (v3.0, confirmé v3.1)

## Contexte
GEN3IA doit déployer 8 moteurs (analyse, planification, évaluation, exécution,
vérification, auto-correction, apprentissage, éthique), ~26 routes API, un
Task Center résumable et une API publique v1. La spécification initiale
évoquait un monorepo (apps/web, apps/api, apps/worker, apps/sandbox +
packages/*).

## Décision
Une application Next.js UNIQUE (App Router, server actions/API routes),
serverless-first, avec le pipeline dans le processus des routes.

## Justification
- **Coût opérationnel** : un monorepo multi-services exige une orchestration
  de déploiement, des files d'attente et un CDN privé — hors de portée sans
  budget d'infrastructure. Une seule app Vercel = zéro DevOps.
- **Latence du pipeline** : le pattern « chaque sondage HTTP fait avancer la
  tâche » (ADR-0008) fonctionne parce que l'orchestrateur vit DANS les routes.
- **Cohérence transactionnelle** : Credit Ledger et Task partagent la même
  base — pas de distribution nécessaire à cette échelle.
- **Réversibilité** : les moteurs respectent le contrat SDK (ADR-0009) ;
  extraire un service plus tard est un refactor mécanique, pas une réécriture.

## Conséquences
- Le budget temporel par requête (50 s, contrainte serverless) borne chaque
  appel `advanceTask` — la reprise par sondage compense.
- Le sandbox code_runner reste in-process (ADR-0005) avec ses limites.
- Redis/pgvector externes restent optionnels, jamais requis.
