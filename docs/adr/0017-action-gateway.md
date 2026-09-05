# ADR 0017 — Action Gateway (permissions, risque, vérification, audit)

## Statut

Accepté — v4.3

## Contexte

GEN3IA sait connecter des applications depuis la v3.4 (moteur local, 13 apps
natives, catalogue public 1467 apps / 51 240 outils) et déléguer l'OAuth de
~300 apps gérées à Composio Cloud depuis la v4.2. Mais l'exécution d'une
action connecteur ne traversait AUCUNE couche de décision unifiée :

- le **planner** ne connaissait que les 10 outils statiques — les actions des
  apps connectées n'apparaissaient qu'à l'exécution (les clés `connector_*`
  étaient filtrées hors du contexte de planification) ;
- la **sensibilité** était binaire (`isToolDangerous` → true pour TOUT tool
  connector) et la détection plan-level n'inspectait que le catalogue statique :
  un plan composé d'actions connecteur HIGH/CRITICAL ne déclenchait jamais le
  HITL de plan, et à l'exécution chaque appel était refusé silencieusement dès
  que les confirmations étaient actives ;
- **aucune permission** par app/action n'existait (seule la liste d'outils de
  l'agent) ; la route `/api/connectors/execute` ne vérifiait rien au-delà de
  l'authentification ;
- **aucun enregistrement** d'exécution persisté, aucune entrée dans la chaîne
  d'audit immuable, aucun lien de trace entre tâche/plan/étape et action ;
- **aucune vérification** qu'un effet de bord avait réellement eu lieu.

L'architecture produit cible (mission utilisateur) formalise le flux :

```
Agent → Planner → Tool Discovery → Permission → Risk Engine
      → Composio/Local → App → Result Verification → Result
```

## Décision

Créer une couche de passerelle unique — **Action Gateway** — par laquelle
passent TOUTES les exécutions d'actions connecteurs (agents via `runTool`,
console/SDK via `/api/connectors/execute`, confirmations via
`/api/connectors/executions/:id/confirm`).

### 1. Module `src/lib/connectors/gateway/`

| Fichier | Rôle |
|---|---|
| `types.ts` | Niveaux de risque, décisions, rapports, TTL de confirmation |
| `risk-engine.ts` | Score 0-100 à facteurs explicites (méthode HTTP, sémantique du slug, catégorie finance, diffusion massive, montants). Niveaux LOW 0-29 · MEDIUM 30-59 · HIGH 60-79 · CRITICAL 80-100. Synchrone, sans base |
| `permissions.ts` | Moteur d'autorisations `ConnectorPermission` : motifs 2 segments (`app.action`, `app.*`, `*.action`, `*`), effet ALLOW/DENY (DENY prioritaire), plafond de risque par permission, expiration, cache 30 s, dégradation propre si la table est illisible |
| `tool-discovery.ts` | (a) `discoverConnectorTools(q)` : apps classées → outils des apps candidates (jamais de scan brut des 51 240 outils), enrichi de l'état de connexion et du risque ; (b) `discoverySnapshotForUser` : instantané prompt-ready pour le planner (clés exactes + niveau de risque) |
| `verification.ts` | Contrôles de forme (transport, erreur applicative, charge utile des mutations, preuves id/url) + **read-back** : paires d'actions curatées (github create_issue→get_issue, create_repository→get_repository, trello create_card→get_card, jira create_issue→get_issue, notion create_page→get_page) qui RELISENT la ressource créée |
| `gateway.ts` | Orchestration : risque → permission → exécution (via `executeAction`, local prioritaire / relay Composio inchangé) → vérification → enregistrement `ConnectorExecution` + entrée `CONNECTOR_EXECUTED` dans la chaîne d'audit immuable |

### 2. Politique de décision

- **DENY explicite** → rejet immédiat (enregistré, audité, jamais exécuté).
- Plafond effectif = plafond le plus élevé des ALLOW applicables, relevé à
  **HIGH** par une pré-autorisation (HITL du plan approuvé / confirmations
  désactivées). CRITICAL exige TOUJOURS un opt-in explicite.
- Risque ≤ plafond → exécution. Sinon → **CONFIRMATION_REQUIRED**
  (enregistrement persisté, params chiffrés AES-256-GCM, TTL
  `CONNECTOR_CONFIRMATION_TIMEOUT_MINUTES` — 15 min par défaut, expiration
  fail-closed), résoluble par l'utilisateur (approuver / refuser /
  « toujours autoriser jusqu'à NIVEAU » → permission persistante).
- Défaut sans aucune permission : plafond **MEDIUM** (lectures et écritures
  standard automatiques — parité v4.2 ; envois/publications HIGH et
  suppressions CRITICAL sous confirmation).

