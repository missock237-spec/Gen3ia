# ADR-0014 — Moteur de connecteurs local (architecture Composio adaptée)

## Statut
Accepté (v3.3)

## Contexte
Les agents doivent pouvoir agir sur des applications tierces (GitHub, Slack,
Notion…) pendant l'exécution des tâches. Le projet open-source Composio
(github.com/ComposioHQ/composio — MIT, Copyright (c) 2025 Sampark Inc.)
formalise ce problème : schémas d'authentification (AuthSchemeTypes),
états de connexion (ConnectionStatuses), catalogue de toolkits et modèle
tool/action. Son SDK moderne est toutefois un **client** de sa plateforme
hébergée : l'exécution réelle (OAuth, appels d'API) est propriétaire.

## Décision
Réimplémenter le moteur de connecteurs **en local** dans GEN3IA, en adaptant
l'architecture et les types de Composio (attribution MIT conservée dans les
en-têtes de fichiers) — **sans aucune dépendance runtime à une plateforme
tierce** :

- `src/lib/connectors/core/` — moteur : types (portés de
  `authConfigs.types.ts` / `connectedAccountAuthStates.types.ts`),
  fabrique `AuthScheme` (portée de `AuthScheme.ts`), chiffrement
  AES-256-GCM des secrets, OAuth2 complet (RFC 6749 + PKCE RFC 7636,
  rafraîchissement, révocation RFC 7009, comptes de service Google
  RFC 7523), OAuth1.0a complet (RFC 5849, signature HMAC-SHA1 par
  requête), exécuteur d'actions déclaratives, service de connexions,
  toolset d'exposition LLM.
- `src/lib/connectors/apps/` — catalogue de 13 applications réelles
  (77 actions) : GitHub, Slack, Gmail, Google Calendar, Notion, Discord,
  Trello, Jira, Linear, Airtable, Telegram, Stripe, X. Chaque action
  décrit un endpoint documenté (méthode, chemin, paramètres, injection
  d'identifiants) — aucune réponse simulée.
- Persistance : `ConnectedAccount` (secret chiffré, upsert par
  utilisateur+app) et `ConnectionRequest` (state HMAC anti-CSRF,
  verifier PKCE chiffré, TTL 10 min) — ajoutés au DDL d'exécution
  (SQLite + Postgres) pour les déploiements serverless.
- Intégration agents : clé d'outil `connector_<app>_<action>`,
  filtrage par `connectors` (joker), `connector:<app>` (préfixe) ou
  action exacte ; dispatch via `runTool` ; les actions en écriture
  (non-GET) sont marquées sensibles (HITL possible).

## Justification
- **Souveraineté** : zéro intermédiaire entre GEN3IA et les API cibles ;
  pas de coût ni de dépendance à un SaaS de connecteurs.
- **Fidélité architecture** : les mêmes concepts que Composio
  (schémas, états, toolkits/actions) — courbe d'apprentissage nulle
  pour qui connaît l'écosystème, code auditable de bout en bout.
- **Sécurité** : secrets chiffrés au repos, jamais renvoyés par l'API ;
  state OAuth signé HMAC ; PKCE quand le fournisseur le supporte ;
  retry-401 unique après rafraîchissement.
- **Vérifiabilité** : exécution réelle prouvée par E2E
  (`scripts/connectors-verify.mjs` : appel authentifié à api.github.com,
  recherche de dépôts, révocation, erreurs propres sans faux succès).

## Conséquences
- Les apps OAuth (Gmail, Calendar, Trello, X…) exigent leurs variables
  serveur (`GITHUB_CLIENT_ID`…`X_CLIENT_SECRET`) ; sans elles elles
  apparaissent « non connectables » — jamais de repli silencieux.
- Les apps à import direct (GitHub PAT, Slack token, Notion, Discord,
  Linear, Airtable, Telegram, Stripe, Jira) fonctionnent sans
  configuration serveur : l'utilisateur fournit sa clé, chiffrée à
  l'écriture.
- Ajouter une app = un fichier déclaratif dans `apps/` (aucune
  modification du moteur) ; les hooks `prepare` couvrent les
  conventions non génériques (RFC 2822 Gmail, GraphQL Linear, form
  Stripe).
- Tests : 68 tests unitaires connectors + intégration runTool
  (159 tests au total, 0 échec).
