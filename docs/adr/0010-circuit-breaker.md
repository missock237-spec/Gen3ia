# ADR-0010 — Circuit breaker par dépendance + budget global de retries

## Statut
Accepté (v3.1 — amélioration « Limiter le Nombre de Retry »)

## Contexte
L'auto-correction v3.0 connaissait RETRY/SWITCH_MODEL/REPLAN/ABORT mais :
pause fixe de 3 s, SWITCH_TOOL jamais sélectionné, aucune borne GLOBALE —
une boucle replan ↔ échec pouvait brûler des crédits indéfiniment.

## Décision
1. **Breaker par dépendance** (clé `tool:*` / `provider:*` / `embeddings:*`) :
   5 échecs en fenêtre glissante de 120 s → OPEN ; 30 s de cooldown →
   HALF_OPEN ; une sonde — succès = reset, échec = retour OPEN.
2. **SWITCH_TOOL effectif** : breaker d'outil ouvert → l'exécuteur informe
   le modèle et poursuit SANS l'outil (bascule ReAct réelle) ;
   analyzeError mappe l'erreur vers SWITCH_TOOL.
3. **Budget global persisté** (Task.totalRetries, défaut 8, tunable admin) :
   chaque retry de N'IMPORTE QUELLE phase le consomme ; épuisement → arrêt
   propre RETRY_BUDGET_EXCEEDED.
4. **Backoff exponentiel avec jitter complet** (1 s, ×2, plafond 15 s) —
   remplace la pause fixe ; anti-thundering-herd.
5. **Plafond de replans** (3) dans l'orchestrateur — boucle bornée même si
   REPLAN ne consomme pas de budget.

## Conséquences
- Une dépendance défaillante est court-circuitée en ~0 ms (fail-fast).
- L'admin voit et réinitialise les breakers en direct (interface Moteurs).
