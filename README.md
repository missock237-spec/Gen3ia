# Gen3ia — AI Automation Ecosystem

**L'OS de l'automatisation intelligente** — Accessible · Communautaire · Flexible

[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=next.js)](https://nextjs.org/)
[![Prisma](https://img.shields.io/badge/Prisma-7-2D3748?logo=prisma)](https://www.prisma.io/)
[![License](https://img.shields.io/badge/License-MIT-green)](LICENSE)

---

## Architecture du projet

```
Gen3ia/
├── prisma/schema.prisma     # 40+ modèles de données
├── src/
│   ├── lib/                  # 30+ moteurs métier
│   └── app/api/              # 50+ endpoints REST
└── README.md                 # Documentation
```

---

## 1. Workflow Canvas — Glisser-Déposer avec Versioning

Créez des automatisations sans écrire de code : 20 types de blocs (agents, conditions, boucles, HTTP, email, IA...), branching visuel, connexions par glisser, templates pré-construits.

### Versioning Git-like

Chaque workflow bénéficie d'un système de versioning complet :

| Fonctionnalité | Endpoint |
|----------------|----------|
| Sauvegarder une version | `POST /api/workflows/[id]/version?action=save` |
| Restaurer une version | `POST /api/workflows/[id]/version?action=restore` |
| Créer une branche | `POST /api/workflows/[id]/branch?action=create` |
| Changer de branche | `POST /api/workflows/[id]/branch?action=switch` |
| Fusionner des branches | `POST /api/workflows/[id]/branch?action=merge` |
| Historique complet | `GET /api/workflows/[id]/version` |

### Collaboration

| Fonctionnalité | Endpoint |
|----------------|----------|
| Ajouter un collaborateur | `POST /api/workflows/[id]/collaborators?action=add` |
| Lister les collaborateurs | `GET /api/workflows/[id]/collaborators` |
| Modifier le rôle | `POST /api/workflows/[id]/collaborators?action=update` |
| Supprimer | `DELETE /api/workflows/[id]/collaborators` |

**Moteur**: `src/lib/workflow-engine.ts` (16.6 KB) — Exécution avec branching conditionnel (if/else, switch, AI classifier, sentiment)
**Moteur**: `src/lib/workflow-versioning.ts` (6.8 KB) — Save, restore, branch, merge, switch

---

## 2. Agents IA — Spécialisation & Délégation

### Création d'agents spécialisés
Les utilisateurs créent leurs propres agents avec instructions, outils et modèles personnalisés :
- Instructions dédiées + system prompt généré automatiquement
- Outils attachables (API, Webhook, MCP, Function)
- Modèles: GPT-4o, GPT-4o-mini, Claude
- Publication sur la Marketplace

### Délégation entre agents
Un agent peut déléguer une sous-tâche à un agent spécialisé :
- Mode **async** (fire & forget) : `delegate()`
- Mode **sync** (avec attente du résultat) : `delegateAndWait()`
- Timeout configurable
- Priorité et contexte de délégation

### Mode Autonome avec supervision
Fonctionnement en arrière-plan avec points de contrôle humains :
- Boucle autonome avec cycles
- 5 triggers de checkpoint : `before_action`, `after_cycle`, `on_threshold`, `on_error`, `periodic`
- Décisions : approved / rejected / reviewed
- Timeout avec auto-approbation

| Endpoint | Actions |
|----------|---------|
| `POST /api/agents/specialized` | `create`, `publish`, `clone` |
| `GET /api/agents/specialized` | Lister mes agents + marketplace |
| `GET/PUT/DELETE /api/agents/specialized/[id]` | CRUD individuel |
| `POST /api/agents/delegate` | Déléguer une tâche |
| `GET /api/agents/delegate` | Lister les délégations |
| `POST /api/agents/autonomous` | `start`, `pause`, `resume`, `cancel`, `checkpoint` |
| `GET /api/agents/autonomous` | Statut d'un run |

**Moteurs**: `src/lib/agent-specialization.ts` · `src/lib/agent-delegation.ts` · `src/lib/agent-autonomous.ts`

---

## 3. Data Analyst — Requêtes en langage naturel

Posez des questions en français sur vos données, l'agent génère la requête SQL/API et affiche le résultat.

### Fonctionnalités
- **NL2SQL intelligent**: 8+ patterns (total, evolution, repartition, top, filtres...)
- **Visualisations dynamiques**: barres, lignes, camembert, donut, aire
- **Dashboards interactifs**: widgets graphiques, métriques, tableaux, filtres
- **Import CSV**: depuis JSON, schema auto-détecté
- **Historique des requêtes**: conservation de chaque question + résultat

| Endpoint | Actions |
|----------|---------|
| `POST /api/data-analyst` | `ask` (question NL), `nl2sql`, `dashboard`, `import` |
| `GET /api/data-analyst` | `dashboards`, `datasets`, `history` |
| `GET/PUT/DELETE /api/data-analyst/[id]` | Dashboard individuel |
| `GET/PUT/DELETE /api/data-analyst/dataset/[id]` | Dataset individuel |

**Moteur**: `src/lib/data-analyst.ts` (10.3 KB)

---

## 4. Marketplace — Confiance & Évaluation

### Système de notation et avis
- Notation 1-5 étoiles avec titre et commentaire
- Validation: utilisateur doit avoir acheté le listing
- Vote "utile" sur les avis
- Recalcul automatique de la note moyenne

### Badges de qualité (7 badges)
| Badge | Condition |
|-------|-----------|
| ✓ Vérifié | Test passé + note ≥ 4 + 5 achats |
| 🔥 Populaire | ≥ 10 achats |
| ⚡ Haute Performance | Test score ≥ 80/100 |
| ⭐ Top Noté | Note ≥ 4.5 et ≥ 5 avis |
| 🆕 Nouveau | Publié < 7 jours |
| 💎 Pro | Payant + note ≥ 4.5 |
| 👥 Choix Communauté | ≥ 20 achats + note ≥ 4 |

### Tests automatiques sandboxés
Avant publication, 6 checks de validation automatiques :
1. Nom (3-100 car.) | 2. Description (≥ 10 car.) | 3. Config JSON | 4. Agent référencé | 5. Type valide | 6. Prix

### Trust Score (0-100)
Note(30pts) + Achats(25pts) + Avis(15pts) + Test(20pts) + Age(10pts)

| Endpoint | Actions |
|----------|---------|
| `GET /api/marketplace` | Listings avec badges + tri (popular/rating/trust) |
| `POST /api/marketplace/trust` | `test`, `badges`, `score`, `test-all` |
| `POST /api/marketplace/reviews` | Ajouter/noter un avis |
| `GET /api/marketplace/reviews` | Lister les avis + moyenne |

**Moteurs**: `src/lib/marketplace/review-system.ts` · `src/lib/marketplace/trust-system.ts` (9.9 KB)

---

## 5. Monitoring & Observabilité

### Tableau de bord d'activité en temps réel
- Métriques: agents actifs, exécutions 24h, tokens, coût, taux succès
- Graphiques d'évolution (7 jours)
- Fil d'activité en direct
- Performances: temps moyen, tokens/exec, budget

### Alertes configurables
| Condition | Déclencheur | Canaux |
|-----------|-------------|--------|
| `failure` | Échec d'exec | Email, SMS, Webhook |
| `budget_exceeded` | Coût > seuil | Email, SMS, Webhook |
| `slow_performance` | Durée > seuil | Email, SMS, Webhook |
| `error_rate` | Taux d'erreur > seuil | Email, SMS, Webhook |

| Endpoint | Actions |
|----------|---------|
| `GET /api/monitoring` | `summary`, `alerts`, `events` |
| `POST /api/monitoring` | `create-rule`, `evaluate`, `toggle`, `delete`, `mark-read` |

**Moteur**: `src/lib/monitoring/observability.ts` (8.6 KB)

---

## 6. Intégrations & Extensibilité

### Webhooks sortants
- Retry exponentiel (3 tentatives: 500ms, 1s, 2s)
- Signature HMAC SHA-256 + timestamp anti-replay
- Headers automatiques: `X-Gen3ia-Signature`, `X-Gen3ia-Timestamp`
- Templating JSON avec interpolation `{{ variables }}`

### Plugin SDK communautaire
5 types de plugins : `block`, `connector`, `tool`, `trigger`, `transformer`

| Endpoint | Actions |
|----------|---------|
| `POST /api/webhooks` | `create`, `execute`, `delete` |
| `GET /api/webhooks` | `configs`, `logs` |
| `POST /api/plugins` | `create`, `execute`, `publish` |
| `GET /api/plugins` | `list`, `mine`, `scaffold` |

**Moteurs**: `src/lib/webhook-engine.ts` (7.8 KB) · `src/lib/plugin-sdk.ts` (5.7 KB)

---

## 7. Recherche Globale & Notifications

### Search Engine V2
Recherche dans **8 modules** avec scoring pondéré, fuzzy matching et cache LRU :

```http
GET /api/search?q=analyseur              # Recherche
GET /api/search?q=ana&scope=suggest       # Suggestions
GET /api/search?q=agent&sort=popular      # Tri par popularité
GET /api/search?scope=counts              # Compteurs
GET /api/search?q=ventes&types=dataset,dashboard  # Filtrage par type
```

### Notification Engine
- Système unifié avec sévérité (info/warning/critical)
- Notifications automatiques sur 8 types d'événements
- Broadcast à tous les utilisateurs

| Endpoint | Actions |
|----------|---------|
| `GET /api/notifications` | `list`, `unread` |
| `POST /api/notifications` | `mark-read`, `mark-all-read`, `delete` |

**Moteurs**: `src/lib/search-engine.ts` (13 KB) · `src/lib/notification-engine.ts` (5.5 KB)

---

## Statistiques du projet

```
📦 40+ modèles Prisma        🌐 50+ endpoints API REST
🧠 30+ fichiers moteur        📄 13 interfaces HTML interactives
🔐 2FA TOTP + argon2id        🚀 Cache LRU + Scoring pondéré
🔌 Signature HMAC Webhook     🧪 Tests sandboxés automatiques
🏅 7 badges marketplace       📊 NL2SQL + Dashboards interactifs
🤖 Agents spécialisés + délé  🔔 Notifications temps réel
```

---

<p align="center">Développé avec ❤️ au Cameroun · MIT License</p>
