# ADR-0005 — Sandbox code_runner : node:vm durci, limites assumées

## Statut
Accepté (v3.0, durci v3.1 — audit sécurité interne, revu v3.2 — audit externe)

## Contexte
L'outil code_runner exécute du JavaScript généré par le LLM. node:vm n'est
PAS une frontière de sécurité dure (isolation mémoire et processus absentes).
L'audit externe v3.2 a confirmé ce point : cette ADR documente le modèle de
menace exact et le déclencheur explicite de migration.

## Modèle de menace (clarifié v3.2)
- **Qui peut déclencher du code** : un utilisateur AUTHENTIFIÉ, via SES
  agents/tâches, derrière les guards (session ou clé API), le rate limit
  (60 req/min) et le débit du Credit Ledger. Aucun endpoint public anonyme
  n'exécute de code.
- **Ce qui est protégé en priorité** : les données des AUTRES locataires et
  les secrets du processus (variables d'environnement). La liste de refus
  vise précisément les vecteurs d'accès à `process.env` et aux intrants
  réseau.
- **Ce qui n'est PAS garanti** : la confidentialité/intégrité du résultat
  produit par le code lui-même (l'auteur du code est le propriétaire du
  compte qui paie l'exécution).

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

## Déclencheur de migration (v3.2 — engagement explicite)
AVANT toute montée en charge exposant l'exécution de code à des
utilisateurs non fiables — typiquement l'exécution d'agents de la
marketplace par des tiers — code_runner DOIT migrer vers un isolat réel :
- **Option A** : microservice d'exécution conteneurisé (Docker dédié,
  réseau coupé, un conteneur par exécution, TTL court) — le Dockerfile
  racine en est l'ébauche ;
- **Option B** : service externe spécialisé (type E2B) ;
- **Option C** : `isolated-vm` (isolats V8, coût mémoire par instance).
Critère de décision : coût marginal par exécution vs volume et niveau de
confiance des exécutants. Tant que le critère n'est pas atteint, la
situation actuelle (exécution propriétaire, authentifiée, journalisée,
facturée) est un arbitrage assumé — pas un angle mort.

## Option rejetée (à ce stade)
Conteneur/isolate par exécution : incompatible serverless (spawn de process
et montage réseau) TANT QUE l'exécution reste limitée aux comptes
propriétaires. Voir « Déclencheur de migration » ci-dessus : ce rejet est
CONDITIONNEL et daté.

## Conséquences
- Les codes légitimes utilisant `constructor` (classes) sont refusés avec
  un message explicite — arbitrage sécurité > confort.
- L'audit est re-conductible : `rg '"sandbox' dans les logs.
- La revue sécurité externe peut vérifier le respect du déclencheur de
  migration avant tout lancement marketplace « exécution par des tiers ».