### 3. Correction de deux défauts réels

- Le planner reçoit désormais l'instantané des actions connectées (clés
  exactes, risque) et peut citer `connector_<app>_<action>` dans
  `requiredTools`/`tool` ; les clés découvertes passent le filtre.
- La détection plan-level des opérations sensibles inclut les outils
  connector (`isPlanRiskyTool` : HIGH/CRITICAL) → le HITL de plan se
  déclenche correctement ; à l'exécution, le refus binaire est remplacé par
  la décision graduée du gateway (une lecture n'est jamais bloquée, une
  suppression sans accord devient une demande de confirmation traçable).

### 4. Prisma (non destructif — aucun modèle existant modifié)

- `ConnectorPermission` (unique `[userId, appSlug, actionPattern]`) ;
- `ConnectorExecution` : statut, risque (niveau+score+raisons), décision de
  permission, params rédigés + params chiffrés (uniquement les demandes de
  confirmation, effacés après usage), résultat, rapport de vérification,
  chaîne de trace `requestId → taskId → planId → stepIndex → executionId`,
  approbateur.
- DDL régénéré via la chaîne standard (sync-variants → gen-db-ddl →
  inject-db-ddl → ensureSchema) : 73 tables.

### 5. API

| Route | Description |
|---|---|
| `POST /api/connectors/execute` | passe par le gateway (champs enrichis : `executionId`, `executionStatus`, `risk`, `permission`, `verification`, `confirmation`) |
| `GET /api/connectors/executions` | historique (filtres `status`, `appSlug`, `taskId`, `limit`) |
| `GET /api/connectors/executions/:id` | détail complet (facteurs de risque, permission, params rédigés, contrôles de vérification, trace) |
| `POST /api/connectors/executions/:id/confirm` | HITL au niveau action (`approved`, `remember`, `reason`) |
| `GET/POST /api/connectors/permissions` · `DELETE /:id` | gestion des permissions |
| `GET /api/connectors/discover?q=` | Tool Discovery (apps + actions classées) |

### 6. Intégrations moteur

- `registry.runTool`/`toolset.runConnectorTool` → gateway (import dynamique :
  zéro cycle statique) ; `ToolContext` porte `taskId`, `planId`, `stepIndex`,
  `preAuthorized`.
- `executor` : pré-autorisation calculée via le callback (décision graduée),
  refus binaire réservé aux outils statiques ; chaîne de trace plan/étape.
- `planner` : instantané de découverte injecté (clés exactes + risque).
- `orchestrator` : détection risk-aware des opérations sensibles (plan) +
  callback `authorizeDangerousTool` consulte le moteur de permissions.
- UI : `GatewaySection` (exécutions + confirmations, permissions, découverte)
  sur la page Connecteurs ; i18n FR/EN (domaine `gateway`).

## Alternatives rejetées

- **Laisser le binaire `dangerous`** : bloque les lectures, ignore les
  suppressions au niveau plan — les deux défauts corrigés ici.
- **Permissions uniquement dans `Agent.config`** : pas de granularité par
  action, pas de DENY, pas d'expiration, pas de décision plan-level.
- **Vérification LLM-only du résultat final** : ne prouve rien par action ;
  le read-back lit la ressource créée côté application réelle.
- **SDK Composio pour la couche de décision** : la décision (permissions,
  risque, HITL, audit) est le cœur produit GEN3IA — Composio reste le moteur
  d'exécution relay, remplaçable progressivement (ADR-0016 inchangé).

## Conséquences

- Chaque action connecteur est évaluée, autorisée, tracée et vérifiée —
  avec des facteurs de risque explicites opposables à l'utilisateur.
- Les demandes de confirmation expirent (fail-closed) ; les params chiffrés
  sont effacés après résolution (rétention minimale).
- L'audit immuable (`ImmutableAuditLog`) reçoit désormais les exécutions
  connecteurs (`CONNECTOR_EXECUTED`) — falsification détectable.
- Le comportement sans configuration est inchangé côté exécution automatique
  (MEDIUM par défaut) : aucune régression des parcours v4.2 ; en revanche
  les actions HIGH/CRITICAL produisent des demandes de confirmation visibles
  au lieu de refus muets — un changement voulu (défaut corrigé).

## Validation

- Tests unitaires dédiés (`tests/unit/connectors-gateway.test.ts`) : Risk
  Engine (méthodes, slugs Composio, finance, bornes), permissions (motifs,
  DENY prioritaire, expiration, plafonds, pré-autorisation), gateway
  (rejet, confirmation, exécution vérifiée, trace), vérification (forme,
  read-back), découverte, intégration planner/registry.
- Suite complète, tsc, eslint, build, E2E navigateur (page Connecteurs :
  onglet Gateway, guards 401/403) et production.
