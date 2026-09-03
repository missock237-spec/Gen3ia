import { db } from "@/lib/db"
import { logger } from "@/lib/observability/logger"
import { exec } from "child_process"
import { writeFile, mkdir } from "fs/promises"
import { join } from "path"

/**
 * FineTuneManager — Gestion du fine-tuning asynchrone.
 * Collecte les traces d'exécution réussies, génère un dataset JSONL
 * au format instruction/response, crée un job de fine-tuning via
 * Unsloth ou Axolotl, et suit le statut.
 */

export type FineTuneEngine = "unsloth" | "axolotl"

export interface FineTuneConfig {
  engine: FineTuneEngine
  baseModel: string
  epochs: number
  learningRate: number
  batchSize: number
  maxSequenceLength: number
}

const DEFAULT_CONFIG: FineTuneConfig = {
  engine: "unsloth",
  baseModel: "unsloth/mistral-7b-instruct-v0.2",
  epochs: 3,
  learningRate: 2e-4,
  batchSize: 4,
  maxSequenceLength: 2048,
}

/**
 * FineTuneManager — Gère le cycle de vie complet du fine-tuning.
 */
export class FineTuneManager {
  /**
   * Collecte les traces d'exécution réussies pour générer un dataset.
   */
  async collectDataset(userId: string, limit = 500): Promise<Array<{ instruction: string; response: string }>> {
    const tasks = await db.task.findMany({
      where: { userId, status: "COMPLETED" },
      select: { prompt: true, result: true, analysis: true, plans: true, executionLog: true },
      take: limit,
      orderBy: { createdAt: "desc" },
    })

    const dataset: Array<{ instruction: string; response: string }> = []
    for (const task of tasks) {
      if (!task.result) continue
      const result = JSON.parse(task.result)
      const response = typeof result === "string" ? result : result.answer ?? JSON.stringify(result)
      dataset.push({
        instruction: task.prompt,
        response,
      })
    }

    logger.info("Dataset de fine-tuning collecté", { userId, size: dataset.length })
    return dataset
  }

  /**
   * Génère le fichier dataset JSONL au format instruction/response.
   */
  async generateDatasetFile(userId: string, jobId: string): Promise<string> {
    const dataset = await this.collectDataset(userId)
    const datasetDir = join(process.cwd(), "data", "finetune", jobId)
    await mkdir(datasetDir, { recursive: true })
    const filePath = join(datasetDir, "dataset.jsonl")

    const lines = dataset.map((d) => JSON.stringify({
      instruction: d.instruction,
      output: d.response,
    }))
    await writeFile(filePath, lines.join("\n"))

    await db.fineTuneJob.update({
      where: { id: jobId },
      data: { datasetPath: filePath, datasetSize: dataset.length },
    })

    return filePath
  }

  /**
   * Crée un job de fine-tuning.
   */
  async createJob(userId: string, name: string, config: Partial<FineTuneConfig> = {}): Promise<string> {
    const fullConfig = { ...DEFAULT_CONFIG, ...config }
    const job = await db.fineTuneJob.create({
      data: {
        userId,
        name,
        status: "QUEUED",
        baseModel: fullConfig.baseModel,
        engine: fullConfig.engine,
        config: JSON.stringify(fullConfig),
      },
    })

    logger.info("Job de fine-tuning créé", { jobId: job.id, userId, engine: fullConfig.engine })
    return job.id
  }

  /**
   * Démarre le fine-tuning via Unsloth ou Axolotl (subprocess Python).
   */
  async startJob(jobId: string): Promise<void> {
    const job = await db.fineTuneJob.findUniqueOrThrow({ where: { id: jobId } })
    const config = JSON.parse(job.config ?? "{}") as FineTuneConfig

    await db.fineTuneJob.update({
      where: { id: jobId },
      data: { status: "RUNNING", startedAt: new Date() },
    })

    // Générer le dataset s'il n'existe pas encore
    const datasetPath = job.datasetPath ?? await this.generateDatasetFile(job.userId, jobId)

    // Script de fine-tuning (simplifié pour Unsloth/Axolotl)
    const scriptPath = join(process.cwd(), "scripts", "finetune_run.py")
    const script = config.engine === "unsloth" ? `
from unsloth import FastLanguageModel
import json, sys

model, tokenizer = FastLanguageModel.from_pretrained("${config.baseModel}")
model = FastLanguageModel.get_peft_model(model, r=16, target_modules=["q_proj", "k_proj", "v_proj", "o_proj"])

with open("${datasetPath}") as f:
    dataset = [json.loads(line) for line in f]

# Training loop
trainer = FastLanguageModel.for_training(model)
trainer.train(dataset, epochs=${config.epochs}, lr=${config.learningRate})
model.save_pretrained("./data/finetune/${jobId}/model")
print("DONE")
` : `
# Axolotl config
import yaml
config = {
  "base_model": "${config.baseModel}",
  "datasets": [{"path": "${datasetPath}", "type": "instruccion"}],
  "epochs": ${config.epochs},
  "learning_rate": ${config.learningRate},
  "batch_size": ${config.batchSize},
}
with open("./data/finetune/${jobId}/config.yml", "w") as f:
    yaml.dump(config, f)
print("DONE")
`
    await writeFile(scriptPath, script)

    // Exécution asynchrone via subprocess
    exec(`python3 ${scriptPath}`, {
      timeout: 300_000, // 5 min max
      env: { ...process.env },
    }, async (err, stdout, stderr) => {
      if (err) {
        await db.fineTuneJob.update({
          where: { id: jobId },
          data: { status: "FAILED", error: stderr.substring(0, 500), finishedAt: new Date() },
        })
        logger.error("Fine-tuning échec", { jobId, error: stderr })
      } else {
        await db.fineTuneJob.update({
          where: { id: jobId },
          data: { status: "COMPLETED", metrics: JSON.stringify({ stdout: stdout.substring(0, 1000) }), finishedAt: new Date() },
        })
        logger.info("Fine-tuning terminé", { jobId })
      }
    })
  }

  /**
   * Récupère le statut d'un job.
   */
  async getJobStatus(jobId: string, userId: string) {
    const job = await db.fineTuneJob.findFirst({ where: { id: jobId, userId } })
    if (!job) return null
    return {
      id: job.id,
      name: job.name,
      status: job.status,
      engine: job.engine,
      baseModel: job.baseModel,
      datasetSize: job.datasetSize,
      metrics: job.metrics ? JSON.parse(job.metrics) : null,
      error: job.error,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
    }
  }

  /**
   * Annule un job en cours.
   */
  async cancelJob(jobId: string, userId: string): Promise<boolean> {
    await db.fineTuneJob.updateMany({
      where: { id: jobId, userId, status: { in: ["QUEUED", "RUNNING"] } },
      data: { status: "CANCELLED", finishedAt: new Date() },
    })
    return true
  }
}

export const fineTuneManager = new FineTuneManager()
