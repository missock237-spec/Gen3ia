# ADR-0007 — Chariow, unique processeur de paiement (interdiction Stripe/PayPal)

## Statut
Accepté (v3.0, inchangé v3.1 — contrainte produit)

## Décision
Aucune intégration de paiement autre que Chariow (marché francophone
Afrique de l'Ouest, FCFA/XOF). Le webhook HMAC-SHA256 sur corps BRUT est le
seul point d'entrée des confirmations ; le crédit est accordé uniquement via
le Ledger (ADR-0006).

## Justification
- Contrainte explicite du cahier des charges (non négociable).
- Un seul intégrateur = surface d'attaque et dette de conformité minimales.

## Conséquences
- Les tests de paiement exigent un environnement Chariow ; la vérification
  de signature est testable unitairement (secret partagé).
- Toute évolution tarifaire passe par le catalogue de plans (code), pas par
  le processeur.
