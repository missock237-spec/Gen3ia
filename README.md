<div align="center">
  <h1>🤖 Genova AI</h1>
  <p><strong>Système d'exploitation pour agents IA — Open Source (MIT) · SaaS Freemium</strong></p>
  <p>
    <a href="https://github.com/missock237-spec/Genova/blob/main/LICENSE">
      <img src="https://img.shields.io/badge/License-MIT-green.svg" alt="License MIT">
    </a>
    <a href="https://nextjs.org/">
      <img src="https://img.shields.io/badge/Next.js-16-black?logo=next.js" alt="Next.js 16">
    </a>
    <a href="https://www.prisma.io/">
      <img src="https://img.shields.io/badge/Prisma-6-2D3748?logo=prisma" alt="Prisma 6">
    </a>
    <a href="https://www.postgresql.org/">
      <img src="https://img.shields.io/badge/PostgreSQL-16-336791?logo=postgresql" alt="PostgreSQL 16">
    </a>
    <a href="https://stripe.com/">
      <img src="https://img.shields.io/badge/Stripe-22-008CDD?logo=stripe" alt="Stripe 22">
    </a>
  </p>
  <p>
    <a href="#-fonctionnalités">Fonctionnalités</a> •
    <a href="#-quick-start">Quick Start</a> •
    <a href="#-pricing">Pricing</a> •
    <a href="#-api--intégrations">API</a> •
    <a href="#-stack-technique">Stack</a> •
    <a href="#-licence">Licence</a>
  </p>
  <br/>
</div>

Genova AI est une **plateforme complète d'orchestration d'agents IA**, conçue pour créer, déployer et coordonner des agents AI autonomes. Elle combine le **meilleur de l'IA open source** avec un **modèle SaaS Freemium** pour rendre la puissance des agents AI accessible à tous.

---

## ✨ Fonctionnalités

### 🤖 Agents AI Autonomes
- **ReAct Loop** intégré (Raisonnement + Action)
- Agents spécialisés : assistant, codeur, chercheur, analyste
- Mémoire persistante avec RAG (Qdrant Vector DB)
- Exécution de code sandboxée (JS/TS/Python/Bash)

### 🔀 AI Router Intelligent
- Routage automatique des requêtes vers le meilleur provider AI
- Support multi-providers : Groq, OpenRouter, OpenAI, Anthropic, Replicate
- Fallback automatique et optimisation des coûts

### 🔌 Intégrations & Connectivité
- **58 endpoints API REST** documentés
- **Clés API** avec restrictions par abonnement
- **Connexion MCP** (Model Context Protocol) pour Cursor, Claude Desktop
- **Pipeline WhatsApp** (Baileys) pour agents WhatsApp
- **Webhooks** Stripe pour paiements

### 🏪 Marketplace
- Publiez et achetez des agents, workflows et templates
- Système de crédits et d'évaluations
- Paiements Stripe intégrés

### 🎨 Multimédia
- Génération d'images (ComfyUI, Replicate)
- Génération de vidéos (CogVideo, VideoCrafter)
- Voix : ASR (SpeechBrain), TTS (OpenAI)
- Avatars et visioconférence IA

### 🛡️ Sécurité & Monitoring
- Guardrails configurables
- Rate limiting Redis
- Audit logging complet
- OpenTelemetry tracing

---

## 🚀 Quick Start

```bash
# 1. Cloner le dépôt
git clone https://github.com/missock237-spec/Genova.git
cd Genova

# 2. Installer les dépendances
npm install

# 3. Configurer l'environnement
cp .env.example .env
# Éditez .env avec vos paramètres PostgreSQL

# 4. Démarrer la base de données
npm run db:setup

# 5. Lancer l'application
npm run dev
# Ouverte sur http://localhost:3000
```

---

## 💰 Pricing

| Plan | Prix/mois | Crédits | Agents | Clés API |
|------|-----------|---------|--------|----------|
| 🆓 **Free** | **$0** | 100/mois | 2 | ❌ |
| 🚀 **Starter** | **$9** | 1 000/mois | 5 | ✅ 3 |
| ⭐ **Pro** | **$29** | 5 000/mois | 20 | ✅ 10 |
| 🏢 **Enterprise** | **$99** | Illimité | ∞ | ✅ 50 |

> **Self-hosting :** Totalement gratuit grâce à la licence MIT.
> **Genova Cloud :** SaaS hébergé avec support et infrastructure gérée.

Voir [PRICING.md](PRICING.md) pour les packs de crédits.

---

## 🔌 API & Intégrations

### Clés API
Générez des clés API depuis l'interface Genova (réservé aux abonnés Starter+).

```bash
curl -H "Authorization: Bearer gva_votre_cle" https://votre-instance/api/agents
```

### Connexion MCP
Genova expose un serveur MCP compatible avec Cursor, Claude Desktop et Windsurf.

```json
{
  "mcpServers": {
    "genova": {
      "url": "https://votre-instance/api/mcp",
      "headers": { "Authorization": "Bearer gva_..." }
    }
  }
}
```

Voir [MCP_CONNECT.md](MCP_CONNECT.md) pour plus de détails.

### Terminal de code
Exécutez du JavaScript, TypeScript, Python, Bash, HTML et JSON directement dans le navigateur.

---

## 📦 Stack Technique

| Catégorie | Technologie |
|-----------|-------------|
| **Frontend** | Next.js 16, React 19, Tailwind CSS 4, shadcn/ui, Framer Motion |
| **Backend** | Next.js API Routes (58 endpoints), tRPC-ready |
| **Base de données** | Prisma 6 + PostgreSQL 16 |
| **Vector DB** | Qdrant |
| **File d'attente** | BullMQ + Redis |
| **Paiements** | Stripe (checkout, abonnements, webhooks) |
| **IA Providers** | Groq, OpenRouter, OpenAI, Anthropic, Replicate |
| **Voix** | SpeechBrain (ASR), OpenAI TTS |
| **WhatsApp** | Baileys (bibliothèque WhatsApp Web JS) |
| **Monitoring** | OpenTelemetry, Prometheus, Grafana |
| **MCP** | Model Context Protocol (2025-03-26) |

---

## 📂 Structure du Projet

```
📁 src/
  📁 app/          → Routes Next.js (App Router)
    📁 api/        → 58 endpoints API REST
    📁 (auth)/     → Pages d'authentification
  📁 components/   → Composants React
    📁 ui/         → Composants UI (shadcn)
    📁 agents/     → Gestion des agents
    📁 billing/    → Facturation et crédits
    📁 dashboard/  → Tableau de bord
    📁 terminal/   → Terminal de code
    📁 ads/        → Publicités récompensées
    📁 api-keys/   → Gestion des clés API
    📁 seo/        → Données structurées SEO
  📁 lib/          → Logique métier
    📁 billing/    → Stripe, crédits, plans
    📁 ads/        → Moteur de publicités
    📁 mcp/        → Serveur MCP
    📁 terminal/   → Sandbox d'exécution
    📁 connectors/ → Connecteurs MCP
📁 prisma/         → Schéma et migrations
📁 services/       → Microservices (PocketBase, Baileys)
```

---

## 📄 Licence

**MIT License** — Copyright (c) 2026 [Love Rose](https://github.com/missock237-spec)

Ce projet est open source. Vous pouvez librement l'utiliser, le modifier et le distribuer.
Voir le fichier [LICENSE](LICENSE) pour plus de détails.

---

<div align="center">
  <sub>Construit avec ❤️ au Cameroun — Genova AI Agent Operating System</sub>
</div>
