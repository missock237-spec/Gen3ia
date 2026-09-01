# ADR-0002 — Génération systématique de cinq plans contrastés (A-E)

## Statut
Accepté (v3.0, durci v3.1)

## Contexte
Un planificateur LLM classique produit UN plan — sans alternative évaluable,
la sélection est aveugle. La spécification GEN3IA impose planification →
évaluation → sélection traçable.

## Décision
Le Planner produit EXACTEMENT 5 plans aux archétypes fixes :
- A : direct/rapide — B : approfondi — C : économie — D : robuste — E : créatif.

V3.1 : le schéma zod exige 4-5 plans (relance si moins de 5) ; les outils
exposés au LLM sont synchronisés avec le registre réel (source unique).

## Justification
- **Cinq, pas trois** : trois plans laissent souvent deux extrêmes et un
  médian ; cinq couvrent un axe coût/risque/latence/créativité exploitable
  par l'évaluateur pondéré (6 critères).
- **Archétypes nommés** : ancre le LLM, réduit la variance de génération, et
  donne à la boucle de feedback des statistiques stables par archétype
  (v3.1 : prior de succès observé par plan A-E).
- **Pas de génération à la demande** : générer 5 plans coûtent ~4500 tokens
  de sortie — amorti par le cache sémantique (ADR-0011).

## Conséquences
- L'utilisateur voit une comparaison explicite (mode Explain, ADR-0012).
- Le feedback par archétype n'est fiable qu'avec un échantillon minimal
  (≥ 3 exécutions, lissage de Laplace α=β=2) — pas de sur-apprentissage.
