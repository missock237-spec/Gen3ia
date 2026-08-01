# 🚀 Déploiement — Gen3ia

Ce document est la **référence unique** pour comprendre comment déployer Gen3ia.
Il tranche entre les différents fichiers de plateforme.

## 🎯 Cible de déploiement (décision)

| Composant | Cible | Fichier de config |
|---|---|---|
| **Application Web (Next.js)** | **Vercel** (serverless, region fra1) | `vercel.json` |
| **Worker BullMQ** (async, agents auto) | **Docker / VPS** | `Dockerfile.worker` |
| **Base PostgreSQL** | Neon / Supabase | env `DATABASE_URL` |
| **Redis** (BullMQ + rate limit) | Upstash / Redis Cloud | env `REDIS_URL` |
| **Vectoriel Qdrant** (optionnel) | Qdrant Cloud / Docker | env `QDRANT_URL` |
| **TLS / proxy** (option VPS autonome) | Caddy | `Caddyfile` |

> ⚠️ **Important : l'app Next vit dans `src/` (racine), pas dans `apps/web`.**
> La cible Vercel construit via `package.json` racine (`npm run build`).

## ❌ Ce que `render.yaml` n'est PAS

Le fichier `render.yaml` est une **documentation d'architecture**, pas une vraie config Render.
Ne pas l'utiliser pour un déploiement Render. La source de vérité est ce document.

## Mode 1 : Vercel (recommandé)

- `vercel.json` : framework nextjs, build `npm run build`, install `npm install && npx prisma generate`
- **App** servie serverless. ⚠️ Les workers BullMQ ne doivent PAS tourner sur Vercel (serverless = pas d'état long).
- **Worker** : déployé séparément sur Docker/VPS via `Dockerfile.worker`.
- Cron Vercel pour le refresh de tokens via `/api/cron/refresh-tokens`.

## Mode 2 : VPS / Docker autonome

- `docker-compose.yml` : orchestration complète (app + worker + postgres + redis + qdrant)
- `Caddyfile` : proxy inverse TLS (Let's Encrypt) + en-têtes sécurité
- `next.config.js` a `output: 'standalone'` → build Docker optimisé.

## Variables d'environnement

Voir `.env.example`. Essentielles :
`DATABASE_URL`, `REDIS_URL`, `AUTH_SECRET`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `NEXT_PUBLIC_APP_URL`, fournisseurs LLM, Stripe.

## En-têtes sécurité

- **Middleware** (`src/middleware.ts`) : CSP + HSTS + nosniff + frame + referrer + permissions-policy (5 en-têtes)
- **Caddy** (`Caddyfile`) : HSTS + headers (protection au niveau proxy)
- Double couverture HSTS (app + proxy) — OK.
