# ADR-0009 — SDK de moteurs : contrat strict execute / rollback / getStatus

## Statut
Accepté (v3.1 — amélioration « Définir un SDK de Moteurs Clair »)

## Contexte
En v3.0, chaque moteur était une fonction exportée, appelée ad hoc par
l'orchestrateur : pas de rollback, pas de santé, télémétrie inexistante,
ajout d'un moteur = chirurgie du cœur.

## Décision
Contrat unique `EngineInterface` :
- `execute(input, ctx) → EngineExecution` (valeur + tokens + durée + tentatives)
- `rollback(ctx, err?)` — annulation propre des effets persistés de la phase
- `getStatus() → EngineHealth` (statistiques durables 7 j)

`runEngine()` enveloppe TOUT appel : chronométrage, EngineRun (télémétrie
durable), journalisation structurée, mapping d'erreurs vers le catalogue
métier. Un registre global expose la santé de tous les moteurs (admin).

## Justification
- **Testabilité** : chaque moteur est isolable (les tests unitaires
  n'exigent ni LLM ni réseau).
- **Extensibilité prouvée** : l'EthicsEngine (v3.1) a été ajouté SANS toucher
  au cœur — implémentation du contrat + enregistrement.
- **Observabilité uniforme** : un seul point de mesure pour 9 moteurs.

## Conséquences
- Les adaptateurs (engines.ts) délèguent aux fonctions métier historiques —
  les modules restent testables isolément.
- Le rollback est par phase (plans invalidés, étapes SKIPPED) — pas de
  compensation financière (les crédits consommés restent dus).
