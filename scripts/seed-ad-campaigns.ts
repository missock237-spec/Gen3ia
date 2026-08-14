// ============================================================
// seed-ad-campaigns.ts — Seed default link-only ad campaigns.
// ------------------------------------------------------------
// Run with:  npx tsx scripts/seed-ad-campaigns.ts
//
// Seeds a handful of link-only sponsored campaigns so the ad
// system has something to serve out of the box. Idempotent:
// re-running updates the same campaign ids.
// ============================================================

import { initializeApp, applicationDefault, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// --- Init Firebase Admin (uses GOOGLE_APPLICATION_CREDENTIALS by default) ---
if (getApps().length === 0) {
  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT
    ? cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))
    : applicationDefault();
  initializeApp({ credential: serviceAccount });
}

const db = getFirestore();

// --- Default link-only campaigns ---
// Each campaign is LINK ONLY: text content + CTA URL. No images, no videos.
const campaigns: Array<Record<string, unknown>> = [
  {
    id: 'camp_gen3ia_pro_upgrade',
    name: 'Passez à Gen3ia Pro',
    description: 'Campagne interne — incitation à upgrader vers le plan Pro',
    advertiserName: 'Gen3ia',
    advertiserUrl: 'https://gen3ia.com/pricing',
    textContent: 'Débloquez des agents illimités, un support prioritaire et 10 000 crédits/mois avec Gen3ia Pro.',
    ctaText: 'Voir les offres',
    ctaUrl: 'https://gen3ia.com/pricing',
    targetPlan: 'free',
    maxImpressions: 0,
    maxClicks: 0,
    rewardPerView: 0,
    rewardPerClick: 0,
    costPerView: 0,
    costPerClick: 0,
    budgetTotal: 0,
    budgetSpent: 0,
    status: 'active',
    startAt: null,
    endAt: null,
    isActive: true,
    placement: 'conversation_inline',
    targetKeywords: 'agent,credit,limite,gratuit',
    frequencyCap: 10,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'camp_partner_devtools',
    name: 'DevTools Pro — Extension navigateur',
    description: 'Campagne partenaire — outils de débogage IA pour développeurs',
    advertiserName: 'DevTools Pro',
    advertiserUrl: 'https://devtoolspro.example.com',
    textContent: 'Déboguez vos agents IA en temps réel avec DevTools Pro — extension navigateur gratuite.',
    ctaText: 'Installer gratuitement',
    ctaUrl: 'https://devtoolspro.example.com/install',
    targetPlan: 'paid',
    maxImpressions: 0,
    maxClicks: 0,
    rewardPerView: 1,
    rewardPerClick: 2,
    costPerView: 0.01,
    costPerClick: 0.05,
    budgetTotal: 100,
    budgetSpent: 0,
    status: 'active',
    startAt: null,
    endAt: null,
    isActive: true,
    placement: 'conversation_inline',
    targetKeywords: 'code,debug,développement,agent,api',
    frequencyCap: 20,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'camp_partner_cloud_storage',
    name: 'CloudStorage Africa — 50 Go offerts',
    description: 'Campagne partenaire — stockage cloud panafricain',
    advertiserName: 'CloudStorage Africa',
    advertiserUrl: 'https://cloudafrica.example.com',
    textContent: '50 Go de stockage cloud offerts pour tout nouvel inscrit CloudStorage Africa.',
    ctaText: 'J\'en profite',
    ctaUrl: 'https://cloudafrica.example.com/signup',
    targetPlan: 'all',
    maxImpressions: 0,
    maxClicks: 0,
    rewardPerView: 1,
    rewardPerClick: 3,
    costPerView: 0.01,
    costPerClick: 0.08,
    budgetTotal: 200,
    budgetSpent: 0,
    status: 'active',
    startAt: null,
    endAt: null,
    isActive: true,
    placement: 'conversation_inline',
    targetKeywords: 'stockage,fichier,cloud,sauvegarde',
    frequencyCap: 15,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'camp_partner_ai_course',
    name: 'Formation IA — École 221',
    description: 'Campagne partenaire — formation en intelligence artificielle',
    advertiserName: 'École 221',
    advertiserUrl: 'https://ecole221.example.com',
    textContent: 'Apprenez à construire vos propres agents IA en 8 semaines — certification reconnue.',
    ctaText: 'Découvrir la formation',
    ctaUrl: 'https://ecole221.example.com/ia',
    targetPlan: 'all',
    maxImpressions: 0,
    maxClicks: 0,
    rewardPerView: 1,
    rewardPerClick: 2,
    costPerView: 0.01,
    costPerClick: 0.04,
    budgetTotal: 150,
    budgetSpent: 0,
    status: 'active',
    startAt: null,
    endAt: null,
    isActive: true,
    placement: 'conversation_inline',
    targetKeywords: 'formation,cours,apprentissage,ia,intelligence',
    frequencyCap: 12,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

async function seed() {
  console.log(`🌱 Seeding ${campaigns.length} link-only ad campaigns…`);
  const batch = db.batch();
  for (const c of campaigns) {
    const ref = db.collection('ad_campaigns').doc(String(c.id));
    batch.set(ref, c, { merge: true });
    console.log(`  • ${c.id}  (${c.targetPlan})`);
  }
  await batch.commit();
  console.log('✅ Done.');
}

seed().catch(err => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
