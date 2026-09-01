# ADR-0006 — Credit Ledger append-only (jamais de solde modifié en place)

## Statut
Accepté (v3.0, inchangé v3.1)

## Décision
Toute variation de solde passe par une ligne `Transaction`
(type, amount signé, balanceAfter, refType/refId). Le solde affiché est
la dernière balanceAfter. Aucun `UPDATE credits` direct.

## Justification
- **Auditabilité** : chaque crédit consommé est rejouable (qui, quand,
  pourquoi — phase, tokens, référence tâche/agent).
- **Intégrité** : un crash en cours de phase ne peut pas créer de solde
  fantôme ; la transaction SQL (vérif solde → débit → écriture) est atomique.
- **Facturation explicable** : la page Facturation agrège les mêmes lignes
  que le moteur consomme — une seule source de vérité.

## Conséquences
- `InsufficientCreditsError` porte le déficit exact → code métier
  INSUFFICIENT_CREDITS (402) côté API.
- Les retries consomment des crédits réels — bornés par le circuit breaker
  et le budget global (ADR-0010).
