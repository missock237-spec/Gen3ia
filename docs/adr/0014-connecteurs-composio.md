# ADR-0014 — Connecteurs d'applications externes via Composio

## Statut
Accepté (v3.3)

## Décision
GEN3IA intègre le projet open-source Composio (ComposioHQ/composio, licence
Apache-2.0) comme couche de connectivité applicative : l'API v3.1
(backend.composio.dev, ou instance self-hosted via COMPOSIO_BASE_URL) donne
aux agents un accès authentifié à 1000+ applications réelles — GitHub, Slack,
Notion, Gmail, WhatsApp, Google Sheets, Stripe…

L'intégration est réalisée par un client TypeScript natif
(`src/lib/connectors/composio/`) qui reproduit fidèlement le contrat du SDK
officiel `@composio/client` (analyse complète du monorepo : endpoints v3.1,
bodies, statuts) : fetch natif compatible serverless Vercel, sans dépendance
supplémentaire, protégé par le circuit breaker « composio » (ADR-0010).

## Justification
- Réutiliser 1000+ intégrations OAuth maintenues par la communauté plutôt que
  d'écrire N connecteurs soi-même : chaque app exige un client OAuth enregistré
  chez le fournisseur — coût prohibitif pour une plateforme seule.
- Le cahier des charges exclut tout code de démonstration : Composio est un
  service réel ; la clé `COMPOSIO_API_KEY` active la fonctionnalité entière
  (le pattern « ajouter la clé et ça marche » déjà utilisé pour Chariow/LLM).
- Séparation nette des responsabilités (cf. ADR-0001 : GEN3IA = cerveau,
  Composio = mains applicatives).

## Architecture
1. **Modèle de sécurité** : les jetons OAuth des apps externes vivent dans le
   coffre Composio. GEN3IA stocke uniquement `ConnectedAccount` (identifiant
   Composio, statut, compteur d'usage) — zéro secret applicatif en base.
2. **Cloisonnement par utilisateur** : chaque utilisateur GEN3IA possède un
   identifiant Composio namespacé `g3ia_<userId>` ; ses connexions ne sont
   utilisables que par ses agents.
3. **Flux de connexion** (page /connectors) :
   résolution/création d'auth config (mode « Composio-managed », OAuth géré
   par Composio) → `POST /connected_accounts/link` → redirection vers la page
   d'autorisation du fournisseur → retour sur `/api/connectors/callback` →
   resynchronisation des statuts (ACTIVE).
4. **Pont moteur** (3 outils génériques, pattern « tool router ») :
   - `composio_list_apps` : inventaire des apps connectées (planner) ;
   - `composio_list_actions` : découverte des actions + schémas ;
   - `composio_execute` : exécution authentifiée (marqué SENSIBLE → HITL
     selon les préférences utilisateur, comme code_runner/http_fetch).
   Ces outils n'apparaissent dans le catalogue du moteur QUE si
   `COMPOSIO_API_KEY` est présente (économie de tokens sinon).
5. **Erreurs typées** : CONNECTOR_NOT_CONFIGURED (503), CONNECTOR_AUTH_FAILED
   (402), CONNECTOR_UNREACHABLE (502), CONNECTOR_NOT_CONNECTED (409),
   CONNECTOR_RATE_LIMITED (429) — fail-closed, jamais de réponse simulée.

## Conséquences
- Une dépendance d'exploitation externe de plus : disponibilité des connecteurs
  liée à Composio (mitigée par circuit breaker + messages explicites).
- Le self-hosting Composio reste possible (COMPOSIO_BASE_URL) pour un
  contrôle total des données.
- Tests : 17 tests unitaires (fail-closed, cycle de vie DB, guards 401,
  catalogue dynamique) sans clé ; l'E2E réel avec actions applicatives exige
  COMPOSIO_API_KEY + une connexion OAuth complétée.
