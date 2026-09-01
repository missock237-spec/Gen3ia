# ADR-0011 — Cache de plans : exact par hash + similitude sémantique

## Statut
Accepté (v3.1 — amélioration « Mettre en Cache les Plans Fréquents »)

## Contexte
Générer 5 plans = ~4500 tokens de sortie par tâche. Les demandes similaires
régénèrent le même travail.

## Décision
- **Exact d'abord** : SHA-256 du prompt normalisé (minuscules, accents
  retirés, espaces compactés).
- **Puis sémantique** : cosinus ≥ 0.92 entre l'embedding du prompt et les
  entrées en cache du même utilisateur (recherche sur les 200 plus
  récentes).
- **TTL 7 jours**, LRU 200 entrées/utilisateur, compteur de hits.
- **Fail-open** : toute erreur de cache est journalisée et contournée — la
  planification ne peut jamais être bloquée par son cache.
- Seule la GÉNÉRATION est contournée : l'évaluation est refaite avec les
  poids courants ; l'éthique re-vérifie ; le mode Explain reste applicable.
- Désactivable : `PLAN_CACHE=off` ; purge admin en un clic.

## Justification du seuil 0.92
Sous 0.90, des demandes « proches mais différentes » (nouvelles contraintes)
partageraient des plans obsolètes. L'embedding local (hachage n-grammes)
est conservateur par construction — le seuil élevé compense.

## Conséquences
- Économie mesurable (hits visibles dans l'admin) sans perte de traçabilité
  (l'origine « cache exact/sémantique » est journalisée dans l'étape).
