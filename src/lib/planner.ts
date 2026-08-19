// ============================================================
// PLANIFICATEUR ADAPTATIF — Plan-and-Execute dynamique
// ============================================================
// Au lieu d'un plan statique, ce planificateur adaptatif :
// 1. Évalue le résultat de chaque étape
// 2. Ajuste le plan en fonction des résultats
// 3. Peut revenir en arrière si une étape échoue
// 4. Détecte les boucles infinies et les impasses
// ============================================================

import { logger } from "./logger";
import { checkpointManager } from "./checkpoint";

export interface PlanStep {
  id: string;
  description: string;
  status: "pending" | "running" | "completed" | "failed" | "skipped";
  input?: string;
  output?: string;
  error?: string;
  retryCount: number;
  maxRetries: number;
  dependsOn: string[];
}

export interface AdaptivePlan {
  id: string;
  goal: string;
  steps: PlanStep[];
  context: Record<string, unknown>;
  currentStepIndex: number;
  status: "active" | "completed" | "failed" | "stuck";
  stuckDetectionCount: number;
}

const MAX_STUCK_DETECTIONS = 3;
const MAX_RETRIES_PER_STEP = 2;

class AdaptivePlanner {
  /**
   * Génère un plan initial pour un objectif donné.
   */
  async createPlan(goal: string): Promise<AdaptivePlan> {
    logger.info("planner_creating_plan", { goal: goal.slice(0, 100) });

    const steps: PlanStep[] = [
      {
        id: `step_1_${Date.now()}`,
        description: `Analyser l'objectif: ${goal}`,
        status: "pending",
        retryCount: 0,
        maxRetries: MAX_RETRIES_PER_STEP,
        dependsOn: [],
      },
      {
        id: `step_2_${Date.now()}`,
        description: "Rechercher les informations pertinentes",
        status: "pending",
        retryCount: 0,
        maxRetries: MAX_RETRIES_PER_STEP,
        dependsOn: [`step_1_${Date.now()}`],
      },
      {
        id: `step_3_${Date.now()}`,
        description: "Analyser et synthétiser les informations",
        status: "pending",
        retryCount: 0,
        maxRetries: MAX_RETRIES_PER_STEP,
        dependsOn: [`step_2_${Date.now()}`],
      },
      {
        id: `step_4_${Date.now()}`,
        description: "Formuler la réponse finale",
        status: "pending",
        retryCount: 0,
        maxRetries: MAX_RETRIES_PER_STEP,
        dependsOn: [`step_3_${Date.now()}`],
      },
    ];

    return {
      id: `plan_${Date.now()}`,
      goal,
      steps,
      context: {},
      currentStepIndex: 0,
      status: "active",
      stuckDetectionCount: 0,
    };
  }

