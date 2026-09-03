/**
 * Vérifie ensureSchema() sur une base VIERGE (simulation cold start serverless) :
 * les 42 tables doivent exister et être requêtables via Prisma.
 * Usage : DATABASE_URL=file:/tmp/fresh.db bun scripts/test-fresh-db.ts
 */
process.env.DATABASE_URL = process.env.DATABASE_URL ?? "file:/tmp/gen3ia-fresh-test.db"

async function main() {
  const { ensureSchema } = await import("../src/lib/db-init")
  const { db } = await import("../src/lib/db")
  await ensureSchema()

  // Requêtes sur des tables de CHAQUE vague du schéma (core v3.0 → v3.3 + Composio).
  const probes = [
    ["User (core)", () => db.user.count()],
    ["Task (core)", () => db.task.count()],
    ["MarketplaceReview (v3.2)", () => db.marketplaceReview.count()],
    ["ConnectedAccount (connecteurs locaux)", () => db.connectedAccount.count()],
    ["AgentListing (v3.3 marché)", () => db.agentListing.count()],
    ["SwarmSession (v3.3 swarm)", () => db.swarmSession.count()],
    ["Trace (v3.3 obs)", () => db.trace.count()],
    ["TraceSpan (v3.3 obs)", () => db.traceSpan.count()],
    ["WebhookDelivery (v3.3 webhooks)", () => db.webhookDelivery.count()],
    ["WatchExecution (v3.3 veille)", () => db.watchExecution.count()],
    ["ImmutableAuditLog (v3.3 audit)", () => db.immutableAuditLog.count()],
    ["ExplorationRun (v3.3 explore)", () => db.explorationRun.count()],
    ["BatchTask (v3.3 batch)", () => db.batchTask.count()],
    ["UserProfile (v3.3 profil)", () => db.userProfile.count()],
    ["FineTuneJob (v3.3 learning)", () => db.fineTuneJob.count()],
    ["AutoSkill (v3.3 learning)", () => db.autoSkill.count()],
    ["ExternalConnection (v3.3 bdd)", () => db.externalConnection.count()],
    ["SharedMemory (v3.3 swarm)", () => db.sharedMemory.count()],
    ["Purchase (v3.3 marché)", () => db.purchase.count()],
    ["TaskPriority (v3.3 priorités)", () => db.taskPriority.count()],
  ] as const

  let failed = 0
  for (const [label, probe] of probes) {
    try {
      await probe()
      console.log(`✅ ${label}`)
    } catch (err) {
      failed++
      console.log(`❌ ${label} — ${err instanceof Error ? err.message.split("\n")[0] : String(err)}`)
    }
  }
  await db.$disconnect()
  if (failed > 0) {
    console.log(`\nÉCHEC : ${failed} table(s) inaccessibles`)
    process.exit(1)
  }
  console.log(`\n✅ BASE VIERGE INITIALIZÉE — ${probes.length} tables requêtables`)
}

main().catch((e) => {
  console.error("FATAL:", e)
  process.exit(1)
})
