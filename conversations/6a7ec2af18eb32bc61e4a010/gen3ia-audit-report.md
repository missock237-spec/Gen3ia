# Gen3ia — Audit de Production SaaS
**Date:** 14 août 2026  
**Repo:** `missock237-spec/Gen3ia` (Next.js 14 + Firebase)  
**Version:** 0.11.0 | **Code:** ~133K lignes TypeScript | **237 routes API** | **~20 pages**

---

## 📊 État Général

Gen3ia est un SaaS multi-agents IA ambitieux avec :
- **Stack:** Next.js 14 + Firebase (Auth, Firestore, Storage, FCM) + BullMQ/Redis + Rust (agent-safety)
- **Monorepo:** Turborepo + Bun (apps, packages, services, crates)
- **Paiement:** Chariow (Mobile Money Afrique + carte) + PAYG engine
- **Monitoring:** Grafana, Prometheus, Loki, Sentry, OpenTelemetry
- **Déploiement:** Docker, Render, Vercel (configurations multiples)

**Score global production-readiness: 5/10** — Architecture solide mais problèmes critiques de sécurité et d'intégrité des données.

---

## 🔴 PROBLÈMES CRITIQUES (Production-blocking)

### 1. Race Conditions sur le Système de Crédits
**Fichiers:** `src/lib/billing/credits.ts`, `src/lib/payg-engine.ts`

Les débits de crédits suivent un pattern **read-check-write non-atomique** :
```typescript
// credits.ts — deductCredits()
const balance = await getCreditBalance(userId);  // READ
if (balance < amount) return { success: false }; // CHECK
const newBalance = balance - amount;
await db.creditTransaction.create({ ... });       // WRITE (non-atomique!)
```

Le shim Firestore expose `$transaction` comme un **no-op** :
```typescript
// firestore.ts:922
$transaction: async <R>(fn: () => Promise<R>): Promise<R> => fn(),  // ⚠️ Aucune atomicité!
```

**Impact:** Deux requêtes concurrentes peuvent double-dépenser des crédits. En production, un utilisateur peut exécuter des agents IA payants sans avoir les crédits nécessaires.

**Solution:** Utiliser les transactions Firestore natives :
```typescript
import { getAdminDb } from '@/lib/firebase/admin';
const db = getAdminDb();
await db.runTransaction(async (tx) => {
  const ref = db.collection('credits').doc(`credit_${userId}`);
  const doc = await tx.get(ref);
  const balance = doc.data()?.balance ?? 0;
  if (balance < amount) throw new Error('Crédits insuffisants');
  tx.update(ref, { balance: balance - amount, updatedAt: new Date() });
  // Log transaction atomiquement
  tx.create(db.collection('credit_transactions').doc(), { ... });
});
```

---

### 2. 86% des Routes API sans `withAuth`
**Données:** 33 routes sur 237 utilisent `withAuth` (14%). 204 routes n'ont pas la validation cryptographique des tokens.

Routes critiques SANS `withAuth` :
- `POST /api/agents/run` — Exécute des agents IA (coûte des crédits)
- `GET/POST /api/agents` — Liste/crée des agents
- `POST /api/billing/webhook` — Traitement des webhooks de paiement
- `POST /api/agents/stream` — Streaming d'agents IA

Le middleware Edge (layer 1) décode le JWT **sans vérification crypto** :
```typescript
// middleware.ts — verifyFirebaseSession()
// Edge-safe : on décode juste le JWT (pas de vérif crypto)
const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
```

**Impact:** Un attaquant peut forger un JWT avec un payload arbitraire (`{ uid: "admin", role: "admin" }`) et accéder aux routes qui ne valident pas via `withAuth`.

**Solution:** Wrapper toutes les routes avec `withAuth`, surtout les routes qui manipulent des crédits ou exécutent des actions coûteuses :
```typescript
// Avant
export async function POST(request: NextRequest) { ... }

// Après
export const POST = withAuth(async (request, ctx, auth) => {
  // auth.userId est vérifié cryptographiquement
  ...
}, { roles: ['user'], rateLimit: { limit: 20, windowMs: 60000 } });
```

---

### 3. `$queryRaw` / `$queryRawUnsafe` — Silencieusement Cassés
**Fichiers affectés:**
- `src/lib/multi-tenant/tenant-isolation.ts` (lignes 48, 56)
- `src/lib/integrations/webhook-delivery.ts` (lignes 103, 188)
- `src/app/api/ai/health/route.ts` (ligne 13)
- `src/app/api/system/status/route.ts` (ligne 191)
- `src/lib/ai-integration-server/saas-doctor.ts` (lignes 42, 52)

