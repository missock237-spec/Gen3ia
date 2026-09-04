# GEN3IA v4.1 — Mise à jour entreprise

> Session du 2026-09-04/05. Cette version livre les fonctionnalités demandées
> (terminal agents, visualiseur de code, barre de saisie enrichie, captures)
> sans rien régénérer ni simplifier : chaque brique existante est réutilisée
> et étendue (principe EXISTANT > RÉUTILISER > AMÉLIORER > ÉTENDRE > CRÉER).

## 1. Terminal intégré — réservé aux agents IA

**Objectif** : un terminal réel, persistant et observable pour les agents du
projet, jamais exposé aux utilisateurs finaux.

- **Exécution** : uniquement via le dispatch d'outils du moteur d'agents
  (`runTool("terminal", …)` — `src/lib/tools/terminal.ts`). AUCUNE route HTTP
  d'exécution n'existe ; les routes `/api/terminal/sessions/[id]` sont en
  lecture/clôture seulement (GET/PATCH).
- **Sécurité (défense en profondeur)** :
  - environnement épuré (PATH/HOME/LANG/TZ — aucun secret `process.env`) ;
  - sandbox de session (`os.tmpdir()/gen3ia-terminal-<unique>`) ;
  - timeout 30 s (120 s max) avec kill du groupe de processus ;
  - sortie plafonnée 64 Ko (troncation marquée) ;
  - blocklist de commandes destructrices — **correctif v4.1** : `rm -rf /`
    contournait l'ancien motif (exigence d'un argument entre `rm` et le
    drapeau) ; les lookaheads rattrapent aussi `rm -r -f /`, `rm -fr /etc`,
    `rm -rf ~`, `rm -rf $HOME` ;
  - HITL : outil `dangerous` → approbation humaine selon préférences ;
  - audit : chaque commande persistée (sortie, durée, code retour) +
    `appendAuditEntry`.
- **Vue humaine** : onglet « Terminal » de la page tâche
  (`AgentTerminal`) — lecture seule, sessions multiples, clôture manuelle.
- **Statistiques/purge** : `terminalStats()`, `cleanupTerminalSandboxes(72 h)`.

## 2. Visualiseur de code (vibe coder / développeur)

**Objectif** : voir, décider et modifier le code créé par les agents.

- Outil `write_file` : l'agent enregistre ses fichiers dans l'espace projet
  (`src/lib/engines/agent-files.ts`) avec versionnage.
- Onglet « Code » de la page tâche (`CodeViewer`) :
  - explorateur arborescent + recherche ;
  - coloration syntaxique maison (JS/TS/Python/SQL/Bash/JSON) ;
  - **décision** : Approuver / Rejeter (statut PROPOSED→APPROVED/REJECTED) ;
  - **modification** : édition inline → nouvelle version (source HUMAN) ;
  - **historique** complet + comparaison de versions.
- API : `/api/agent-files` (GET liste) et `/api/agent-files/[id]`
  (GET détail/versions, PATCH décision/édition, DELETE).

## 3. Barre de saisie enrichie — TOUS les chats

**Objectif** : micro vocal, bouton d'envoi, bouton multifonction
(connecteurs + import de TOUS types de fichiers) sur chaque chat.

