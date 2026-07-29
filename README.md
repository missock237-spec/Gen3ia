# Gen3ia - AI Automation Ecosystem

**L'OS de l'automatisation intelligente** - Accessible . Communautaire . Flexible

[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=next.js)](https://nextjs.org/)
[![Prisma](https://img.shields.io/badge/Prisma-6-2D3748?logo=prisma)](https://www.prisma.io/)
[![Render](https://img.shields.io/badge/render-deploy-46E3B7?logo=render)](https://render.com)
[![License](https://img.shields.io/badge/License-MIT-green)](LICENSE)

---

## La vision

Gen3ia transforme la puissance de l'IA en un ecosysteme complet d'automatisation accessible a tous.

```
No-Code & Templates    Communaute & Createurs    Flexibilite Maximale
     |                        |                         |
     v                        v                         v
+-----------------------------------------------------------+
|          GEN3IA - AI AUTOMATION ECOSYSTEM                 |
|  Agents IA . Workflows . Voice . Terminal . Marketplace   |
|  SebPay . 28 Integrations . 2FA . Versioning Git-like     |
+-----------------------------------------------------------+
```

---

## 1. Workflow Canvas - Glisser-Deposer avec Versioning

Creez des automatisations sans ecrire de code : 20 types de blocs (agents, conditions, boucles, HTTP, email, IA...), branching visuel (Si/Alors, Switch, Sentiment), connexions par glisser, templates pre-construits.

### Versioning Git-like

Chaque workflow beneficie d'un systeme de versioning complet inspire de Git :

| Fonctionnalite | Description |
|----------------|-------------|
| **Versions** | Chaque sauvegarde cree une version avec message. Historique complet. |
| **Branches** | Creez des branches pour travailler en parallele (`main`, `feature-*`, `experimental`) |
| **Merge** | Fusionnez une branche source dans la branche active |
| **Restauration** | Restaurez n'importe quelle version anterieure |
| **Switch** | Basculez entre branches instantanement |
| **Collaborateurs** | Invitez des membres de l'equipe avec 3 roles : viewer, editor, admin |

```
Branch main  : v1 -> v2 -> v3 (active)
                    \
Branch feature-test : v1 -> v2 -> (merge dans main -> v4)
```

### API Endpoints Versioning

```http
GET    /api/workflows/[id]/version          # Historique des versions
POST   /api/workflows/[id]/version?action=save     # Sauvegarder
POST   /api/workflows/[id]/version?action=restore  # Restaurer
GET    /api/workflows/[id]/branch           # Lister les branches
POST   /api/workflows/[id]/branch?action=create    # Creer une branche
POST   /api/workflows/[id]/branch?action=switch    # Changer de branche
POST   /api/workflows/[id]/branch?action=merge     # Fusionner
DELETE /api/workflows/[id]/branch?branchId=xxx     # Supprimer
GET    /api/workflows/[id]/collaborators    # Lister collaborateurs
POST   /api/workflows/[id]/collaborators?action=add       # Ajouter
POST   /api/workflows/[id]/collaborators?action=update    # Modifier role
DELETE /api/workflows/[id]/collaborators?collaboratorId=x # Supprimer
```

---

## 2. Agents IA intelligents

- **Multi-agents** : Coordinateur, Analyste, Redacteur, Relecteur - 4 strategies
- **Memoire long terme** : L'agent se souvient et apprend
- **Auto-amelioration** : Ajuste prompts, temperature, modele
- **Assistants vocaux** : Votre voix, votre personnalite, votre marque

### Terminal intelligent

Mode assiste avec explications, risques et alternatives avant execution.

### Data Analyst & Veille

- **Agent Data Analyst** : Analyse CSV/DB/API, resumes NLP, graphiques
- **Watchdog** : Surveillance web/RSS/reseaux sociaux, alertes tendances

---

## 3. Communaute & Createurs (Marketplace)

| Fonctionnalite | Detail |
|----------------|--------|
| Publier des templates | Agents et workflows reutilisables |
| Prix libre | Commission plateforme 15% |
| Reversements auto | Mobile Money via SebPay |
| Dashboard createur | Gains, listings, retraits |
| Retrait minimum | 2 000 FCFA - Orange Money, MTN MoMo |

### 28 connecteurs natifs

```
Gmail . Slack . Telegram . WhatsApp . SES
Google Calendar . Drive . Docs . Notion
GitHub . GitLab . Jira . Linear
Salesforce . HubSpot
OpenAI . Anthropic . ElevenLabs
Zapier . Make . n8n . Webhook
Datadog . Sentry . PagerDuty
X (Twitter) . LinkedIn
```

---

## 4. Flexibilite maximale

### 2 modeles de paiement

```
Abonnements mensuels          Pay-as-you-go
Free     0 FCFA               Agent:   50 FCFA/exec
Starter  5 000 FCFA           Token:    5 FCFA/1K
Pro     15 000 FCFA           Image:  250 FCFA
Enterprise 50 000 FCFA        Voice:  100 FCFA/min
```

**Paiement via SebPay** : Orange Money, MTN MoMo, Wave, Carte Bancaire

### Portail self-service

Historique, changement de formule, resilitation, recharge PAYG, factures.

### Securite

2FA TOTP, argon2id, AES-256-GCM, CSP strict, audit automatise (Snyk, CodeQL, Trivy).

---

## Quick Start

```bash
docker compose -f docker-compose.dev.yml up -d
cp .env.local.example .env.local
make dev:seed
```

## En chiffres

```
190+ fichiers source      28 integrations natives
4 strategies multi-agents 2 modeles de paiement
20 types de blocs no-code 6 personnalites vocales
15 operateurs condition    15% commission createurs
14 ressources PAYG        5 sources de veille
16 regles de securite     7 workflows CI/CD
30+ fichiers de test      30+ endpoints API documentes
Systeme de versioning     Gestion des collaborateurs
```

---

<p align="center">
  <a href="ARCHITECTURE.md">Architecture</a> .
  <a href="CONTRIBUTING.md">Contribuer</a> .
  <a href="CHANGELOG.md">Changelog</a> .
  <a href="SECURITY.md">Securite</a>
</p>

<p align="center">Developpe avec amour au Cameroun . MIT License</p>
