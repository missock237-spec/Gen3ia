/**
 * SebPay Client — Plans et utilitaires pour le paiement Mobile Money africain
 * Module stub pour permettre le build. L'implémentation complète est dans @/lib/sebpay.
 */

export const SUBSCRIPTION_PLANS = [
  { id: 'free', name: 'Gratuit', price: 0, priceUSD: 0, credits: 100, maxAgents: 2, features: ['2 agents IA', '100 crédits/mois', 'Outils de base', 'Support communautaire'] },
  { id: 'starter', name: 'Starter', price: 5000, priceUSD: 9.99, credits: 1000, maxAgents: 5, features: ['5 agents IA', '1000 crédits/mois', 'Tous les outils', 'Support email'] },
  { id: 'pro', name: 'Pro', price: 15000, priceUSD: 29.99, credits: 5000, maxAgents: 20, features: ['20 agents IA', '5000 crédits/mois', 'Outils avancés', 'Support prioritaire'], popular: true },
  { id: 'enterprise', name: 'Enterprise', price: 50000, priceUSD: 99.99, credits: -1, maxAgents: -1, features: ['Agents illimités', 'Crédits illimités', 'Support dédié', 'SLA garanti'] },
];

export function getPlanById(planId: string) {
  return SUBSCRIPTION_PLANS.find(p => p.id === planId);
}
