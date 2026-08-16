# Module Rust optionnel (crates)

Gen3ia embarque une brique Rust **optionnelle** pour les calculs coûteux :
vérification de clés API (BLAKE3), comptage/débit de crédits haute fréquence,
normalisation de texte (rechunk LLM).

## Emplacement dans le monorepo

```
crates/
  agent-safety/     # safety & guardrails
  compute-engine/   # calcul coûteux (crédits, clés API)
  src/lib/          # façade TS qui consomme la brique via interface stable
```

## Règles de maintenabilité

1. **Optionnelle** : sans compilation Rust, `packages/core` retombe sur une
   implémentation TS équivalente (flag `ENABLE_NATIVE=1`).
2. **Interface pure** : aucun I/O interne (pas de connexion Firestore), inputs/
   outputs sérialisables ; toute mutation passe par l'appelant Node.
3. Build via `napi build --release`, artefacts produits en CI.
4. **Pas d'état mutable global** : tout état partagé est injecté par l'appelant.

## Build

```bash
cargo build --release -p compute-engine
```
