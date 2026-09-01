# ADR-0008 — Pipeline résumable piloté par HTTP (avancement par sondage)

## Statut
Accepté (v3.0, renforcé v3.1)

## Contexte
Serverless = pas de worker persistant ni de file d'attente garantie. Une
tâche doit pourtant traverser 7 phases, chacune coûteuse en LLM.

## Décision
- Chaque phase persiste sa sortie dans la colonne JSON dédiée de la Task
  (checkpoint). `advanceTask(taskId, {budgetMs})` exécute TOUTES les phases
  possibles dans le budget (50 s), puis rend la main.
- Les sondages du client (UI 3 s / SDK) rappellent `advanceTask` : la tâche
  progresse tant qu'on la regarde — idempotent (une phase déjà persistée
  n'est jamais rejouée).
- v3.1 : machine à états stricte (transitions validées), nouvel état
  WAITING_PLAN_APPROVAL, **checkpoint mi-exécution** (après CHAQUE étape —
  un crash ne perd plus le travail), **fusions atomiques** (verrouillage
  optimiste via Task.version, 3 tentatives), budget de retries persisté
  (Task.totalRetries).

## Justification
- Zéro infrastructure de queue ; compatible Vercel gratuit.
- L'idempotence par champ rend le sondage concurrent (UI + SDK) sûr.

## Conséquences
- Une tâche sans visiteur n'avance pas (par conception — le coût n'est
  engagé que sous surveillance).
- Les charges volumineuses (preuves) sont externalisées (v3.1 :
  TaskArtifact gzip, métadonnées seules dans la ligne Task).
