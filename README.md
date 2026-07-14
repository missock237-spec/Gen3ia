# 🤖 Genova AI Agent Operating System

**SaaS 100% Gratuit (Open Source) — Next.js + Prisma + PostgreSQL**

Genova est un système d'exploitation pour agents AI. **Code open source (MIT)**, utilisation libre.

> 💡 **Self-hosting :** Gratuit — déployez sur votre propre serveur sans abonnement.
> ☁️ **Genova Cloud :** SaaS hébergé avec abonnements (voir [PRICING.md](PRICING.md)).

---

## ✨ Fonctionnalités

- 🤖 **Agents AI autonomes** (ReAct Loop, mémoire, outils)
- 🔀 **AI Router intelligent** (routage des requêtes)
- 💬 **Pipeline WhatsApp** (Baileys)
- 🧠 **Mémoire persistante** (RAG + Vector DB)
- 🏪 **Marketplace** d'agents, workflows et templates
- 🎨 **Génération d'images & vidéos**
- 🗣️ **Voix & Multimodal** (ASR, TTS, VLM)
- 🔒 **Guardrails & Sécurité**
- 📊 **Analytique & Monitoring**
- 🔌 **58 endpoints API REST**

---

## 🚀 Démarrage rapide (gratuit)

```bash
git clone https://github.com/missock237-spec/Genova.git
cd Genova
npm install
# Configurer .env (copier .env.example)
npm run db:setup
npm run dev
```

---

## 🏷️ Abonnements Genova Cloud

| Plan | Prix | Crédits | Agents |
|------|------|---------|-------|
| 🆓 Free | **$0/mo** | 100/mois | 2 |
| 🚀 Starter | **$9/mo** | 1 000/mois | 5 |
| ⭐ Pro | **$29/mo** | 5 000/mois | 20 |
| 🏢 Enterprise | **$99/mo** | Illimité | Illimité |

> Détails complets → [PRICING.md](PRICING.md)

---

## 📦 Stack Technique

- **Frontend :** Next.js 16, React 19, Tailwind CSS 4, shadcn/ui
- **Backend :** Next.js API Routes (58 endpoints)
- **Base de données :** Prisma + PostgreSQL
- **Paiements :** Stripe
- **Vector DB :** Qdrant
- **File d'attente :** BullMQ + Redis
- **Services :** PocketBase, Baileys WhatsApp, SpeechBrain

---

## 📄 Licence

**MIT License** — Copyright (c) 2026 Missock237

Ce projet est open source. Vous pouvez librement l'utiliser, le modifier et le distribuer.
