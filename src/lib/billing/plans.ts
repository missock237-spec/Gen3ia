/**
 * Subscription Plans — Plan Tiers, Features & Limits
 */
import { db } from '@/lib/db';
import { createLogger } from '@/lib/logger';
const log = createLogger('plans');
export type PlanTier = 'free' | 'starter' | 'pro' | 'enterprise' | 'custom';
export interface PlanFeature { name: string; included: boolean; limit?: number | string; description?: string; }
export interface Plan { id: PlanTier; name: string; price: number; currency: string; interval: 'month' | 'year'; credits: number; stripePriceId: string; features: PlanFeature[]; limits: { agents: number; tasks: number; storage: number; apiCalls: number; teamMembers: number; scheduledTasks: number; webMonitors: number; reports: number; }; highlighted?: boolean; badge?: string; }
export interface CreditPackage { id: string; name: string; credits: number; price: number; currency: string; stripePriceId: string; pricePerCredit: number; }
export const PLANS: Plan[] = [
  { id: 'free', name: 'Free', price: 0, currency: 'usd', interval: 'month', credits: 100, stripePriceId: '', features: [{ name: '2 AI Agents', included: true, limit: 2 }, { name: '100 credits/month', included: true }, { name: 'Basic agent tools', included: true }, { name: 'Community support', included: true }, { name: 'Scheduled tasks', included: true, limit: 3 }, { name: 'Advanced guardrails', included: false }, { name: 'Custom web monitors', included: false }, { name: 'Priority support', included: false }, { name: 'Team workspace', included: false }], limits: { agents: 2, tasks: 50, storage: 100, apiCalls: 1000, teamMembers: 1, scheduledTasks: 3, webMonitors: 0, reports: 0 } },
  { id: 'starter', name: 'Starter', price: 9, currency: 'usd', interval: 'month', credits: 1000, stripePriceId: process.env.STRIPE_STARTER_PRICE_ID || 'price_starter', features: [{ name: '5 AI Agents', included: true, limit: 5 }, { name: '1,000 credits/month', included: true }, { name: 'All agent tools', included: true }, { name: 'Email support', included: true }, { name: 'Scheduled tasks', included: true, limit: 10 }, { name: 'Web monitors', included: true, limit: 5 }, { name: 'Advanced guardrails', included: true }, { name: 'Priority support', included: false }, { name: 'Team workspace', included: false }], limits: { agents: 5, tasks: 500, storage: 1024, apiCalls: 10000, teamMembers: 1, scheduledTasks: 10, webMonitors: 5, reports: 5 } },
  { id: 'pro', name: 'Pro', price: 29, currency: 'usd', interval: 'month', credits: 5000, stripePriceId: process.env.STRIPE_PRO_PRICE_ID || 'price_pro', highlighted: true, badge: 'Most Popular', features: [{ name: '20 AI Agents', included: true, limit: 20 }, { name: '5,000 credits/month', included: true }, { name: 'All agent tools + advanced', included: true }, { name: 'Priority support', included: true }, { name: 'Scheduled tasks', included: true, limit: 50 }, { name: 'Web monitors', included: true, limit: 25 }, { name: 'Advanced guardrails', included: true }, { name: 'Custom web monitors', included: true }, { name: 'Auto-reports', included: true }, { name: 'Team workspace (5 members)', included: true, limit: 5 }], limits: { agents: 20, tasks: -1, storage: 10240, apiCalls: 100000, teamMembers: 5, scheduledTasks: 50, webMonitors: 25, reports: 30 } },
  { id: 'enterprise', name: 'Enterprise', price: 99, currency: 'usd', interval: 'month', credits: -1, stripePriceId: process.env.STRIPE_ENTERPRISE_PRICE_ID || 'price_enterprise', badge: 'Best Value', features: [{ name: 'Unlimited AI Agents', included: true }, { name: 'Unlimited credits', included: true }, { name: 'All tools & features', included: true }, { name: 'Dedicated support', included: true }, { name: 'Unlimited scheduled tasks', included: true }, { name: 'Unlimited web monitors', included: true }, { name: 'Custom guardrails', included: true }, { name: 'SSO & SAML', included: true }, { name: 'Unlimited team members', included: true }, { name: 'Custom integrations', included: true }, { name: 'SLA guarantee', included: true }], limits: { agents: -1, tasks: -1, storage: -1, apiCalls: -1, teamMembers: -1, scheduledTasks: -1, webMonitors: -1, reports: -1 } },
  { id: 'custom', name: 'Custom', price: 0, currency: 'usd', interval: 'month', credits: -1, stripePriceId: '', features: [{ name: 'Custom agent limit', included: true }, { name: 'Custom credit allocation', included: true }, { name: 'All tools & features', included: true }, { name: 'Dedicated account manager', included: true }, { name: 'Custom SLA', included: true }, { name: 'On-premise deployment option', included: true }], limits: { agents: -1, tasks: -1, storage: -1, apiCalls: -1, teamMembers: -1, scheduledTasks: -1, webMonitors: -1, reports: -1 } },
];
export const CREDIT_PACKAGES: CreditPackage[] = [
  { id: 'credits_100', name: '100 Credits', credits: 100, price: 4.99, currency: 'usd', stripePriceId: process.env.STRIPE_CREDITS_100_PRICE_ID || 'price_credits_100', pricePerCredit: 0.0499 },
  { id: 'credits_500', name: '500 Credits', credits: 500, price: 19.99, currency: 'usd', stripePriceId: process.env.STRIPE_CREDITS_500_PRICE_ID || 'price_credits_500', pricePerCredit: 0.04 },
  { id: 'credits_2000', name: '2,000 Credits', credits: 2000, price: 59.99, currency: 'usd', stripePriceId: process.env.STRIPE_CREDITS_2000_PRICE_ID || 'price_credits_2000', pricePerCredit: 0.03 },
  { id: 'credits_5000', name: '5,000 Credits', credits: 5000, price: 129.99, currency: 'usd', stripePriceId: process.env.STRIPE_CREDITS_5000_PRICE_ID || 'price_credits_5000', pricePerCredit: 0.026 },
];
export const PLAN_CREDITS: Record<string, number> = { free: 100, starter: 1000, pro: 5000, enterprise: -1, custom: -1 };
export function getPlan(planId: PlanTier): Plan | undefined { return PLANS.find(p => p.id === planId); }
export function comparePlans(currentPlan: PlanTier, targetPlan: PlanTier): { isUpgrade: boolean; isDowngrade: boolean; isSame: boolean; priceDifference: number } {
  const current = getPlan(currentPlan); const target = getPlan(targetPlan);
  if (!current || !target) return { isUpgrade: false, isDowngrade: false, isSame: false, priceDifference: 0 };
  return { isSame: currentPlan === targetPlan, isUpgrade: target.price > current.price, isDowngrade: target.price < current.price, priceDifference: target.price - current.price };
}
export function hasPlanFeature(planId: PlanTier, featureName: string): boolean { return getPlan(planId)?.features.find(f => f.name === featureName)?.included ?? false; }
export function getPlanLimit(planId: PlanTier, resource: keyof Plan['limits']): number { return getPlan(planId)?.limits[resource] ?? 0; }
export async function changePlan(userId: string, targetPlan: PlanTier): Promise<{ success: boolean; message: string; newPlan: string }> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { plan: true } });
  if (!user) return { success: false, message: 'User not found', newPlan: 'free' };
  const comparison = comparePlans(user.plan as PlanTier, targetPlan);
  if (comparison.isSame) return { success: false, message: 'Already on this plan', newPlan: user.plan };
  if (comparison.isUpgrade) {
    const target = getPlan(targetPlan);
    if (!target?.stripePriceId) return { success: false, message: 'Plan not available', newPlan: user.plan };
    const { createCheckoutSession } = await import('./stripe-client');
    const session = await createCheckoutSession({ userId, priceId: target.stripePriceId, planId: targetPlan });
    return { success: true, message: `Upgrade to ${target.name} initiated.`, newPlan: user.plan };
  }
  return { success: true, message: `Downgrade to ${getPlan(targetPlan)?.name} at end of period.`, newPlan: user.plan };
}
export function getPlanComparison(): Array<{ feature: string; values: Record<PlanTier, string | number | boolean> }> {
  const allFeatures = new Set<string>();
  PLANS.forEach(p => p.features.forEach(f => allFeatures.add(f.name)));
  return Array.from(allFeatures).map(featureName => {
    const values = {} as Record<PlanTier, string | number | boolean>;
    PLANS.forEach(plan => { const f = plan.features.find(f => f.name === featureName); values[plan.id] = f?.limit ?? f?.included ?? false; });
    return { feature: featureName, values };
  });
}