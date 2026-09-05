# ADR 0016 — Intégration Composio Cloud (SDK officiel, 300+ apps en un clic)

## Statut

Accepté — v4.2

## Contexte

GEN3IA embarque depuis la v3.4 un moteur de connecteurs **local** (architecture adaptée
de Composio, MIT) : 13 apps natives aux actions exécutables, un catalogue public de
1467 apps / 51240 outils, OAuth opéré par les identifiants de l'opérateur
(env ou table `OAuthAppConfig`), import de token utilisateur.

La limite de ce modèle : chaque app OAuth exige que **l'opérateur** enregistre un couple
client-id/secret. Les utilisateurs ne peuvent pas connecter seuls les apps non préconfigurées,
et l'objectif produit « 300+ apps externes disponibles en un clic » reste hors de portée sans
travail administratif par app.

Composio propose une plateforme hébergée qui opère l'OAuth de ~300 apps gérées
(« composio-managed ») pour les comptes de ses clients : un SDK officiel
(`@composio/core`), une clé API, et l'utilisateur final autorise son compte via une
redirection hébergée. Aucun secret applicatif ne transite par le client.

## Décision

Intégrer le **SDK officiel `@composio/core`** en complément (jamais en remplacement)
du moteur local, piloté par une clé API résolue côté serveur uniquement :

1. **Dépendances** : `@composio/core@0.18`, `@composio/vercel` (provider Vercel AI SDK,
   disponible pour les intégrations futures), `ai@7` (Vercel AI SDK).

2. **Résolution de la clé** (`src/lib/connectors/composio/client.ts`) :
   - priorité `COMPOSIO_API_KEY` (environnement) ;
   - repli secret plateforme chiffré AES-256-GCM (table `PlatformSecret`, écriture admin
     via `POST /api/admin/composio`, rotation à chaud sans redeploiement) ;
   - la clé n'est **jamais** sérialisée vers le client ; l'instance SDK est cachée par clé.

3. **Provider** (`src/lib/connectors/composio/provider.ts`) :
   - `composioStatus()` — état global + comptage des toolkits managés (liste live
     `toolkits.get({ managedBy: "composio" })`, cache 10 min, repli statique catalogue
     public 121 apps) ;
   - `authorizeComposioApp()` — `toolkits.authorize()` → URL d'autorisation hébergée
     (connexion en un clic, OAuth opéré par Composio) ;
   - `listComposioConnections()` — comptes connectés de l'utilisateur (vues
     **sanitisées**, id préfixé `cpc_`, cache 30 s, aucun secret) ;
   - `executeComposioAction()` — `tools.execute()` avec version de toolkit épinglée
     depuis les métadonnées live de l'outil (repli `dangerouslySkipVersionCheck`
     documenté) ; span OTel `composio.action` ;
   - `composioToolsForUser()` — outils des apps connectées convertis au format
     registre GEN3IA (`ConnectorTool`, clé `connector_<app>_<TOOL_SLUG>`,
     schéma JSON → paramètres, heuristique de sensibilité lecture/mutation).

4. **Priorités** (identité du produit préservée) :
   - disponibilité : OAuth local préconfiguré (env) → **OAUTH** ; sinon app gérée
     Composio et clé présente → **COMPOSIO** ; sinon token import / credentials ;
   - exécution : connexion **locale active d'abord** (secrets maîtrisés GEN3IA),
     relay Composio seulement à défaut (apps non couvertes localement) ;
   - exposition d'outils : fusion sans doublon (une app couverte en local n'est pas
     re-listée par Composio).

5. **Prisma** : modèle `PlatformSecret` (non destructif, DDL `db-init.ts` SQLite + PG,
   `CREATE TABLE IF NOT EXISTS`) — migration zéro downtime.

6. **API** :
   - `POST /api/connectors/connect` — mode `COMPOSIO` (redirection hébergée) ;
   - `GET /api/connectors/connections` — fusion locale + hébergée (champ `provider`) ;
   - `DELETE /api/connectors/connections/:id` — suppression `cpc_*` via Composio
     (vérification d'appartenance) ;
   - `GET /api/connectors/catalog` — statut `COMPOSIO` par app + statut global ;
   - `GET/POST/DELETE /api/admin/composio` — gestion de la clé (gardes `requireAdmin`).

7. **UI** : carte « Composio Cloud » en tête de la page Connecteurs (statut, comptage,
   connexions hébergées + déconnexion, formulaire clé admin), badge « 1-clic (Composio) »
   dans le catalogue, i18n FR/EN dans le domaine dédié `dict/composio.ts`.

## Alternatives rejetées

- **Remplacer le moteur local par Composio** : perte de la maîtrise des secrets et de
  l'exécution 100 % locale (identité v3.4), dépendance forte à un service tiers.
- **API REST maison vers Composio** : réinventer le SDK officiel (versions d'outils,
  erreurs typées, retries) — coût élevé, risque d'API inventée (interdit).
- **Sessions/meta-tools Composio pour les agents** : le registre d'outils GEN3IA
  (`connector_<app>_<action>`) est déjà intégré à l'executor/HITL/OTel ; les meta-tools
  masqueraient la granularité d'autorisation par app/action.

## Conséquences

- Avec une clé valide : ~300+ apps connectables en un clic, zéro configuration par app ;
  sans clé : comportement inchangé (moteur local seul).
- La liste `composioManaged` du catalogue public (121 apps) sert de repli si la liste
  live est indisponible — le comptage affiché est toujours honnête (source live/static).
- Les connexions Composio vivent côté plateforme : GEN3IA n'en stocke que des vues
  sanitisées (statut, indice de compte) — pas de refresh token à gérer pour ces apps.
- Coût : exécutions facturables côté Composio selon leur plan (le plan gratuit couvre
  le développement ; l'opérateur gère la clé).

## Validation

- 24 tests unitaires dédiés (`tests/unit/connectors-composio.test.ts`) : résolution de
  clé (env > base chiffrée, jamais en clair), priorité des modes, vues sanitisées,
  exécution stub serveur (formats wire v3.1 réels), conversion d'outils, anti-doublon.
- Suite complète : 424/424 tests verts (dont corrections de 2 tests préexistants :
  dérive `API_V1_ENDPOINTS` vs spec OpenAPI, déterminisme inter-exécutions alerting).
- E2E navigateur : carte Composio, formulaire admin (clé chiffrée, badge Active,
  comptage), badge catalogue « 1-clic », guards 401/403 vérifiés.
- Chaîne réelle vérifiée : l'API Composio répond (401 explicite sur clé invalide,
  dégradation propre) — une clé valide active immédiatement le flux complet.
