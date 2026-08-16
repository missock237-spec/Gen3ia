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
> La cible Vercel construit via `package.json` racine (`bun run build`).

## ❌ Ce que `render.yaml` n'est PAS

Le fichier `render.yaml` est une **documentation d'architecture**, pas une vraie config Render.
Ne pas l'utiliser pour un déploiement Render. La source de vérité est ce document.

## Mode 1 : Vercel (recommandé)

- `vercel.json` : framework nextjs, build `bun run build`, install `bun install && bun x prisma generate`
- **App** servie serverless. ⚠️ Les workers BullMQ ne doivent PAS tourner sur Vercel (serverless = pas d'état long).
- **Worker** : déployé séparément sur Docker/VPS via `Dockerfile.worker`.
- Cron Vercel pour le refresh de tokens via `/api/cron/refresh-tokens`.

## Mode 2 : VPS / Docker autonome

- `docker-compose.yml` : orchestration complète (app + worker + postgres + redis + qdrant)
- `Caddyfile` : proxy inverse TLS (Let's Encrypt) + en-têtes sécurité
- `next.config.mjs` a `output: 'standalone'` → build Docker optimisé.

## Variables d'environnement

Voir `.env.example`. Essentielles :
`DATABASE_URL`, `REDIS_URL`, `AUTH_SECRET`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `NEXT_PUBLIC_APP_URL`, fournisseurs LLM, Stripe.

## En-têtes sécurité

- **Middleware** (`src/middleware.ts`) : CSP + HSTS + nosniff + frame + referrer + permissions-policy (5 en-têtes)
- **Caddy** (`Caddyfile`) : HSTS + headers (protection au niveau proxy)
- Double couverture HSTS (app + proxy) — OK.

---

# 🛡️ Migration Strategy — Zero-Downtime (Phase 4.3)

Objectif : déployer de nouvelles versions **sans coupure de service**, avec un
**rollback rapide (< 5 min)**.

## Stratégie Blue-Green

Deux environnements identiques (**bleu** = v1 actif, **vert** = v2 candidat).

```
                    +----------------------+
   users ---> LB --->  BLEU (v1, actif)    |--- DB partagée
                    |  VERT (v2, candidat) |--- Redis partagé
                    +----------------------+
```

1. **Déployer v2 en parallèle** (verte) sans rediriger le trafic.
2. **Tester complètement** v2 : health endpoint, logs, mises à niveau DB en staging.
3. **Basculer le load balancer** vers le vert (unique action atomique).
4. **Rollback facile** : rebasculer le LB vers le bleu en < 5 min (le bleu reste prêt).

> ⚠️ Si l'app est serverless (Vercel), le « vert » est un déploiement preview
> validé puis promu à 100 %. Pour les workers BullMQ, la bascule est le redémarrage
> du conteneur worker pointant vers la même file Redis — les jobs en cours survivent.

## Migrations Prisma — toujours backward-compatible

Règle d'or : **une migration ne doit jamais casser l'ancienne version** pendant
le déploiement (bleu tourne encore pendant que vert démarre).

### Bonnes pratiques

- **Ajouter des colonnes AVANT de les supprimer.**
  - Étape 1 : migration additive (`ADD COLUMN`, nullable ou avec défaut).
  - Étape 2 : backfill les données et basculer la logique applicative.
  - Étape 3 (après stabilisation) : migration destructive (`DROP COLUMN`).
- **Chaque migration est appliquée en staging d'abord**, puis en prod.
- **Ne jamais renommer en déplaçant des données dans la même migration.**
  Préférer : ajouter la nouvelle colonne → copier → mettre à jour l'app → supprimer l'ancienne.
- **Suppressions/reprises de tables** : désactiver l'accès, migrer, renommer (pas `DROP` immédiat).

### Plowbook d'une migration additive

```bash
# 1. Créer le fichier de migration
bun x prisma migrate dev --name add_column_x --create-only

# 2. Vérifier que le SQL est ADD-only, appliquer en staging
bun x prisma migrate deploy --schema prisma/schema.prisma

# 3. Tester les deux versions (bleu + vert) contre la même DB
# 4. Adapter le code applicatif (lecture+écriture de la nouvelle colonne)
# 5. En prod : bun x prisma migrate deploy
# 6. Une fois stabilisé : nouvelle migration additive/rename/drop pour nettoyer
```

### Rollback plan (documenté et testé)

1. `git revert` du commit applicatif (ou bascule LB vers bleu).
2. Une migration **backward-compatible** ne nécessite PAS de rollback SQL :
   les colonnes ajoutées restent en place sans gêner l'ancien code.
3. En cas de régression data, restaurer un snapshot DB + replay du log (si dispo).
4. Re-bascule LB une fois la correction déployée en vert.

---

## Checklist de migration avant production

- [ ] Migration testée en staging
- [ ] Migration **additive / backward-compatible** (aucun `DROP` non préparé)
- [ ] Les deux versions (bleu/vert) passent le health endpoint
- [ ] Logs agrégés (Loki) + Sentry actifs
- [ ] Commandes de rollback documentées et testées
- [ ] Snapshot DB frais disponible
