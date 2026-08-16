// ============================================================
// Gen3ia — Onboarding System
// ============================================================
//  Beaucoup d'utilisateurs en Afrique découvrent l'IA pour la
//  première fois avec Gen3ia. Un onboarding guidé les aide à
//  comprendre la valeur et à créer leur premier agent.
//  Bonus : +5 crédits à la fin de l'onboarding.
// ============================================================

import { db } from '@/lib/db';
import { createLogger } from '@/lib/logger';

const log = createLogger('onboarding');

export type OnboardingStep =
  | 'welcome'
  | 'create_agent'
  | 'configure_tools'
  | 'first_chat'
  | 'explore_billing'
  | 'set_guardrails'
  | 'complete';

export interface OnboardingState {
  userId: string;
  currentStep: OnboardingStep;
  completedSteps: OnboardingStep[];
  skippedSteps: OnboardingStep[];
  onboardingCompleted: boolean;
  startedAt: string;
  completedAt?: string;
}

export interface OnboardingProgress {
  step: OnboardingStep;
  stepNumber: number;
  totalSteps: number;
  percentage: number;
  isComplete: boolean;
  nextStep?: OnboardingStep;
}

const STEP_ORDER: OnboardingStep[] = [
  'welcome',
  'create_agent',
  'configure_tools',
  'first_chat',
  'explore_billing',
  'set_guardrails',
  'complete',
];

const WELCOME_BONUS_CREDITS = 5;

/**
 * Vérifie si un utilisateur a besoin de l'onboarding.
 */
export async function needsOnboarding(userId: string): Promise<boolean> {
  try {
    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) return false;
    const u = user as Record<string, unknown>;
    return !u.onboardingCompleted;
  } catch {
    return false;
  }
}

/**
 * Récupère l'état d'onboarding d'un utilisateur.
 */
export async function getOnboardingState(userId: string): Promise<OnboardingState> {
  const defaultState: OnboardingState = {
    userId,
    currentStep: 'welcome',
    completedSteps: [],
    skippedSteps: [],
    onboardingCompleted: false,
    startedAt: new Date().toISOString(),
  };

  try {
    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) return defaultState;
    const u = user as Record<string, unknown>;

    return {
      userId,
      currentStep: (u.onboardingStep as OnboardingStep) || 'welcome',
      completedSteps: (u.onboardingCompletedSteps as OnboardingStep[]) || [],
      skippedSteps: (u.onboardingSkippedSteps as OnboardingStep[]) || [],
      onboardingCompleted: (u.onboardingCompleted as boolean) || false,
      startedAt: (u.onboardingStartedAt as string) || new Date().toISOString(),
      completedAt: u.onboardingCompletedAt as string | undefined,
    };
  } catch {
    return defaultState;
  }
}

/**
 * Calcule la progression de l'onboarding.
 */
export function getOnboardingProgress(state: OnboardingState): OnboardingProgress {
  const stepNumber = STEP_ORDER.indexOf(state.currentStep) + 1;
  const totalSteps = STEP_ORDER.length;
  const percentage = Math.round((stepNumber / totalSteps) * 100);
  const nextIndex = STEP_ORDER.indexOf(state.currentStep) + 1;
  const nextStep = nextIndex < STEP_ORDER.length ? STEP_ORDER[nextIndex] : undefined;

  return {
    step: state.currentStep,
    stepNumber,
    totalSteps,
    percentage,
    isComplete: state.onboardingCompleted,
    nextStep,
  };
}

/**
 * Marque une étape comme terminée et passe à la suivante.
 */
export async function completeStep(
  userId: string,
  step: OnboardingStep
): Promise<{ success: boolean; nextStep?: OnboardingStep; error?: string }> {
  try {
    const state = await getOnboardingState(userId);

    if (state.onboardingCompleted) {
      return { success: true, nextStep: undefined };
    }

    const completedSteps = [...new Set([...state.completedSteps, step])];
    const nextIndex = STEP_ORDER.indexOf(step) + 1;
    const nextStep = nextIndex < STEP_ORDER.length ? STEP_ORDER[nextIndex] : 'complete';

    // Si c'est la dernière étape, marquer comme terminé
    if (step === 'set_guardrails' || nextStep === 'complete') {
      await finishOnboarding(userId, completedSteps, state.skippedSteps);
      return { success: true, nextStep: 'complete' };
    }

    // Sinon, mettre à jour l'étape courante
    await db.user.update({
      where: { id: userId },
      data: {
        onboardingStep: nextStep,
        onboardingCompletedSteps: completedSteps,
      } as Record<string, unknown>,
    }).catch(() => {});

    log.info('Onboarding step completed', { userId, step, nextStep });
    return { success: true, nextStep };
  } catch (err) {
    log.error('completeStep failed', { error: String(err) });
    return { success: false, error: 'Erreur lors de la mise à jour' };
  }
}

/**
 * Saute une étape et passe à la suivante.
 */
export async function skipStep(
  userId: string,
  step: OnboardingStep
): Promise<{ success: boolean; nextStep?: OnboardingStep; error?: string }> {
  try {
    const state = await getOnboardingState(userId);
    const skippedSteps = [...new Set([...state.skippedSteps, step])];
    const nextIndex = STEP_ORDER.indexOf(step) + 1;
    const nextStep = nextIndex < STEP_ORDER.length ? STEP_ORDER[nextIndex] : 'complete';

    if (nextStep === 'complete') {
      await finishOnboarding(userId, state.completedSteps, skippedSteps);
    } else {
      await db.user.update({
        where: { id: userId },
        data: {
          onboardingStep: nextStep,
          onboardingSkippedSteps: skippedSteps,
        } as Record<string, unknown>,
      }).catch(() => {});
    }

    log.info('Onboarding step skipped', { userId, step, nextStep });
    return { success: true, nextStep };
  } catch (err) {
    log.error('skipStep failed', { error: String(err) });
    return { success: false, error: 'Erreur lors du saut d\'étape' };
  }
}

/**
 * Termine l'onboarding et crédite le bonus.
 */
async function finishOnboarding(
  userId: string,
  completedSteps: OnboardingStep[],
  skippedSteps: OnboardingStep[]
): Promise<void> {
  await db.user.update({
    where: { id: userId },
    data: {
      onboardingStep: 'complete',
      onboardingCompleted: true,
      onboardingCompletedAt: new Date().toISOString(),
      onboardingCompletedSteps: completedSteps,
      onboardingSkippedSteps: skippedSteps,
      credits: 5, // Bonus de bienvenue
    } as Record<string, unknown>,
  }).catch(() => {});

  // Enregistrer la transaction de crédits bonus
  await db.creditTransaction.create({
    data: {
      userId,
      amount: WELCOME_BONUS_CREDITS,
      type: 'bonus',
      description: 'Bonus de bienvenue - Onboarding terminé',
      createdAt: new Date(),
    },
  }).catch(() => {});

  log.info('Onboarding completed', { userId, bonus: WELCOME_BONUS_CREDITS });
}

/**
 * Récupère l'étape suivante.
 */
export function getNextStep(currentStep: OnboardingStep): OnboardingStep | undefined {
  const index = STEP_ORDER.indexOf(currentStep);
  return index < STEP_ORDER.length - 1 ? STEP_ORDER[index + 1] : undefined;
}
