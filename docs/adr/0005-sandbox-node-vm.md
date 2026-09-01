# ADR-0005 — Sandbox code_runner : node:vm durci, limites assumées

## Statut
Accepté (v3.0, durci v3.1 — audit sécurité)

## Contexte
L'outil code_runner exécute du JavaScript généré par le LLM. node:vm n'est
PAS une frontière de sécurité dure (isolation mémoire et processus absentes).

## Décision
Défense en profondeur, IN-PROCESS (contrainte serverless, ADR-0001) :
1. **Liste de refus statique AVANT exécution** : constructor, __proto__,
   process, globalThis, require(, import(, eval(, Function(, WebAssembly,
   SharedArrayBuffer, WeakRef, Proxy(, fetch, WebSocket — les vecteurs
   d'échappement documentés de node:vm.
2. **Contexte minimal et gelé** : Math, JSON, Date, primitives —
   BigInt/process/fetch/require/global explicitement undefined.
3. **Limites d'exécution** : timeout 5 s, 50 lignes de log, 4 Ko de sortie.
4. **Audit systématique** : chaque exécution (acceptée ou refusée) est
   journalisée en JSON structuré (qui, taille, verdict, durée).
5. **Statut dangereux** : code_runner reste `dangerous: true` →
   approbation HITL par défaut.

## Option rejetée
Conteneur/isolate par exécution : incompatible serverless (spawn de process
et montage réseau). Le Dockerfile fourni couvre l'auto-hébergement pour des
charges hostiles.

## Conséquences
- Les codes légitimes utilisant `constructor` (classes) sont refusés avec
  un message explicite — arbitrage sécurité > confort.
- L'audit est re-conduisible : `rg '"sandbox' dans les logs.
