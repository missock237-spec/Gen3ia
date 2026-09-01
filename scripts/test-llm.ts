/* Test de la couche IA : appel GLM réel via le SDK z-ai. */
import { chat } from "../src/lib/ai/index"
import { chatJSON } from "../src/lib/ai/structured"
import { z } from "zod"

async function main() {
  console.log("— Test 1 : chat simple —")
  const r = await chat({
    messages: [
      { role: "system", content: "Réponds en une phrase." },
      { role: "user", content: "Qu'est-ce que GEN3IA ?" },
    ],
    maxTokens: 100,
  })
  console.log("provider:", r.provider, "| model:", r.model, "| tokens:", r.tokensIn, "/", r.tokensOut)
  console.log("réponse:", r.content.slice(0, 200))

  console.log("\n— Test 2 : JSON structuré —")
  const schema = z.object({
    goals: z.array(z.string()).min(1),
    complexity: z.enum(["LOW", "MEDIUM", "HIGH"]),
  })
  const j = await chatJSON(
    {
      messages: [
        {
          role: "user",
          content:
            'Analyse cette demande et renvoie un JSON {"goals": string[], "complexity": "LOW"|"MEDIUM"|"HIGH"} : "Rédige un article de blog de 800 mots sur les agents IA en français."',
        },
      ],
      maxTokens: 300,
      taskType: "ANALYSIS",
    },
    schema
  )
  console.log("JSON valide :", JSON.stringify(j.data).slice(0, 200), "| réparation :", j.repairUsed)

  console.log("\n✅ Couche IA opérationnelle")
}

main().catch((e) => {
  console.error("❌ ÉCHEC :", e)
  process.exit(1)
})
