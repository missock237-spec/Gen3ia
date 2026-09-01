/* Test d'intégration du pipeline d'orchestration complet. */
import { db } from "../src/lib/db"
import { hashPassword } from "../src/lib/auth/password"
import { advanceTask } from "../src/lib/engines/orchestrator"

async function main() {
  // Nettoyage des données de test précédentes.
  const email = "pipeline-test@gen3ia.local"
  await db.user.deleteMany({ where: { email } })

  const user = await db.user.create({
    data: {
      email,
      name: "Test Pipeline",
      passwordHash: hashPassword("Test1234!"),
      credits: 100,
      settings: JSON.stringify({ maxAttempts: 3, confirmDangerousOps: false }),
    },
  })
  console.log("utilisateur créé :", user.id, "| crédits :", user.credits)

  const task = await db.task.create({
    data: {
      userId: user.id,
      prompt:
        "Calcule 17*23+4 et recherche sur le web la date de lancement de la fusée Ariane 6, puis rédige un paragraphe en français résumant ces deux informations.",
    },
  })
  console.log("tâche créée :", task.id)

  let current = await db.task.findUniqueOrThrow({ where: { id: task.id } })
  let rounds = 0
  while (!["COMPLETED", "FAILED", "CANCELLED", "WAITING_FOR_HUMAN"].includes(current.status) && rounds < 12) {
    rounds++
    current = await advanceTask(task.id)
    console.log(`\n— tour ${rounds} : statut = ${current.status} —`)
    if (current.status === "WAITING_FOR_HUMAN") {
      console.log("approbation requise (plan sensible) → approbation automatique pour le test")
      const { resolveHumanApproval } = await import("../src/lib/engines/orchestrator")
      current = await resolveHumanApproval(task.id, user.id, true, "test")
      current = await advanceTask(task.id)
      console.log(`reprise : statut = ${current.status}`)
    }
    if (current.error) console.log("erreur :", current.error.slice(0, 200))
  }

  const steps = await db.taskStep.findMany({
    where: { taskId: task.id },
    orderBy: [{ phase: "asc" }, { stepIndex: "asc" }],
  })
  console.log("\n=== ÉTAPES ===")
  for (const s of steps) {
    console.log(`[${s.phase}] ${s.title} — ${s.status}`)
  }

  if (current.status === "COMPLETED") {
    const result = JSON.parse(current.result ?? "{}")
    console.log("\n=== RÉPONSE FINALE (extrait) ===")
    console.log(String(result.answer).slice(0, 600))
    console.log("\n=== VÉRIFICATION ===")
    console.log(JSON.stringify(result.verification, null, 2).slice(0, 800))
    console.log("\ncoûts :", current.costCredits.toFixed(3), "crédits |",
      current.tokensIn, "tokens in /", current.tokensOut, "tokens out")

    const transactions = await db.transaction.findMany({ where: { userId: user.id } })
    console.log("\n=== LEDGER ===")
    for (const t of transactions) {
      console.log(`${t.type} : ${t.amount.toFixed(3)} → solde ${t.balanceAfter.toFixed(3)} — ${t.description.slice(0, 60)}`)
    }

    const memories = await db.memory.findMany({ where: { userId: user.id } })
    console.log("\nmémoires écrites :", memories.length, memories.map(m => `${m.layer}:${m.content.slice(0, 50)}`).slice(0, 3))

    const balance = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { credits: true } })
    console.log("\nsolde final :", balance.credits.toFixed(3))
    console.log("\n✅ PIPELINE COMPLET VALIDÉ")
  } else {
    console.error("\n❌ TÂCHE NON TERMINÉE :", current.status, current.error)
    const corrections = JSON.parse(current.correctionLog ?? "[]")
    console.error(JSON.stringify(corrections, null, 2).slice(0, 1500))
    process.exit(1)
  }

  // Nettoyage optionnel (gardé pour inspection) :
  // await db.user.deleteMany({ where: { email } })
}

main().catch((e) => {
  console.error("❌ ÉCHEC PIPELINE :", e)
  process.exit(1)
})