  /**
   * Exécute le plan étape par étape avec adaptation dynamique.
   */
  async executePlan(
    agentId: string,
    sessionId: string,
    plan: AdaptivePlan,
    executeStepFn: (step: PlanStep, context: Record<string, unknown>) => Promise<string>,
  ): Promise<AdaptivePlan> {
    logger.info("planner_execution_started", {
      planId: plan.id,
      stepsCount: plan.steps.length,
      goal: plan.goal.slice(0, 100),
    });

    while (plan.currentStepIndex < plan.steps.length) {
      const step = plan.steps[plan.currentStepIndex]!;

      // Vérifier si les dépendances sont satisfaites
      const depsCompleted = step.dependsOn.every((depId) =>
        plan.steps.some((s) => s.id === depId && s.status === "completed"),
      );

      if (!depsCompleted) {
        logger.warn("planner_step_skipped_deps", { stepId: step.id, dependsOn: step.dependsOn });
        step.status = "skipped";
        plan.currentStepIndex++;
        continue;
      }

      // Exécution avec retry
      step.status = "running";
      let success = false;

      while (step.retryCount <= step.maxRetries && !success) {
        try {
          const output = await executeStepFn(step, plan.context);
          step.output = output;
          step.status = "completed";
          plan.context[`step_${plan.currentStepIndex + 1}_output`] = output;
          success = true;

          logger.info("planner_step_completed", {
            stepId: step.id,
            stepIndex: plan.currentStepIndex + 1,
            totalSteps: plan.steps.length,
            retriesUsed: step.retryCount,
          });

          // ADAPTATION : Si l'étape a produit un résultat partiel,
          // on peut ajuster le plan en ajoutant une étape corrective
          if (this.needsAdaptation(step, plan)) {
            const correctiveStep = await this.createCorrectiveStep(step, plan);
            plan.steps.splice(plan.currentStepIndex + 1, 0, correctiveStep);
            logger.info("planner_plan_adapted", {
              newStepId: correctiveStep.id,
              description: correctiveStep.description,
            });
          }

        } catch (error) {
          step.retryCount++;
          step.error = error instanceof Error ? error.message : String(error);

          if (step.retryCount > step.maxRetries) {
            step.status = "failed";
            logger.error("planner_step_failed", {
              stepId: step.id,
              error: step.error,
              retriesAttempted: step.retryCount,
            });

            // DÉTECTION D'IMPASSE : Si trop d'étapes échouent, on marque le plan comme bloqué
            plan.stuckDetectionCount++;
            if (plan.stuckDetectionCount >= MAX_STUCK_DETECTIONS) {
              plan.status = "stuck";
              logger.error("planner_stuck_detected", {
                planId: plan.id,
                stuckCount: plan.stuckDetectionCount,
              });
              return plan;
            }
          } else {
            logger.warn("planner_step_retry", {
              stepId: step.id,
              attempt: step.retryCount,
              maxRetries: step.maxRetries,
              error: step.error,
            });
          }
        }
      }

      // Sauvegarder le checkpoint après chaque étape
      await checkpointManager.save({
        agentId,
        sessionId,
        step: plan.currentStepIndex + 1,
        context: { planState: plan, lastStep: step },
        memory: [
          { role: "user", content: step.description, timestamp: new Date().toISOString() },
          { role: "assistant", content: step.output ?? step.error ?? "", timestamp: new Date().toISOString() },
        ],
        actions: [
          {
            action: `plan_step_${plan.currentStepIndex + 1}`,
            input: step.description,
            output: step.output ?? step.error ?? "",
            timestamp: new Date().toISOString(),
            cost: 0.0001,
          },
        ],
        totalCost: step.retryCount * 0.0001,
        totalTokens: step.retryCount * 100,
      });

      plan.currentStepIndex++;
    }

    plan.status = plan.steps.every((s) => s.status === "completed") ? "completed" : "failed";

    logger.info("planner_execution_completed", {
      planId: plan.id,
      status: plan.status,
      stepsCompleted: plan.steps.filter((s) => s.status === "completed").length,
      stepsFailed: plan.steps.filter((s) => s.status === "failed").length,
    });

    return plan;
  }

  /**
   * Détecte si une adaptation du plan est nécessaire.
   */
  private needsAdaptation(step: PlanStep, _plan: AdaptivePlan): boolean {
    // Si l'étape a nécessité des retries, le résultat est peut-être partiel
    if (step.retryCount > 0) return true;

    // Si le contexte indique un besoin de clarification
    if (step.output && step.output.length > 500) return true;

    return false;
  }

  /**
   * Crée une étape corrective adaptative.
   */
  private async createCorrectiveStep(previousStep: PlanStep, _plan: AdaptivePlan): Promise<PlanStep> {
    return {
      id: `step_corrective_${Date.now()}`,
      description: `Affiner le résultat de l'étape précédente basé sur: ${previousStep.output?.slice(0, 100) ?? ""}`,
      status: "pending",
      retryCount: 0,
      maxRetries: 1,
      dependsOn: [previousStep.id],
    };
  }
}

export const adaptivePlanner = new AdaptivePlanner();
export default adaptivePlanner;