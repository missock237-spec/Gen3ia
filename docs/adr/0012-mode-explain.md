# ADR-0012 — Mode Explain : approbation et édition des plans avant exécution

## Statut
Accepté (v3.1 — amélioration « Mode Explain (Plan détaillé) »)

## Contexte
En v3.0, la sélection du plan était 100 % automatique : l'utilisateur
découvrait les 5 plans seulement APRÈS l'exécution. Aucun droit de veto
pré-exécution, aucune édition possible.

## Décision
- Nouvel état `WAITING_PLAN_APPROVAL` (transitions validées :
  SIMULATING → W-P-A → EXECUTING/PLANNING/CANCELLED).
- Réglé par utilisateur (`settings.planApproval`) : « auto » (défaut —
  préserve les flux SDK et l'API v1) ou « manual » (mode Explain).
- En attente : comparaison des 5 plans notés, SÉLECTION manuelle (prime sur
  le score, journalisée en audit), ÉDITION des étapes (titre/détail/outil,
  8 max, validations de forme), RÉGÉNÉRATION, ou refus.
- Défense en profondeur : un plan sélectionné manuellement reste soumis au
  HITL des opérations dangereuses.

## Justification
- L'approbation humaine pré-exécution est le meilleur point d'intervention :
  coût nul, information maximale (plans + scores + risques).
- Le défaut « auto » évite de casser l'API v1 et le pipeline de test.

## Conséquences
- `resolvePlanApproval()` ré-évalue la cohérence (requiredTools recalculés
  après édition) et force `selectedPlanId`.
- La tâche n'avance que sur décision — compatible avec le modèle par
  sondage (ADR-0008).
