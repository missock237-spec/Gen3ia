## Système de Publicité Amélioré (Post-Prompt Ads)

### Vue d'ensemble

Le système de publicité post-prompt affiche des annonces automatiques après chaque réponse d'assistant dans les conversations. Le comportement varie selon le plan d'abonnement de l'utilisateur.

**Résumé des plans :**

| Feature | FREE | STARTER | PRO | ENTERPRISE |
|---------|------|---------|-----|------------|
| Affichage des publicités | ✓ Obligatoire | ✓ Optionnel | ✓ Optionnel | ✗ Aucun |
| Fermeture des publicités | ✗ Non | ✓ Oui | ✓ Oui | ✗ N/A |
| Récompenses en crédits | ✗ Non | ✓ 1-5 credits | ✓ 2-10 credits | ✗ N/A |

---

### Architecture

#### 1. Composants

**`PostPromptAdBar.tsx`** - Barre publicitaire affichée sous chaque réponse
- Affiche l'image, le texte et le CTA de la publicité
- Gère les clics et les récompenses
- Non-supprimable pour les utilisateurs FREE
- Animations smooth avec notifications de récompense

**Fichier :** `src/components/advertising/post-prompt-ad-bar.tsx`

```tsx
<PostPromptAdBar
  campaign={adCampaign}
  userId={user.id}
  userPlan={user.plan}
  sessionId={sessionId}
  impressionId={impressionId}
  onDismiss={() => { /* retirer l'ad */ }}
/>
```

#### 2. Logique métier (ad-engine.ts)

Deux nouvelles méthodes :

**`getPromptAd(userId, userPlan, sessionId, context)`**
- Sélectionne la meilleure publicité à afficher
- Applique le ciblage par keywords
- Respecte les frequency caps
- Crée une impression record en base de données

```ts
const adResult = await adEngine.getPromptAd(
  userId,
  'free',
  sessionId,
  { keywords: ['python', 'code'] }
);

// Retourne : { campaign, impressionId }
```

**`shouldShowPromptAd(userId, userPlan)`**
- Détermine si une pub doit être affichée
- Vérifier que l'utilisateur a activé les pubs récompensées (premium)
- FREE users retournent toujours true

```ts
const show = await adEngine.shouldShowPromptAd(userId, 'free');
// true - affichera les pubs
```

#### 3. Intégration au Chat

**`chat-interface.tsx`**

Après chaque réponse de l'assistant :

1. Extraire les keywords du message
2. Appeler `loadPromptAd(message)`
3. Ajouter `promptAd` au message
4. Afficher `<PostPromptAdBar />` sous le message

```tsx
// Après le streaming de la réponse
const promptAd = await loadPromptAd(assistantMessage);
if (promptAd) {
  setMessages(msgs => {
    const updated = [...msgs];
    updated[lastIndex].promptAd = promptAd;
    return updated;
  });
}
```

#### 4. API Endpoints

**POST `/api/advertising/record-impression`**
- Enregistre une vue de publicité
- Crédite les utilisateurs premium (rewards)
- Crédite la campagne en budget dépensé

```bash
curl -X POST /api/advertising/record-impression \
  -H "Content-Type: application/json" \
  -d '{
    "impressionId": "imp_123",
    "campaignId": "camp_456",
    "userId": "user_789",
    "sessionId": "sess_000",
    "adType": "rewarded"
  }'
```

**POST `/api/advertising/record-click`**
- Enregistre un clic utilisateur
- Crédite les utilisateurs premium (rewards supérieures)
- Redirection vers l'URL du CTA

```bash
curl -X POST /api/advertising/record-click \
  -H "Content-Type: application/json" \
  -d '{
    "impressionId": "imp_123",
    "userId": "user_789",
    "adType": "rewarded"
  }'
```

---

### Flux utilisateur

#### Utilisateur FREE

```
┌─────────────────────────────────────────────────────┐
│ Message utilisateur: "Comment coder en Python?"     │
└──────────────┬──────────────────────────────────────┘
               │
               ▼
    ┌──────────────────────┐
    │ Assistant génère     │
    │ réponse complète     │
    └──────────┬───────────┘
               │
               ▼
    ┌──────────────────────────────────────┐
    │ Système charge une pub               │
    │ (obligatoire, sans récompense)       │
    └──────────┬──────────────────────────┘
               │
               ▼
    ┌──────────────────────────────────────┐
    │ Affiche: PostPromptAdBar             │
    │ Bouton Fermer: DÉSACTIVÉ (FREE user) │
    │ Récompense: AUCUNE                   │
    └──────────────────────────────────────┘
```

