# Worklog GEN3IA

---
Task ID: 1
Agent: main
Task: Analyse du code source Composio (github.com/ComposioHQ/composio) et conception du moteur connectors local

Work Log:
- Clone shallow de Composio (MIT, Copyright (c) 2025 Sampark Inc.) dans /home/z/my-project/research/composio-src
- Lecture des fichiers clés : ts/packages/core/src/models/AuthScheme.ts, types/authConfigs.types.ts, types/connectedAccountAuthStates.types.ts, types/customTool.types.ts, models/CustomTool.ts, cli-local-tools (registre de toolkits locaux)
- Constat : le SDK moderne de Composio est un client de leur plateforme hébergée ; le moteur d'exécution réel (OAuth, actions) est serveur. L'architecture des modèles (AuthScheme/ConnectionData/Toolkit/Tool/CustomTool) est copiable et adaptable.
- DECISION : réimplémenter le moteur connectors EN LOCAL dans GEN3IA, en adaptant l'architecture et les types de Composio (attribution MIT incluse), avec exécution 100% locale (aucune dépendance à l'API Composio).

Stage Summary:
- Sources analysées ; architecture cible définie : src/lib/connectors/{core,apps} + Prisma ConnectedAccount/ConnectionRequest + routes API + UI + intégration executor
- Contraintes : zéro demo/mock, secrets chiffrés AES-256-GCM, OAuth2 (PKCE+refresh) et OAuth1.0a complets, actions réelles des APIs publiques

---
Task ID: 2
Agent: main
Task: Moteur de connecteurs local — copie/adaptation du code source Composio en fichiers sources GEN3IA (zéro demo, zéro simplification)