- **Composant universel** `ChatComposer` (`src/components/chat/`) :
  - **micro vocal** : Web Speech API (navigateur) avec repli MediaRecorder →
    `/api/voice/transcribe` (ASR réel z-ai-web-dev-sdk, persisté dans
    l'historique de dictée selon préférences) ;
  - **bouton envoyer** explicite + touche Entrée (Shift+Entrée = nouvelle ligne) ;
  - **bouton « + » multifonction** : accès direct aux **connecteurs
    (1467 apps — exigence ≥ 300 satisfaite)** et import **tous types** :
    documents (PDF→texte→RAG via pdf-parse), images, vidéos (HF Bucket ou
    base ≤ 2 Mo), audio (transcription ASR réelle) ;
  - **sélecteur « Modèle »** : registre réel `/api/models` (16 modèles,
    qualité apprise) avec option « Automatique » (Model Router intelligent).
- **Intégrations** : page tâches (création avec `preferredModel` +
  `attachmentIds`), console de test d'agent, salon live (compact),
  swarm, batch (hook `useDictation` pour la liste multi-prompts),
  générateur multimédia de la page tâche.
- **Plomberie preferredModel** : `Task.preferredModel` (schéma + migration
  idempotente) → planner (priorité sur la diversité A-E, choix explicite
  humain) → executor (modelOverride de repli) — facturation au fournisseur réel.

## 4. Captures analysées → fonctionnalités intégrées

| Capture | Fonctionnalité livrée |
|---------|----------------------|
| 1 (Paramètres) | Sections paramètres avec ancres navigation (compte, vocal, outils, moteur, sécurité) |
| 2-4 (workflows runable) | **Bibliothèque `/workflows`** : 16 modèles catégorisés (Carrière, Marketing, Ingénierie, Recherche, Rédaction, Données), épinglage persisté (`WorkflowPin`), recherche, « Utiliser » → pré-remplissage de la barre de saisie (`/tasks?template=`) — les workflows des captures (resume editor, cover letter, interview prep, scholarship finder, alumni finder, brand story, eng weekly review, PR digest, research→deck) sont tous présents |
| 5 (barre ChatGPT) | ChatComposer : « + », pilule Modèle, micro, envoi |
| 6 (Projets) | Recherche des tâches/projets dans le Task Center |
| 7 (Remote) | (Connexions distantes : hors périmètre sécurité — les sessions live couvrent le pilotage à distance) |
| 8-9 (Mode vocal) | **Section « Mode vocal » des paramètres** : 5 personas (Maple, Ember, Sage, Coral, Onyx) avec carrousel + points de pagination, langue (auto/fr/en), historique de dictée (effaçable), conversations en arrière-plan, enregistrement des dictées |

## 5. Abonnement 5000 FCFA et plus

- Nouveau plan **Plus — 5000 XOF/mois** : 700 crédits, 25 agents, mode vocal
  et pièces jointes multimédia, marketplace avancée, support 48 h.
- Échelle complète : Starter 2000 < **Plus 5000** < Pro 10000 < Business 50000.
- **Chariow reste l'UNIQUE processeur** (ADR-0007) : `sub:plus:monthly|yearly`
  passe par le même checkout/webhook Chariow ; plan de compte → PRO.
- Quotas par palier : 10 < 25 < 50 < 200 agents.

## 6. Page outils → paramètres

- Le catalogue d'outils (registre réel `/api/tools`) est désormais une
  **section des paramètres** (`ToolsCatalogCard`, ancre `#tools`).
- `/tools` redirige en serveur (next.config.ts, HTTP 307) vers `/settings#tools`.
- Navigation mise à jour ; accès direct aux connecteurs depuis la section.

## 7. Validation

- **Unitaires** : 400/400 (29 nouveaux tests `workspace-v41.test.ts` :
  sécurité terminal + correctif rm -rf, intégration composer partout,
  workflows, i18n par domaine, plans, preferredModel).
- **i18n** : refactor du dictionnaire `workspace.ts` en 5 fichiers de domaine
  (terminal, files, voice, input, workflows) — la parité fr/en et la règle
  « un fichier = un domaine » sont rétablies (dette de la session interrompue).
- **Build production** : 90 pages, 0 erreur, 0 warning ESLint.
- **E2E HTTP v4.1** (production) : 77 contrôles — health 4.1.0, workflows +
  épingles réelles, mode vocal (persona persisté), pièces jointes (import
  document réel → RAG), preferredModel persisté, terminal lecture seule,
  redirection /tools, 4 plans dont Plus 5000, registre v1, OpenAPI 4.1.0.
- **Playwright v4.1** : 6 parcours UI (sections paramètres, redirection,
  composer complet, workflows épinglage persistant, console agent).
- **Régressions** : auth 3/3, journeys 5/5 (catalogue 1467, credits min 50),
  v4.0/v3.6/v3.5 E2E rejoués en production.

## 8. Schéma de base (non destructif)

- `Task.preferredModel` (ALTER idempotent) ;
- `WorkflowPin` (unique userId+workflowKey) ;
- modèles de la session interrompue confirmés : TerminalSession,
  TerminalCommand, AgentFile, AgentFileVersion, VoiceSettings,
  DictationEntry, ChatAttachment (DDL `ensureSchema`).