#### Utilisateur PREMIUM

```
┌─────────────────────────────────────────────────────┐
│ Message utilisateur: "Analyse ce dataset"           │
└──────────────┬──────────────────────────────────────┘
               │
               ▼
    ┌──────────────────────┐
    │ Assistant génère     │
    │ réponse complète     │
    └──────────┬───────────┘
               │
               ▼
    ┌──────────────────────────────────────┐
    │ Système charge une pub               │
    │ (si opt-in requis, sinon obligatoire)│
    └──────────┬──────────────────────────┘
               │
               ▼
    ┌──────────────────────────────────────┐
    │ Affiche: PostPromptAdBar             │
    │ Bouton Fermer: ACTIVÉ                │
    │ Récompense au clic: +5 crédits       │
    └──────────┬──────────────────────────┘
               │
        Utilisateur clique
               │
               ▼
    ┌──────────────────────────────────────┐
    │ ✓ Pop-up récompense: +5 crédits      │
    │ ✓ Redirection URL campagne           │
    │ ✓ Mise à jour solde crédits          │
    └──────────────────────────────────────┘
```

---

### Gestion des récompenses

Les récompenses sont gérées via deux systèmes :

#### 1. Client-side (localStorage) - `ad-rewards.ts`

**Anti-abuse protections :**
- Max 10 récompenses/heure
- Max 50 récompenses/jour
- Cooldown 30 secondes entre chaque
- Détection des doublons (5 min)

```ts
const result = awardAdReward(campaignId, 'click', 'pro');
// { success: true, credits: 5, balance, message }
```

#### 2. Server-side (DB) - `ad-engine.ts`

- Enregistrement permanent en base de données
- Validation de la campagne et du budget
- Audit trail pour compliance
- Synchronisation des crédits globaux

```ts
const reward = await adEngine.recordClick(impressionId);
// { rewardCredited: true, rewardAmount: 5, redirectUrl: '...' }
```

---

### Configuration des campagnes

Créer une campagne publicitaire :

```ts
const campaign = await adEngine.createCampaign({
  name: 'Promotion été 2024',
  description: 'Offre spéciale coding tools',
  advertiserName: 'Acme Corp',
  advertiserUrl: 'https://acme.com',
  imageUrl: '/ads/acme-promo.jpg',
  textContent: 'Essayez notre outil de debugging révolutionnaire',
  ctaText: 'Découvrir',
  ctaUrl: 'https://acme.com/promo?utm_source=genovia',
  
  // Ciblage
  targetPlan: 'all', // 'free', 'premium', 'all'
  targetKeywords: 'python,coding,debug,development',
  targetAudience: 'developers',
  
  // Fréquence
  frequencyCap: 3, // Max 3 par jour par utilisateur
  
  // Budget & Récompenses
  budgetTotal: 1000,
  rewardPerView: 1, // 1 crédit par vue (premium users)
  rewardPerClick: 5, // 5 crédits par clic (premium users)
  costPerView: 0.01, // Coût interne par vue
  costPerClick: 0.05, // Coût interne par clic
  
  // Dates
  startAt: new Date('2024-06-01'),
  endAt: new Date('2024-08-31'),
  
  // Format
  format: 'banner',
  placement: 'bottom_bar'
});
```

---

### Schéma base de données

Modèles Prisma impliqués :

**`AdCampaign`** - Campagne publicitaire
```prisma
model AdCampaign {
  id String @id
  name String
  advertiserName String
  imageUrl String
  textContent String
  ctaText String
  ctaUrl String
  targetPlan String @default("all")
  placement String @default("bottom_bar")
  format String @default("banner")
  rewardPerView Float @default(0)
  rewardPerClick Float @default(0)
  budgetTotal Float @default(0)
  budgetSpent Float @default(0)
  status String @default("pending")
  isActive Boolean @default(true)
  frequencyCap Int?
  impressions AdImpression[]
  @@index([status, isActive])
}
```

