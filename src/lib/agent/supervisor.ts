import { logger } from "@/lib/logger";

export class SupervisorAgent {
  private maxIterations = 20;
  private maxStagnantIterations = 3;
  private maxCostUsd = 5;
  private totalCostUsd = 0;
  private iterationHistory: Array<{ step: number; action: string; thought: string; result: string; timestamp: Date }> = [];
  private taskDescription = "";

  startTask(description: string) {
    this.taskDescription = description;
    this.iterationHistory = [];
    this.totalCostUsd = 0;
    logger.info("Supervisor: Tâche démarrée", { task: description.substring(0, 100) });
  }

  recordIteration(result: { step: number; action: string; thought: string; result: string; timestamp: Date }): { shouldStop: boolean; reason?: string } {
    this.iterationHistory.push(result);
    this.totalCostUsd += 0.002;

    if (this.iterationHistory.length >= this.maxIterations) {
      return { shouldStop: true, reason: "Nombre maximum d'itérations atteint" };
    }

    if (this.totalCostUsd >= this.maxCostUsd) {
      return { shouldStop: true, reason: "Coût maximum dépassé" };
    }

    if (this.iterationHistory.length >= this.maxStagnantIterations) {
      const lastResults = this.iterationHistory.slice(-this.maxStagnantIterations);
      const actions = lastResults.map(r => r.action);
      if (actions.every(a => a === actions[0])) {
        logger.error("Supervisor: Boucle infinie", { action: actions[0] });
        return { shouldStop: true, reason: `Boucle infinie: "${actions[0]}" répété ${this.maxStagnantIterations}x` };
      }
    }

    return { shouldStop: false };
  }

  getProgress() {
    return {
      task: this.taskDescription,
      iterations: this.iterationHistory.length,
      totalCostUsd: this.totalCostUsd,
      lastAction: this.iterationHistory[this.iterationHistory.length - 1]?.action,
    };
  }

  reset() {
    this.iterationHistory = [];
    this.totalCostUsd = 0;
    this.taskDescription = "";
  }
}

export const supervisor = new SupervisorAgent();