Le shim Firestore retourne **des résultats vides** pour toutes les requêtes SQL :
```typescript
// firestore.ts:929
$queryRaw: async <T = any>(): Promise<T[]> => [],  // Toujours vide!
$executeRaw: async (): Promise<number> => 0,       // Toujours 0!
```

**Impact:**
- **Multi-tenant:** `TenantIsolation.initContext()` ne trouve jamais l'appartenance d'un utilisateur → erreur 500 ou accès refusé systématique
- **Health checks:** `/api/health` et `/api/system/status` rapportent un DB "OK" même si Firestore est down
- **Webhook delivery:** Les webhooks en attente ne sont jamais récupérés

**Solution:** Réécrire ces modules avec les requêtes Firestore natives :
```typescript
// Au lieu de db.$queryRawUnsafe('SELECT role FROM tenant_members...')
const membership = await db.workspaceMember.findFirst({
  where: [
    { field: 'tenantId', op: '==', value: tenantId },
    { field: 'userId', op: '==', value: userId },
    { field: 'status', op: '==', value: 'active' },
  ],
});
```

---

### 4. Docker Compose Prod Incohérent avec Firebase
**Fichier:** `docker-compose.prod.yml`

La config de production référence encore **PostgreSQL + NextAuth** alors que le projet a migré vers Firebase :
```yaml
services:
  app:
    environment:
      DATABASE_URL: postgresql://genova:...@postgres:5432/genova  # ⚠️ Inutilisé
      NEXTAUTH_URL: ...      # ⚠️ Remplacé par Firebase Auth
      NEXTAUTH_SECRET: ...   # ⚠️ Inutilisé
  postgres:                   # ⚠️ Service inutile
    image: postgres:16-alpine
```

**Impact:** Déploiement prod avec services inutiles (Postgres), variables d'environnement obsolètes, confusion pour les ops.

**Solution:** Créer un `docker-compose.prod.yml` Firebase-only :
- Supprimer le service `postgres`
- Garder Redis (pour BullMQ + rate limiting distribué)
- Ajouter Qdrant (pour vector store RAG)
- Nettoyer les variables d'environnement

---

### 5. LLM Gateway — Mode Démo en Production
**Fichier:** `src/lib/llm/gateway.ts`

Quand aucun provider n'est configuré, la gateway retourne une **réponse simulée** :
```typescript
// gateway.ts
if (activeProviders.length === 0) {
  log.warn('llm_no_provider', { tag: options.tag });
  return {
    content: `[Mode démo] Réponse simulée pour : "..."`,
    tokens: 50, provider: 'openai', cached: false,
  };
}
```

**Impact:** En production, si les clés API LLM ne sont pas configurées ou expirent, les agents retournent des réponses simulées sans alerter l'utilisateur. Celui-ci paie des crédits pour des réponses factices.

**Solution:** Lancer une erreur en production :
```typescript
if (activeProviders.length === 0) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Aucun provider LLM configuré');
  }
  // Mode démo seulement en développement
  return simulatedResponse;
}
```

---

## 🟠 PROBLÈMES MAJEURS

### 6. Double Système de Crédits Incohérent
- `src/lib/billing/credits.ts` — Crédits abstraits (5 crédits = 1 agent run)
- `src/lib/payg-engine.ts` — Tarification XAF/USD (50 XAF = 1 agent run)

Les deux systèmes coexistent sans coordination claire. Lequel est autoritaire ?

**Solution:** Unifier sous un seul引擎. Soit :
- **Option A:** Tout passe par `credits.ts` (crédits abstraits) avec conversion XAF↔crédits au moment du paiement
- **Option B:** Tout passe par `payg-engine.ts` (XAF réel) avec `credits.ts` comme interface simplifiée

### 7. Webhook Paiement — Signature Inconsistante
**Fichier:** `src/app/api/billing/webhook/route.ts`

Le webhook importe `prisma` (shim Firestore) mais utilise des méthodes qui peuvent ne pas exister dans le shim (`affiliateReferral`, `affiliateCode` avec `increment`).

De plus, le traitement des erreurs dans `triggerAffiliateBonus` est silencieux :
```typescript
} catch (err) {
  console.error('[AffiliateBonus] Erreur:', err);  // ⚠️ Pas de Sentry/monitoring
}
```

### 8. Coverage de Tests Très Faible
- **49 fichiers de test** pour ~133K lignes de code
- Couverture estimée: **<10%** des 237 routes API
- Tests E2E: 3 fichiers (auth, credits, api) avec Playwright
- Tests de charge: k6 mais probablement non intégrés au CI

**Solution:** Prioriser les tests sur les chemins critiques :
1. Auth + session management
2. Crédits (débit/crédit, race conditions)
3. Webhook de paiement
4. Exécution d'agents