**`AdImpression`** - Enregistrement d'une vue/clic
```prisma
model AdImpression {
  id String @id
  campaignId String
  userId String
  sessionId String
  adType String @default("unrewarded")
  viewDurationMs Int @default(0)
  wasClicked Boolean @default(false)
  rewardCredited Boolean @default(false)
  rewardAmount Float @default(0)
  campaign AdCampaign @relation(fields: [campaignId])
  user User @relation(fields: [userId])
  @@index([campaignId, createdAt])
  @@index([userId, createdAt])
}
```

**`AdUserPreference`** - Préférences utilisateur
```prisma
model AdUserPreference {
  id String @id
  userId String @unique
  adsEnabled Boolean @default(true)
  rewardedAdsEnabled Boolean @default(false)
  totalCreditsEarned Float @default(0)
  totalAdsViewed Int @default(0)
  totalAdsClicked Int @default(0)
  lastAdViewedAt DateTime?
  user User @relation(fields: [userId])
}
```

---

### Test & Debugging

#### Test local

Imiter un utilisateur FREE :

```tsx
<ChatInterface
  userId="test-user"
  plan="free"
  agent={agent}
  sessionId="test-session"
/>

// Résultat: Publicités affichées et non-supprimables
```

Imiter un utilisateur PREMIUM :

```tsx
<ChatInterface
  userId="test-user"
  plan="pro"
  agent={agent}
  sessionId="test-session"
/>

// Résultat: Publicités affichées ET supprimables, récompenses visibles
```

#### Inspecteur console

```ts
// Vérifier les impressions enregistrées
await fetch('/api/advertising/get-stats?userId=test-user')

// Vérifier le solde des crédits
localStorage.getItem('genova_credit_balance')

// Vérifier l'historique des récompenses
JSON.parse(localStorage.getItem('genova_ad_rewards_history'))
```

#### Métriques à surveiller

- **CTR (Click-Through Rate):** clics / impressions (cible: 2-5%)
- **Conversion de récompenses:** clics récompensés / clics (cible: 95%+)
- **Budget efficiency:** clics / budget dépensé (optimiser)
- **User satisfaction:** pas de plaintes relative aux pubs (surveiller)

---

### Performance & Optimization

**Caching des campagnes :**
```ts
const CAMPAIGN_CACHE_TTL = 30_000; // 30 secondes
// Les campagnes actives sont mises en cache pour éviter requêtes DB constantes
```

**Frequency capping :**
```ts
const userKey = `${userId}:${sessionId}`;
const userImpressions = recentImpressions.get(userKey) || [];
const recentCount = userImpressions
  .filter(t => t > Date.now() - 3600000) // 1 heure
  .length;
// Limiter les impressions par utilisateur
```

**Async ad loading :**
```ts
// Load ads après streaming pour ne pas bloquer UX
(async () => {
  const ad = await loadPromptAd(message);
  setMessages(msgs => updateWithAd(msgs, ad));
})();
```

---

### Dépannage

**Q: Les publicités ne s'affichent pas**
- Vérifier que `shouldShowPromptAd()` retourne true
- Vérifier la campagne est en statut "active" et "isActive: true"
- Vérifier la date de campagne (startAt, endAt)
- Vérifier le budget n'est pas épuisé

**Q: Les crédits ne sont pas accordés**
- Vérifier le plan utilisateur (gratuit = pas de récompense)
- Vérifier que `rewardPerClick > 0` dans campagne
- Vérifier les limites anti-abuse (localStorage)
- Vérifier les logs serveur pour erreurs API

**Q: Les utilisateurs FREE peuvent fermer les pubs**
- Vérifier `isFreeUser` est correctement détecté
- Vérifier `canDismiss = !isFreeUser` dans logique
- Vérifier le plan est correctement passé en prop

---

### Roadmap future

- [ ] A/B testing des placements
- [ ] Targeting par géolocalisation
- [ ] Publicités vidéo avec rewards bonus
- [ ] Dashboard advertiser pour analytics
- [ ] Integration avec systèmes publicitaires externes (Google Ads, etc)
- [ ] Dynamic reward adjustments basés sur performance
- [ ] Personnalisation par catégories d'intérêts