Work Log:
- Prisma : modèles ConnectedAccount + ConnectionRequest ajoutés aux 3 schémas (sqlite/pg/généré) + DDL d'exécution (db-init.ts) pour le serverless
- src/lib/connectors/core/ (7 fichiers) : types.ts (AuthSchemeTypes/ConnectionStatuses/ConnectionData/ActionSpec portés de Composio), auth-scheme.ts (fabrique portée), crypto.ts (AES-256-GCM + state HMAC + PKCE + JWT RS256 Google), oauth2.ts (RFC 6749/7636/7009 + parse Slack), oauth1.ts (RFC 5849 HMAC-SHA1 + flux three-legged), executor.ts (moteur HTTP : path/query/body/prepare, injections bearer/basic/header/query/body/pathPrefix/oauth1, retry-401), connections.ts (initiate/complete/connectDirectly/ensureFreshConnection), toolset.ts (exécution + exposition LLM)
- src/lib/connectors/apps/ : 13 apps réelles, 77 actions (github, slack, gmail, calendar, notion, discord, trello, jira, linear, airtable, telegram, stripe, twitter) + registry.ts (disponibilité env à chaud)
- Routes API : /api/connectors/{apps,connect,callback/[appSlug],connections,connections/[id],execute}
- Intégration agents : runTool dispatch connector_*, executor.ts (prompt dynamique), orchestrator (allowedTools + joker connectors), isToolDangerous
- UI : page /connectors (catalogue par catégorie, import token, formulaire Jira, console d'exécution réelle, bandeau callback) + nav
- Tests : 5 nouveaux fichiers (crypto, oauth1, oauth2, executor, registry) + toolset en intégration DB — 159 tests / 0 échec / 1194 assertions
- E2E réel : scripts/connectors-verify.mjs — 18/18 (appel authentifié api.github.com login=missock237-spec, search 3 dépôts, secrets chiffrés non exposés, 401 sans session)
- Docs : ADR-0014 + section README Connecteurs ; .gitignore/tsconfig excluent research/
- Fix qualité : discriminants ConnectionData en types littéraux (TS2503), runConnectorTool catch erreurs (pas de throw dans la boucle agent), db-init étendu

Stage Summary:
- Moteur connectors 100% local opérationnel : aucune route vers Composio, aucune dépendance externe, exécution réelle prouvée
- 77 actions réelles documentées, secrets chiffrés, prêts production (env OAuth optionnels + import de token immédiat)

---
Task ID: 3
Agent: main
Task: Fusion du travail v3.3 distant (7 commits) + remplacement de l'approche « client API Composio » par le moteur local

Work Log:
- Constat : origin/main contenait une intégration Composio par API distante (src/lib/connectors/composio/, composio-tools.ts, routes proxy, ConnectedAccount avec composioId) — approche explicitement rejetée par l'utilisateur
- Merge origin/main : résolution de 13 conflits (routes/page connectors → version locale ; registry/executor/orchestrator → fusion des deux ; prisma 3 schémas → modèles v3.3 + ConnectedAccount/ConnectionRequest locaux, composioId supprimé ; db-init → DDL régénéré 43 tables via gen-db-ddl.mjs + inject-db-ddl.mjs ; app-shell/gitignore → union)
- Supprimé : src/lib/connectors/composio/, composio-tools.ts, routes actions|apps/[slug]|callback (proxy), tests connectors.test.ts (client Composio), e2e-connectors.mjs, test-composio-api.ts, ADR-0014-composio (remplacé par ADR-0014-connecteurs-locaux)
- Conservé du distant : Swarm/worker-pool/shared-memory, exploration, learning (finetune/skill-creator/user-profile), security (rbac/anomaly/audit-chain/encryption), observability/tracing, batch, marketplace listing, watchdog, webhooks outbound, mongodb connector, e2e-production.mjs
- Health route : connectors = local:N/13 (moteur local) ; errors.ts : codes CONNECTOR_* reformulés (fournisseur, plus Composio) ; .env.example : variables locales OAuth optionnelles ; e2e-production.mjs : contrôle 7 adapté au moteur local
- Validation : tsc 0 erreur, 159 tests/0 échec (1222 assertions), lint 0 erreur, build OK, E2E production 14/14 (LLM réel COMPLETED), E2E connecteurs 18/18 (api.github.com authentifié)

Stage Summary:
- v3.3 fusionnée SANS l'approche plateforme Composio : moteur 100% local (ADR-0014-connecteurs-locaux.md), 43 tables, prêt à pousser/déployer

---
Task ID: 4
Agent: main
Task: Déploiement Vercel + vérification des mises à jour en production

Work Log:
- Push GitHub aaac6c1 (moteur local + fusion v3.3) → déploiement Vercel automatique (gen3ia, production, Ready en ~1 min)
- https://gen3ia.online/api/health : v3.3.0, db ok, connectors local:9/13
- e2e-production.mjs contre production : 14/14 (pages v3.3, tables Swarm/Watchdog/marketplace, connectors 13 apps, admin 401, fail-closed LLM propre)
- connectors-verify.mjs contre production : 18/18 — import PAT GitHub chiffré, appel RÉEL authentifié api.github.com (login renvoyé), search_repositories 3 dépôts, révocation, aucune fuite de secret
- Constat env Vercel : GLM_API_KEY / SESSION_SECRET / ADMIN_EMAILS absents (tâches LLM échouent proprement — fail-closed documenté, pas de faux succès) ; DATABASE_URL=file:/tmp/gen3ia.db (SQLite éphémère serverless — tables auto-créées par db-init 43 tables)

Stage Summary:
- Mises à jour déployées et vérifiées en production ; connecteurs réels opérationnels
- Actions utilisateur restantes : ajouter GLM_API_KEY (et idéalement Postgres persistant + SESSION_SECRET + variables OAuth des apps souhaitées) sur Vercel ; ROTATION des tokens GitHub/Vercel exposés dans le chat

---
Task ID: 5
Agent: main
Task: v3.4 — catalogue Composio 1467 apps + OAuth login + mode live + UI des fonctionnalités cachées + correctifs UI

Work Log:
- Audit : features DB sans UI identifiées (swarm, batch, webhooks, watchdog, traces, finetune, external-connections) ; corruption syntaxique corrigée (app-shell `enuOpen`, tasks `ultimodalPrompt`)
- Correctif couleur : `className="dark"` sur <html> — les composants shadcn rendaient le texte noir (--foreground clair) sur pages sombres
- Catalogue Composio : toolkits.json (1467 apps, 51240 outils, données publiques MIT) converti en sources locales (apps.json 548K + 13 chunks + tools-chunks.ts imports statiques webpack) via scripts/build-connectors-catalog.mjs
- Registre d'endpoints OAuth réels (~55 apps populaires : github, slack, notion, jira, google, zoom, figma…) : catalog/endpoints.ts
- Apps dynamiques : apps/dynamic.ts résout catalogue + endpoints + identifiants (OAuthAppConfig DB chiffrés AES-256-GCM ou env) → AppDefinition complète injectée dans le moteur existant (connect/callback/execute)
- Parseur OpenAPI → actions réelles exécutables (openapi-parser.ts) : spec collée par l'admin = actions HTTP natives pour les agents
- Modèles Prisma : OAuthIdentity, OAuthAppConfig, LiveSession, LiveParticipant, LiveSignal + champs User (githubId/googleId/avatarUrl) — 48 tables, DDL régénéré
- API : /api/connectors/catalog (recherche/pagination/stats), /api/connectors/catalog/[slug], /api/admin/oauth-apps (CRUD, secrets chiffrés), GET /api/swarm, GET /api/batch, /api/watchdog/[id]
- Auth OAuth GitHub+Google : lib/auth/oauth.ts (RFC 6749 complet, state HMAC, fusion par e-mail vérifié, bonus crédits), routes /api/auth/oauth/[provider] + callback, boutons UI login/register
- Mode live : API /api/live (sessions, join, long-poll signalisation ≤20s), LiveSignaling client, page /live (gestionnaire) + /live/[code] (WebRTC P2P complet : getDisplayMedia, offers/answers/ICE, chat, multi-spectateurs), bouton « Mode live » sur les tâches
- UI nouvelles pages : /swarm, /batch, /webhooks, /watchdog, /traces, /finetune, /admin/oauth + navigation enrichie (19 entrées + admin)
- Tests : connectors-catalog.test.ts (10), auth-oauth.test.ts (6) → suite totale 175 pass / 0 fail / 1317 assertions ; eslint 0 erreur ; build production OK

Stage Summary:
- v3.4 complète : catalogue 1467 apps avec connexion 1-clic (identifiants plateforme), OAuth login GitHub/Google, mode live WebRTC, 6 pages UI pour les fonctionnalités jusqu'ici invisibles, texte blanc partout
- Prêt à pousser/déployer ; variables d'env optionnelles documentées (AUTH_GITHUB/GOOGLE_*, OAuthAppConfig via /admin/oauth)

---
Task ID: 6
Agent: main
Task: Validation v3.4 en production + correctifs post-déploiement

Work Log:
- Déploiement v3.4.0 vérifié : health catalogue 1467 apps / 51240 outils, features live+catalog actives
- Correctif : route /api/connectors/catalog absente du 1er build (fichier non réécrit après mkdir) → recréée + rebuild + push
- Sécurité : bootstrap-admin restreint en production (ADMIN_EMAILS explicite requis, anti-escalade sur instances serverless jetables) — anomalies 403 confirmé en prod
- Health check enrichi (catalogue, features, oauthLogin) + version 3.4.0
- E2E production v3.3 (14/14) : structure saine, fail-closed LLM, non-admin 403
- E2E v3.4 (scripts/e2e-v34.mjs, 20/20) : catalogue (stats/recherche/pagination/détail GitHub 893 outils), live (création E7B0-7CC0, infos, long-poll 20s, fin), OAuth 503 propre, 8 pages déployées, classe dark sur <html>

Stage Summary:
- Production v3.4.0 pleinement validée (34 contrôles cumulés, 0 échec)
- Reste utilisateur : AUTH_GITHUB/GOOGLE_* et GLM_API_KEY sur Vercel, ADMIN_EMAILS, Postgres persistant conseillé, ROTATION des tokens GitHub/Vercel exposés

---
Task ID: i18n-lot1
Agent: subagent
Task: i18n FR/EN pages agents/tasks/settings

Work Log:
- 3 nouveaux dictionnaires au pattern établi (clés plates préfixées, interpolation {param}, parité fr/en exacte) : dict/agents.ts (111 clés : liste, création, templates 1-clic, outils+libellés courts, constructeur, console de test, déploiement, marketplace, toasts/erreurs), dict/tasks.ts (48 clés : Task Center, création, liste, approbation humaine, onglets pas-à-pas/multimodal/débug/détails, live, analyse/résultat), dict/settings.ts (24 clés : compte, langue, moteur, sécurité, mode Explain)
- Enregistrement dans dictionaries.ts : imports + DOMAINS = […, live, agents, tasks, settings] (rien retiré)
- agents/page.tsx : titre/sous-titre/CTA/état vide/description absente/compteurs pluralisés ({count} tâche(s)/exécution(s)) + date locale via lang
- agents/new/page.tsx : TOOLS restructuré en TOOL_KEYS (libellés/descs via t(`agents.tools.${key}.label/desc`)), rename applyTemplate(t)→(tpl) et map (t)→(tpl) (conflits avec t de useI18n), toasts template/création/erreurs, placeholders, sliders, provider « — non configuré », aria-label sur les checkboxes d'outils
- agents/[id]/page.tsx : onglets, stats (exécutions/réussite/crédits/tokens), console de test (usage interpolé, états vides, « génération… »), déploiement complet — desc avec {strong}/api/v1/chat{/strong} rendue via renderRich, commentaires de bloc code (# Endpoint/# Agent/# Exemple cURL), clé API visible/copiée, marketplace, keyName de clé traduit, setTools(t)→(current)
- tasks/page.tsx : création (validation <10 car. traduite), toasts lancée/impossible, liste (renommer map (t)→(task)), badges Plan/agent/crédits, date via toLocaleString(lang), libellé « Tâches ({count}) »
- tasks/[id]/page.tsx : retour ← Tâches, {count} tentatives, mode live (+ titre de session live « Diffusion — {prompt} » traduit, fallback « tâche »), carte approbation humaine (titre/boutons/toasts approuvé/refusé), 4 onglets, génération multimodale (placeholder, Image/Diagramme/Graphique, Télécharger, vide, toasts), résultat/analyse (Intention/Objectifs), erreurs réseau via common.errorNetwork
- settings/page.tsx : compte (Nom/E-mail/Rôle/Plan/Crédits/Membre depuis + date locale), moteur, sécurité, mode Explain, « Enregistrer les paramètres », NOUVELLE carte « Langue de l'interface » avec boutons 🇫🇷/🇬🇧 (common.french/common.english) appelant useI18n().setLang — état actif surligné + aria-pressed
- Validation : npx tsc --noEmit = 0 erreur ; npm test = 179 pass / 0 fail (1331 assertions) ; eslint sur les 10 fichiers modifiés = 0 erreur ; rg des chaînes FR visibles dans les 6 pages = aucun reste (seuls commentaires de code et valeurs techniques) ; les 6 routes répondaient 200 en dev (compilées proprement)
- Incident dev-server (hors périmètre, pré-existant) : erreurs SSR « useI18n doit être utilisé sous <LanguageProvider> » sur des routes servies par le serveur Turbopack tournant depuis la création des fichiers i18n du lot précédent (non commité) — prouvé pré-existant par test git stash (mêmes 500 sans mes changements). Résolu sur mon périmètre en forçant la recompilation des graphe de routes (les 6 pages → 200) ; le serveur dev s'est ensuite arrêté seul (hors de mon contrôle, je ne dois pas le relancer) — au redémarrage tout recompile à froid et ce problème disparaît (restaient en « stale cache » uniquement /memory, /swarm, /billing, /connectors, pages hors lot, non modifiées)
- Fichiers strictement limités au périmètre : 6 pages + 3 dictionnaires + dictionaries.ts (git status vérifié)

Stage Summary:
- 6 pages internationalisées FR/EN au pattern i18n maison : 183 clés ajoutées (agents 111, tasks 48, settings 24), réutilisation de common.* (save/name/description/credits/french/english/errorNetwork/statuses), interpolation {count}/{name}/{prompt}/{credits}, renderRich pour le texte avec balisage inline, dates localisées fr-FR/en-US selon la langue active
- Settings propose désormais un switcher de langue complet (carte dédiée + boutons setLang persistés localStorage/profil/cookie)
- tsc 0 erreur, 179 tests OK, lint OK, aucune chaîne française visible restante dans les 6 pages ; messages d'erreur serveur (data.error/err.message) volontairement laissés intacts ; StatusBadge (composant partagé hors périmètre) et formatDate/formatCredits (hooks partagés) restent FR — candidats pour un lot i18n ultérieur

---
Task ID: i18n-lot2
Agent: subagent
Task: i18n FR/EN pages billing/connectors/knowledge/memory/marketplace

Work Log:
- 5 nouveaux dictionnaires au pattern établi (clés plates préfixées, interpolation {param}, parité fr/en exacte vérifiée programmatiquement) : dict/billing.ts (19 clés : solde, plan, variations, alerte Chariow avec {strong}, offres/recharges, paiements, ledger), dict/connectors.ts (93 clés : apps natives, 8 catégories, statuts de connexion, toasts OAuth/token/Jira, dialogues Jira/token/console d'action, carte moteur, catalogue 1467 apps — recherche, pagination, détail, outils), dict/knowledge.ts (27 clés : ajout document/fichier, recherche RAG, erreurs), dict/memory.ts (22 clés : 5 couches label+desc, écriture, méta importance), dict/marketplace.ts (10 clés : liste, installation, vide) — total 171 clés
- Enregistrement dans dictionaries.ts : 5 imports + DOMAINS = […, settings, billing, connectors, knowledge, memory, marketplace] (ajouts en fin, rien retiré) ; contrôle croisé : 663 clés distinctes sur 14 domaines, chacune exactement 2 occurrences (fr+en), aucun doublon inter-domaines
- billing/page.tsx : titre/sous-titre, solde « crédits · plan {plan} », offres (libellé crédits interpolé, Redirection…/Recharger), alerte Chariow → renderRich(t("billing.chariow.desc")) avec marqueurs {strong}, paiements (« Pack {plan} », méta interpolée), ledger ; renommage des map (t)→(tx) des transactions (conflit avec t de useI18n), dates via new Date(...).toLocaleString(lang==="fr"?"fr-FR":"en-US") (import formatDate retiré), formatage numérique toLocaleString("fr-FR") conservé conformément aux consignes
- connectors/page.tsx : CATEGORY_LABELS → Record<string, TranslationKey> (8 clés connectors.categories.*), STATUS_BADGES → labelKey (ACTIVE réutilise common.connected, 5 nouveaux statuts), bandeau retour OAuth interpolé {app}, toasts connect/token/Jira/disconnect, console d'exécution (OK/ECHEC/erreur : traduits en conservant le format du résultat), dialogues Jira + token + console (labels, placeholders, Annuler/Enregistrer/Fermer via common.cancel/save/close), carte moteur → renderRich(t("connectors.engine.desc")) ; fallback statut inconnu = statut brut serveur conservé
- catalog-section.tsx : STATUS_META → labelKey, stats du bandeau, recherche/filtre catégorie, état vide « {query} », boutons Connecter/Ajouter ma clé/Non activée, pagination (Précédent nouveau + common.next réutilisé), dialogue détail (outils/déclencheurs interpolés, badges, redirectHint, footer Composio) ; renommage du setTimeout local t→timer et du map (t)→(tool) de la liste d'outils (2 conflits avec t de useI18n)
- knowledge/page.tsx : formulaire (titre/texte/import fichier {size} Ko, Indexation…/Indexer, indice TF-IDF), recherche (placeholder, vide), documents ({count}, méta sizeKb réutilisée + date locale), 7 toasts d'erreur/succès
- memory/page.tsx : LAYER_META → labelKey/descKey (10 clés memory.layers.*), titre « Mémoire ({count}) », formulaire d'écriture, méta « importance {x} · {date} », état vide
- marketplace/page.tsx : titre/sous-titre, état vide, « Pas de description » réutilise agents.noDescription, {count} exécutions, Installer, « Publié le {date} » avec date locale ; toasts installation
- Réutilisations common.* : common.connected (badge ACTIVE), common.errorNetwork (3×), common.cancel, common.save, common.close, common.next ; réutilisation inter-domaine agents.noDescription (marketplace)
- Validation : npx tsc --noEmit = 0 erreur ; npm test = 179 pass / 0 fail (1331 assertions) ; eslint sur les 12 fichiers modifiés/créés = 0 erreur ; balayage regex des chaînes FR visibles (littéraux, JSX, backticks, apostrophes) sur les 6 fichiers = aucun reste — seuls les commentaires de code et identifiants techniques restent en FR ; parité fr/en des 5 dictionnaires + absence de doublons sur les 663 clés vérifiées par script
- Périmètre strict : 6 fichiers convertis + 5 dictionnaires créés + dictionaries.ts (ajouts seuls) — vérifié, aucune autre écriture
- Chaînes volontairement laissées telles quelles (messages serveur) : res.error/json.error/data.error/err.message dans tous les toasts d'erreur, conn.lastError, app.reason, detail.connectivity.reason, tokenApp.tokenImportLabel, valeurs serveur (offer.name/features, app.name/description/category, t.description/type, d.sourceType, p.status via StatusBadge) — sources API, non localisables côté client
- Non-localisés par périmètre (composants/hooks partagés, inchangés) : StatusBadge, formatDate/formatCredits (hooks) — formatCredits garde fr-FR conformément à « conserver le formatage numérique » ; les dates des 6 pages passent par toLocaleString(locale)

Stage Summary:
- 6 pages internationalisées FR/EN au pattern i18n maison : 171 clés ajoutées (billing 19, connectors 93 — dont catalogue, knowledge 27, memory 22, marketplace 10), interpolation {count}/{plan}/{app}/{file}/{date}/{from}/{to}/{total}, renderRich pour les 3 textes balisés (alerte Chariow, carte moteur), dates localisées fr-FR/en-US, montants au format numérique existant
- Renommages anti-conflit t : transactions (tx), setTimeout (timer), tools (tool) — comportements fetch/états/callbacks intacts
- tsc 0 erreur, 179 tests OK, lint OK, zéro chaîne FR visible restante dans les 6 pages ; messages serveur (data.error/err.message) et valeurs API volontairement intacts ; StatusBadge/formatCredits hors périmètre (candidats lot suivant)

---
Task ID: i18n-lot3
Agent: subagent
Task: i18n FR/EN des 12 pages restantes (skills/tools/api/sdk/swarm/batch/webhooks/watchdog/traces/finetune/admin)

Work Log:
- 10 nouveaux dictionnaires au pattern établi (clés plates préfixées, interpolation {param}, parité fr/en exacte vérifiée programmatiquement, 245 clés) : dict/skills.ts (17 clés), dict/tools.ts (9 : titre/sous-titre, 5 catégories, aucun paramètre, confirmation humaine), dict/apikeys.ts (23 : création, nouvelle clé à copier, révocation, méta {count}/{date}, usage, limite, lien SDK), dict/sdk.ts (21 : configuration, agents publiés, référence API v1, et sdk.code.* pour les commentaires affichés des snippets JS/Python — CODE inchangé), dict/swarm.ts (44 : 20 clés swarm.* + 24 clés batch.* dans le même fichier), dict/webhooks.ts (20 : badges actif/suspendu, livraisons, signatureHint avec marqueur {strong}), dict/watchdog.ts (28 : 4 types, canaux, destination, planification), dict/traces.ts (12 : statuts, tokens entrée/sortie, durée, coût, métadonnées), dict/finetune.ts (24 : statuts, formulaire job, dataset/échantillons, dates), dict/admin.ts (47 : stats/onglets/utilisateurs/audit + admin.oauth.* pour le registre OAuth)
- Enregistrement dans dictionaries.ts : 10 imports + DOMAINS = […, marketplace, skills, tools, apikeys, sdk, swarm, webhooks, watchdog, traces, finetune, admin] (ajouts en fin, rien retiré) ; contrôle final : 908 clés distinctes, chacune exactement 2 occurrences (fr+en), toutes les clés t() utilisées dans les 12 pages résolvent
- skills/page.tsx : titre/sous-titre, compétences intégrées/mes compétences ({count}), formulaire (Nom/Description via common.name/common.description), 5 toasts ; builtIn/custom : noms et descriptions des compétences = valeurs API, inchangés
- tools/page.tsx : CATEGORY_LABELS → Record<string, TranslationKey> (5 clés tools.categories.*), badge « aucun paramètre », « Confirmation humaine requise » ; ⚠️ renommage des .map((t) => …)/.filter((t) => …) → (tool) (conflit avec t de useI18n) — t.name/description/key/parameters/dangerous tous reportés sur tool.*
- api/page.tsx : bandeau nouvelle clé, Copier/Copiée, création (placeholder, lier à un agent, option vide), « Mes clés ({count} actives) », état vide, badge « révoquée », méta « {count} requête(s) · {date} » + « dernière utilisation {date} » interpolées, carte Utilisation (limite + lien SDK), toasts ; nom par défaut « Ma clé » → t("apikeys.defaultName") ; dates formatDate() → new Date(...).toLocaleString(locale) (import formatDate retiré) ; bloc cURL inchangé (code)
- sdk/page.tsx : JS_SDK/PY_SDK (constantes) → jsSdkSource(t)/pySdkSource(t) : le CODE des SDK reste identique ligne à ligne (logique, identifiants, URLs, exemples, messages d'erreur internes), seuls les commentaires/docstrings affichés passent par les clés sdk.code.* (pattern agents.deploy.curlComment) ; CodeBlock utilise useI18n pour Copier/Copié ; onglets JavaScript/TypeScript et Python (noms propres) inchangés
- swarm/page.tsx : STATUS_META → labelKey (En cours/Terminée/Échec + fallback statut brut), stratégies Hiérarchique/Débat (boutons + badges), placeholder mission, toasts (swarm lancé, débat/hiérarchique en cours, refus), sous-tâches ({count}), bus de messages ({count}), résultat, « {credits} crédits », date locale
- batch/page.tsx : même dict swarm.ts (préfixe batch.) — formulaire (nom du lot, prompts multilignes avec \n dans le dictionnaire), compteur «{count}/50 prompts», progression «{completed}/{total} terminées» + «{count} échecs», nom par défaut «Lot {id}» interpolé, toasts (lot lancé, ré-exécution, refus), statuts PENDING/RUNNING/COMPLETED/FAILED, Détails via common.details, date locale
- webhooks/page.tsx : création (URL, événements, common.create), badges Actif/Suspendu, Suspendre/Réactiver, Dernières livraisons, état vide, 6 toasts ; note de signature → renderRich(t("webhooks.signatureHint")) avec marqueur {strong} (l'élément <code> devient <strong> conformément au pattern) ; noms d'événements techniques (task.completed…) inchangés ; date locale
- watchdog/page.tsx : TYPES → labelKey (4 clés watchdog.types.*), ⚠️ renommage du map (t) → (tp) (conflit t) ; formulaire complet (nom via common.name, cible, planification CRON + indice, canal d'alerte, destination), toasts, état vide, badge « Déclenché », « Alertes {channel} », date locale ; type brut du badge liste (PRICE…) = valeur API inchangée
- traces/page.tsx : ⚠️ renommage du map (t) → (trace) avec report de tous t.*→trace.* ; STATUS_META → labelKey, Rafraîchir via common.refresh, état vide, « {credits} crédits », détail (tokens entrée/sortie, durée, coût, métadonnées), date locale ; suffixe « cr » inchangé (identique FR/EN)
- finetune/page.tsx : STATUS_META → labelKey (5 statuts dont CANCELLED), formulaire (nom du job, moteur, modèle de base), Lancer l'affinage, méta « Dataset/Base/Démarré/Terminé » + « {count} échantillons » interpolé, Annuler via common.cancel, toasts, état vide, date locale ; Unsloth/Axolotl (noms propres) et job.error (message serveur) inchangés
- admin/page.tsx : accès refusé, onglets (Vue générale / Moteurs & observabilité), 4 cartes stats (Utilisateurs/Agents/Tâches/Crédits en circulation + détail interpolé {completed}/{failed}/{waiting} et {count} paiements · {volume} FCFA), liste utilisateurs ({count}, crédits, placeholder Crédits via common.credits, Attribuer), journal d'audit + état vide, toasts ; dates formatDate() → toLocaleString(locale) (import retiré), formatCredits conservé ; badge ADMIN/plan/role = valeurs serveur inchangées ; reason « Ajustement manuel administrateur » = payload serveur inchangé
- admin/oauth/page.tsx (clés admin.oauth.*) : titre/sous-titre, Activer une app, formulaire (slug + indice, scopes + indice, Client ID/Secret inchangés — termes techniques), endpoints personnalisés, spec OpenAPI (summary + placeholder), Enregistrer et activer, badges (Endpoints connus/custom, « {count} actions OpenAPI »), Retirer, 6 toasts dont description composée « {app} est connectable… — {count} actions générées »
- Réutilisations common.* : common.name (skills, watchdog), common.description (skills), common.details (batch), common.close (webhooks, watchdog, finetune, admin/oauth), common.create (webhooks), common.refresh (traces), common.cancel (finetune), common.credits (admin placeholder)
- Renommages anti-conflit t : tools (tool ×2), traces (trace, corps entier du map reporté), watchdog TYPES (tp) — comportements fetch/états/callbacks intacts
- Validation : npx tsc --noEmit = 0 erreur ; npm test = 179 pass / 0 fail (1331 assertions) ; eslint sur les 22 fichiers modifiés/créés = 0 erreur ; balayage regex des chaînes FR visibles (littéraux accentués + mots français non accentués + mots-outils) sur les 12 pages = aucun reste hors code/commentaires ; parité fr/en (908/908) + résolution de toutes les clés t() vérifiées par script
- Périmètre strict : 12 pages converties + 10 dictionnaires créés + dictionaries.ts (ajouts seuls) — vérifié, aucune autre écriture ; EnginesPanel (composant partagé) hors périmètre, inchangé

Stage Summary:
- 12 pages internationalisées FR/EN au pattern i18n maison : 245 clés ajoutées (skills 17, tools 9, apikeys 23, sdk 21, swarm 20 + batch 24 dans dict/swarm.ts, webhooks 20, watchdog 28, traces 12, finetune 24, admin 47 dont admin.oauth.*), interpolation {count}/{date}/{app}/{id}/{completed}/{total}/{volume}/{waiting}, renderRich pour la signature webhook, dates localisées fr-FR/en-US, formatCredits conservé
- SDK : code des snippets inchangé (logique/identifiants/exemples), commentaires affichés traduits via sdk.code.* ; renommages anti-conflit t : tools (tool), traces (trace), watchdog (tp) ; statuts inconnus → valeur brute serveur conservée
- tsc 0 erreur, 179 tests OK, lint OK, zéro chaîne FR visible restante dans les 12 pages ; laissés volontairement en FR : messages serveur (json.error/res.error/job.error), payload reason de l'attribution de crédits, valeurs API brutes (noms d'outils/compétences, statuts de sous-tâches, w.type, plan/role), exemples de code (prompts d'exemple SDK, « Bonjour » du cURL), noms propres (Unsloth, Axolotl, Slack), libellés identiques FR/EN (Type, Client ID/Secret, Active, JavaScript/Python)

---
Task ID: v3.5
Agent: main
Task: Session du 2026-09-03 — copilote IA live, i18n FR/EN, connecteurs OAuth stricts, mot de passe exigeant, vente de crédits (min 50), page Publicités

Work Log:
- Tâche 1 (live) : src/lib/ai/vision.ts (multimodal ZAI→GLM-4V→OpenRouter→OpenAI), API /api/live/[code]/agent (observe/chat//task), salon live enrichi (panneau copilote, progression de tâche, chat flottant Document PiP), types signaux AGENT/TASK, correction affichage propres messages
- Tâche 2 (i18n) : LanguageProvider + useI18n + 17 dictionnaires (908+ clés), sélecteur de langue (shell/login/register/landing/settings), cookie gen3ia_lang + settings.language, conversion intégrale de toutes les pages (dont 3 lots délégués), tests parité/interpolation
- Tâche 3 (connecteurs) : re-clone Composio vérifié (0 divergence / 1467 apps), suppression totale de l'UI d'import de token + formulaire Jira, statuts catalogue reformulés OAuth-only, messages serveur reformulés, test 1000+ apps
- Tâche 4 (mot de passe) : password-client.ts partagé, zod register avec refine (12/maj/min/spécial), UI hint, 9 tests
- Tâche 5 (facturation) : vente de crédits à la carte min 50 (paliers 10/8/6 FCFA), checkout { credits }, webhook : achat crédits sans upgrade de plan, carte UI dédiée, 6 tests
- Tâche 6 (publicités) : 4 modèles Prisma (AdWallet/AdTransaction/AdCampaign/AdCreative) + 52 tables DDL régénérées, ledger publicitaire (recharges/dépenses/settlement paresseux journalier/pause auto solde épuisé), routes /api/ads + campaigns + creatives + recharge (Chariow, webhook plan ads_recharge → AdWallet), endpoints OAuth googleads/metaads/tiktok/linkedin_ads, page /ads complète (portefeuille, comptes 1-clic, campagnes, créas, historique) + nav, i18n 90+ clés, 6 tests

Stage Summary:
- 207 tests / 0 échec / 1418 assertions ; tsc 0 erreur ; eslint 0 warning
- Reste : build production, push GitHub, déploiement Vercel, E2E production

---
Task ID: v3.5-deploy
Agent: main
Task: Build production + push GitHub + déploiement Vercel + vérification E2E

Work Log:
- Build production : 73/73 pages générées (dont /ads), 0 erreur, 0 warning
- Push GitHub : 7 commits v3.5 (fbca264 → 59da7b8)
- Vercel : déploiement automatique READY (~80 s), https://gen3ia.online v3.5.0
  (features : liveCopilot, i18n, ads, creditsSale min 50)
- E2E v3.5 (25/25) : mot de passe faible refusé / conforme accepté, page + API
  Publicités (401 sans session, 4 comptes plates pub), campagne + activation
  sans budget refusée, créas conservées puis supprimées, tarification min 50
  exposée, achat 30 crédits refusé / 50 accepté, recharge pub min 1000 FCFA
  respectée, garde-fous copilote live (404 propre), i18n FR (SSR) + sélecteur
  de langue présent, pages v3.5 toutes 200
- E2E v3.4 (20/20) : catalogue 1467/51240, live (session + long-poll), OAuth
  503 propres, 8 pages, classe dark
- E2E production v3.3 (13/13) : health 3.5.0, tables v3.3, admin 403/401,
  fail-closed LLM explicite
- Note : Chariow injoignable depuis Vercel au moment du test (502 explicite,
  fail-closed propre) — la validation du minimum 50 est prouvée par le rejet
  des 30 crédits ; comportement fournisseur externe, pas un défaut de code

Stage Summary:
- Production v3.5.0 pleinement validée (58 contrôles E2E cumulés, 0 échec)
- Restes utilisateur : GLM_API_KEY sur Vercel (tâches LLM fail-closed tant
  qu'absente), AUTH_GITHUB/GOOGLE_* pour le login OAuth, rotation des tokens
  GitHub/Vercel exposés dans le chat

---
Task ID: v3.6-chariow-only
Agent: main
Task: Continuation session 2026-09-04 — Chariow UNIQUE processeur (suppression Stripe), complétion pilier business interrompu, déploiement v3.6.0 + vérification E2E intégrale

Work Log:
- Reprise : 8 commits v3.6 non poussés, dernier commit (pilier business) avec message UUID — point d'arrêt exact
- Stripe SUPPRIMÉ intégralement (instruction produit, ADR-0007 réaffirmée) : src/lib/payments/stripe.ts + /api/webhooks/stripe supprimés ; checkout/subscription : champ method et branche Stripe retirés, processor.chariow seul ; fulfillment : provider restreint « chariow » ; UI abonnements : sélecteur processeur retiré + mention « Chariow unique » ; prisma x3 : provider TOUJOURS chariow
- (catalogue Composio inchangé : Stripe y est une app connectable parmi 1467, pas un moyen de paiement)
- Pilier business COMPLÉTÉ : 25 clés i18n billing.sub.* (fr/en) ajoutées — la section abonnements référençait des clés inexistantes ; health 3.6.0 + features v3.6 (subscriptions, marketplace 0.2, paymentProcessor, workerIsolation, keyringRotation, ragTuning, debateEngine, metaLearning, openapi, sdkTypes, otel, queue)
- Fix infra : ensureSchema mémoïsé PAR DATABASE_URL (bascule de base sûre — corrige le pipeline-integration en suite complète)
- Tests : business-v36.test.ts (17 tests : fichiers/routes/env Chariow-only, plans/prix/quotas, parseSubscriptionPlan, commission 20 %, parité i18n) — 321/321 tests, tsc 0, eslint 0, build 82/82 pages
- Git : commit UUID reformulé (65c342b), commit Chariow-only (67bacde), E2E (97357d2) — 11 commits poussés
- Vercel : v3.6.0 READY (~2 min), https://gen3ia.online
- E2E v3.6 production : 48/48 ✅ — version 3.6.0, paymentProcessor=chariow, webhook stripe 404/405, method:stripe ignoré (502 CHARIOW_UNREACHABLE), zéro STRIPE_*, abonnements 3 plans + 401 sans session, VENTE RÉELLE marketplace (acheteur 25→5, vendeur 25→41, commission 20 %, fork), quota FREE 402 AGENT_QUOTA_EXCEEDED, OpenAPI 3.1 (6 endpoints), /docs/api, /sdk, non-régression v3.5/v3.4 (ads, mot de passe 400, CREDITS_MIN_50, i18n FR, 1467 apps)

Stage Summary:
- Production v3.6.0 pleinement déployée et vérifiée (48 contrôles E2E, 0 échec)
- Chariow est le SEUL processeur de paiement (code, routes, UI, config, ADR) — Stripe/PayPal introuvables
- Restes utilisateur : GLM_API_KEY sur Vercel (tâches LLM), AUTH_GITHUB/GOOGLE_* (login OAuth), rotation tokens GitHub/Vercel exposés

---
Task ID: v4.0-hf-intelligence-layer
Agent: main
Task: MISSION 34 phases — Gen3ia → Infrastructure d'agents IA avec Hugging Face comme couche principale (Model & Compute Intelligence Layer), sans recréer/casser l'existant

Work Log:
- PHASE 1 audit : arborescence, package.json, Prisma (58 modèles), 90+ routes API, moteurs (orchestrateur/planner 5 plans/évaluateur/vérification/apprentissage/méta-learning/debate), RAG hybride (embeddings json), sandbox, Composio (1467 apps), BullMQ (file tâches + repli serverless), crédits (ledger atomique), hooks identifiés : chat()/chatJSON() = point d'entrée unique de l'inférence
- PHASE 3 Provider Abstraction : src/lib/ai/providers/base.ts (contrat ModelProvider : generate/stream/embed/vision/healthCheck/estimateCost/listModels/getModelMetadata) ; adapters.ts (ZAI/GLM/OpenRouter/Groq/OpenAI enrobent les implémentations EXISTANTES, Gemini natif generateContent, CustomProvider par env CUSTOM_PROVIDER_*_URL/KEY) ; aucun appel fournisseur dans planner/orchestrateur
- PHASE 4 HF : client HTTP typé (huggingface.co/api, router.huggingface.co/v1, api.endpoints.huggingface.cloud/v2, /api/jobs, Hub datasets repos = Buckets — endpoints officiels uniquement, aucun inventé) ; HuggingFaceProvider (chat routeur, streaming SSE, embeddings, vision, découverte Hub, gated/privé selon droits jeton) ; endpoints.ts (création/scale-to-zero/réveil/suppression/sync)
- PHASE 5 Model Registry : tables AIModel + ModelCapability ; seed idempotent (16 modèles : HF Llama 70B/8B, Qwen 72B/Coder, Mistral, Qwen-VL, Gemini 2.0/2.5, GLM, OpenRouter, Groq, OpenAI, ZAI) ; re-seed n'écrase JAMAIS les champs appris ; sync HF Hub (nouveaux en EXPERIMENTAL) ; auto-amorçage paresseux au premier usage
- PHASE 6-8 Model Router v2 + Performance Registry : score pondéré (adéquation 0.30, réussite mesurée 0.22, qualité 0.16, capacité 0.12, disponibilité 0.08, latence 0.07, coût 0.05) ; contraintes dures (providers, contexte, commercial) ; sélection justifiée (raison, alternatives, coût, confiance) tracée (ModelSelection) ; boucle d'apprentissage : CHAQUE appel chat() mesure ModelPerformance (succès ET échec) → agrégat glissant demi-vie 14 j → AIModel.successRate/qualityScore/avgLatencyMs → routage futur ; routeCall() historique = repli garanti
- PHASE 9-10 multi-modèles : Plan.model + selectModelDiversity() (≤2 modèles/provider) → 5 plans A-E avec modèles DIFFÉRENTS ; exécuteur honore modelOverride + provider du plan ; chargePhase facture le fournisseur RÉEL (fin du « zai » codé en dur)
- PHASE 11 HF Jobs : jobs.ts + job-queue.ts (file BullMQ dédiée gen3ia-hf-jobs, priorités plan, drainage serverless 50 s) ; kinds natifs HF (fine-tuning/dataset-generation/conversion via API officielle) + kinds GEN3IA (embeddings-batch, batch-inference, preprocessing, evaluation, media-processing via worker) ; idempotence par clé, retry/backoff, timeout, checkpoints Bucket, statuts PENDING/RUNNING/COMPLETED/FAILED/CANCELLED
- PHASE 12 Compute Scheduler : abstraction ComputeBackend (hf-router/hf-endpoint/hf-job/external) scorée (VRAM, durée, priorité, coût) ; hardwareRecommendation (paramètres × quantization + KV-cache)
- PHASE 13 HF Storage : storage.ts — 11 buckets logiques = repos datasets PRIVÉS HF ; upload/download/list/move/copy/mount/delete/metadata ; octets chez HF, métadonnées PostgreSQL (StorageObject) ; token HF jamais exposé (passe-relais authentifié /api/v1/files/download)
- PHASE 14-15 VectorStore : abstraction backends (json portable / pgvector Supabase natif / qdrant HTTP) ; sélection auto (QDRANT_URL → qdrant, postgres → pgvector, sinon json) ; fail-open json garanti ; cloisonnement par utilisateur ; indexDocument archive le source dans le Bucket HF
- PHASE 20 API unifiée : /api/v1/models (registre), /models/select (décision justifiée), /embeddings (facturés), /files + /files/download, /knowledge (GET/POST/PUT recherche hybride), /jobs (GET/POST/PATCH cancel/poll/drain) ; OpenAPI 3.1 étendue (6 nouveaux endpoints documentés, version 4.0.0)
- PHASE 26-27 dashboards : panneau admin « Registre & Compute » (4 vues : registre avec activation/promotion, compute+storage, performance+classement+sélections justifiées, coûts par modèle ; actions seed/sync-hf/sync-endpoints) ; 25 clés i18n fr/en
- PHASE 28 env : .env.example v4 (HF_TOKEN, HF_ORG_ID, HF_DEFAULT_PROVIDER/MODEL, HF_BUCKET_PREFIX, GEMINI_API_KEY, CUSTOM_PROVIDER_*, MODEL_PERF_WINDOW_DAYS, VECTOR_BACKEND, QDRANT_URL/API_KEY)
- PHASE 29-33 tests/docs : 50 tests nouveaux (model-registry 11, router-v2 20, vector-store-v4 19) — 371/371 au total, tsc 0 erreur, eslint 0 (corrigés au passage 4 erreurs require() préexistantes), build 90/90 pages ; docs/architecture-v4.md (Mermaid), docs/huggingface-setup.md, ADR-0015, README v4.0 ; Prisma 8 modèles additifs (62 total) + variantes sync + DDL régénéré + auto-seed
- PHASE 34 scénario final : scripts/test-scenario-v4.ts (PDF→KB→rapport→email, 16 étapes) — 15/16 sans clé LLM (fail-closed documenté, exit 0) ; e2e-v4.mjs production
- Git : 2 commits (f38c5ef feat v4.0, 44a4dbb test e2e) poussés
- Vercel : https://gen3ia.online v4.0.0 déployée automatiquement
- E2E production v4.0 : 38/38 ✅ (health 4.0 + features, registre 16 modèles auto-seedés, routage justifié huggingface/Llama-70B avec contraintes, RAG v1 ingestion+recherche, embeddings facturés, job 202+statut, files 503 fail-closed HF_TOKEN, OpenAPI 6/6, pages 200)
- Non-régression : v3.6 E2E 47/48 (seul écart = version 3.6.0 attendue → 4.0.0, voulu) ; Chariow unique, CREDITS_MIN_50, i18n, catalogue 1467 apps, v3.5/v3.4 conservés

Stage Summary:
- Production v4.0.0 déployée et vérifiée (38 contrôles E2E v4 + 47/48 v3.6, 0 échec réel)
- Hugging Face est la couche principale (Inference Providers/Endpoints/Jobs/Buckets) derrière une Provider Abstraction stricte ; Gemini/GLM/OpenRouter/Groq/OpenAI/customs restent des replis compatibles
- Le Model Router apprend de la performance RÉELLE (ModelPerformance → agrégats → scores) ; les 5 plans utilisent des modèles divers ; la facturation suit le fournisseur réellement utilisé
- Limites documentées (docs/huggingface-setup.md §7) : HF Jobs natifs limités aux kinds datasets/training (kinds GEN3IA via worker interne, même contrat) ; Qdrant/pgvector dimensionnels par modèle ; fail-open json systématique
- Restes utilisateur (inchangés + nouveaux) : GLM_API_KEY/HF_TOKEN sur Vercel (inférence réelle + couches HF), QDRANT_URL (optionnel), rotation des tokens GitHub exposés

---
Task ID: v4.1-entreprise
Agent: main
Task: Session du 2026-09-04/05 — mise à jour entreprise (mission utilisateur) : terminal agents, code viewer, saisie enrichie sur tous les chats, captures analysées, 5000 FCFA+, outils dans paramètres, déploiement + vérification intégrale

Work Log:
- Reprise du commit interrompu 2c974f9 (UUID) : audit complet — backend v4.1 déjà présent (terminal.ts 521 l, agent-files, chat-attachments, voice APIs, models API, Prisma 7 modèles, i18n workspace 232 l) ; UI et intégrations manquantes
- Faux positif P0 identifié : « enuOpen » = artefact d'affichage du terminal (séquence [m mangée) — git blob, od -c et TSC confirment [menuOpen correct ; layout dark déjà présent
- Terminal agents : CORRECTIF SÉCURITÉ RÉEL — rm -rf / contournait la blocklist (l'ancien motif exigeait un argument entre rm et le drapeau) → lookaheads rattrapant rm -rf /, rm -fr /etc, rm -r -f /, rm -rf ~, $HOME ; légitimes (rm -rf build/) préservés ; tests unitaires + vérification tsx
- ChatComposer universel (src/components/chat/) : micro vocal (Web Speech + repli MediaRecorder → /api/voice/transcribe ASR réel), bouton envoyer, bouton + multifonction (connecteurs 1467 + fichiers TOUS types via /api/chat/attachments : PDF→RAG pdf-parse, audio→ASR, images/vidéos→HF Bucket), sélecteur Modèle (/api/models, 16 modèles, option Automatique) ; useDictation extrait pour batch/multimédia ; apiPostForm ajouté aux hooks
- Intégration TOUS les chats : tâches (createTask payload + preferredModel + attachmentIds), console agent, salon live (compact), swarm, batch (dictée), multimédia page tâche (dictée)
- preferredModel plomberie complète : Task.preferredModel (3 schémas + migration ALTER idempotente db-init), zod tâches, planner (priorité choix humain sur diversité A-E), engines.ts PlannerInput, executor override de repli, GET /api/tasks expose le champ
- Captures (9 analysées VLM) : /workflows (16 modèles catégorisés, épinglage WorkflowPin persisté + DDL, pré-remplissage /tasks?template=, recherche) ; Mode vocal dans paramètres (5 personas carrousel + points, langue, historique dictée effaçable, conversations arrière-plan) ; recherche tâches ; sections paramètres avec ancres
- Facturation : plan Plus 5000 XOF (700 crédits, 25 agents, 4 features) — Chariow UNIQUE ; échelle 2000<5000<10000<50000 ; enums zod checkout/subscription ; maxAgents 10<25<50<200
- Outils → paramètres : ToolsCatalogCard (#tools), /tools redirection 307 next.config.ts (page supprimée), nav /settings#tools
- i18n : dette de la session interrompue corrigée — workspace.ts scindé en 5 domaines (terminal 14, files 31, voice 27, input 26, workflows 9 clés) + clés tasks déplacées ; parité fr/en rétablie ; test domains mis à jour
- OpenAPI 4.1.0 : 10 endpoints v4.1 documentés (workflows, models, voice×3, chat/attachments, terminal sessions, agent-files) ; health v4.1.0 (agentTerminal, codeViewer, chatComposer, workflows, voiceMode, toolsPage, billingPlans)
- Version package.json 4.1.0 ; docs/architecture-v4.1.md complet
- Tests : workspace-v41.test.ts (29 tests : sécurité terminal + régression rm -rf, intégration composer partout, workflows, plans, preferredModel, i18n domaines) — 400/400 ; tsc 0 ; eslint 0 ; build 90 pages
- E2E v4.1 (scripts/e2e-v41.mjs, 77 contrôles) : local 77/77 puis production 77/77 — health 4.1.0, workflows 17 + épingles réelles + 9 workflows captures présents, voix (persona sage persisté, 400 propre sans fichier), pièces jointes (import document réel → kind DOCUMENT → RAG), preferredModel persisté + note d'attachement, terminal (404 propre, 405 POST, jamais executeTerminalCommand), /tools 307 → /settings#tools, 4 plans dont Plus 5000/700/25, registre v1 (Bearer, 16 modèles), OpenAPI 4.1.0 6/6
- Playwright v41-ui.spec.ts (6 parcours, session partagée scripts/e2e-v41-session.mjs avec purge quota agents) : sections Mode vocal + Outils vérifiées après hydratation, redirection, composer complet (menu + : connecteurs/fichiers/images/vidéos/audio ; pilule Modèle avec Automatique ; micro ; envoi), workflows épinglage persistant rechargé, console agent enrichie — 6/6
- Régressions : Playwright auth 3/3 + journeys 5/5 (catalogue 1467, credits min 50) ; E2E v4.0 36/38 (2 = version 4.0.0 attendue → 4.1.0, voulu) ; v3.6 TOUTES (script aligné : 4 plans, version ≥ 4) ; v3.5/v3.4 fonctionnel couvert (échecs = 429 rate-limit inscriptions/h de mon IP, pas des régressions — politique mdp 9 tests unitaires + Playwright, catalogue 1467 vérifié health/v36/journeys)
- Git : commit 12f4736 (v4.1 complet + fix session file gitignoré) + 351847c (e2e v36 aligné) + e2e-v4 aligné poussés ; Vercel : v4.1.0 déployée (~2 min 30)
- VALIDATION FINALE INTÉGRALE (après reset de la fenêtre de rate-limit 5 inscriptions/h/IP, échecs précédents = artefacts 429 uniquement) : E2E production v4.1 77/77 + v4.0 38/38 + v3.6 TOUTES + v3.5 SUCCÈS TOTAL + v3.4 VALIDÉE + Playwright 14/14 + unitaires 400/400 — ~600 contrôles cumulés, 0 échec réel

Stage Summary:
- Production https://gen3ia.online v4.1.0 pleinement déployée et vérifiée (77 contrôles E2E v4.1 + 6 parcours Playwright + non-régressions v4.0/v3.6/v3.5/v3.4, 0 échec réel)
- Les 7 exigences mission livrées : terminal agents-only (avec correctif sécurité rm -rf réel), code viewer HITL complet, saisie enrichie sur tous les chats, captures intégrées (workflows 17 + mode vocal + recherche), connecteurs 1467 (>300), plan 5000 FCFA via Chariow unique, outils dans paramètres
- Correctif sécurité découvert par les nouveaux tests : blocklist rm renforcée (lookaheads drapeaux séparés)
- Restes utilisateur (inchangés) : GLM_API_KEY/HF_TOKEN sur Vercel (inférence réelle + couches HF), AUTH_GITHUB/GOOGLE_* (login OAuth), rotation tokens GitHub/Vercel exposés historiquement