### 9. Firestore — Pas de Pagination Systématique
Le shim Firestore expose `findMany` mais les routes API n'appliquent pas systématiquement de `limit`. Firestore a une limite de 1MB par document et les requêtes non paginées peuvent être coûteuses.

### 10. Rate Limiting en Mémoire (Edge)
**Fichier:** `src/middleware.ts`

Le rate limiting en Edge utilise un store en mémoire (non distribué). En production avec plusieurs instances, chaque instance a son propre compteur.

**Solution:** Configurer Redis pour le rate limiting distribué via `setRedisClient()`.

---

## 🟡 AMÉLIORATIONS RECOMMANDÉES

### Architecture
1. **Nettoyer les configurations de déploiement:** Un seul `docker-compose.prod.yml` aligné avec Firebase. Supprimer `vercel.json` et `render.yaml` si non utilisés.
2. **Migration Next.js 15:** Le repo a `docs/UPGRADE_NEXT15.md` — Next 14.2.35 est en fin de vie. Next 15 apporte Turbopack, `params` async, etc.
3. **Rust → WASM:** Le module `agent-safety` en Rust nécessite une compilation native. Envisager WASM pour simplifier le déploiement.

### Sécurité
4. **Secret scanning:** Ajouter `trufflehog` ou `gitleaks` au CI en plus de CodeQL
5. **CSP `connect-src`:** La liste est large (OpenAI, Anthropic, Groq, etc.). Réduire aux providers réellement utilisés.
6. **Webhook idempotency:** Le webhook Chariow ne vérifie pas si la transaction a déjà été traitée (replay attacks possibles)

### Performance
7. **Firestore composite indexes:** Vérifier que les 18 index de `firestore.indexes.json` couvrent toutes les requêtes des 237 routes
8. **Connection pooling Redis:** Configurer `maxRetriesPerRequest` et `enableOfflineQueue` pour BullMQ
9. **CDN pour assets statiques:** Configurer un CDN (Cloudflare, CloudFront) pour `public/`

### DevOps
10. **CI/CD:** Ajouter des étapes de test E2E dans le CI GitHub Actions
11. **Health checks:** Améliorer `/api/health` avec checks réels (Firebase Admin, Redis, LLM providers)
12. **Graceful shutdown:** Le `docker-entrypoint.sh` devrait gérer SIGTERM proprement

### Observabilité
13. **Alerting:** Configurer des alertes Grafana pour : crédit balance négative, rate limit hits, LLM latency >5s, webhook failures
14. **Audit trail:** Vérifier que `audit_logs` capture toutes les actions admin et les transactions financières

---

## ✅ CE QUI EST BIEN FAIT

- **Architecture monorepo** propre avec Turborepo + Bun
- **Middleware de sécurité** avec CSP par nonce, headers de sécurité complets
- **Module Rust `agent-safety`** pour détection d'injections et jailbreak
- **Firestore rules** deny-by-default avec ownership-based access
- **Shim Prisma→Firestore** élégant pour préserver la compatibilité
- **LLM Gateway** avec cache, fallback multi-provider et retry
- **Stack monitoring** complète (Prometheus + Grafana + Loki + Sentry + OTel)
- **Documentation** riche (ARCHITECTURE.md, SECURITY.md, DEPLOYMENT.md)
- **CI** avec lint + typecheck + test + build + build-worker
- **Dependabot + Snyk + CodeQL** pour la sécurité des dépendances

---

## 🎯 PRIORITÉS D'ACTION

| Priorité | Issue | Effort | Impact |
|----------|-------|--------|--------|
| **P0** | Race conditions crédits (transaction Firestore) | 2j | Critique — pertes financières |
| **P0** | Wrapper 100% des routes avec `withAuth` | 3j | Critique — sécurité |
| **P0** | LLM gateway — fail au lieu de mode démo en prod | 0.5j | Critique — UX + confiance |
| **P1** | Réécrire `$queryRaw` en requêtes Firestore | 2j | Majeur — multi-tenant cassé |
| **P1** | Nettoyer docker-compose.prod.yml | 1j | Majeur — déploiement |
| **P1** | Idempotency webhook Chariow | 1j | Majeur — replay attacks |
| **P1** | Unifier le système de crédits | 3j | Majeur — cohérence |
| **P2** | Tests sur chemins critiques | 5j | Important — fiabilité |
| **P2** | Rate limiting distribué (Redis) | 1j | Important — scalabilité |
| **P2** | Health checks réels | 1j | Important — monitoring |
| **P3** | Migration Next.js 15 | 5j | Nice-to-have |
| **P3** | Pagination systématique Firestore | 3j | Nice-to-have |
| **P3** | Rust → WASM | 5j | Nice-to-have |
