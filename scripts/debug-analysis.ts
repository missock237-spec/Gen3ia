/* Debug : inspecte la réponse brute de l'analyse de prompt. */
import { chat } from "../src/lib/ai"
import { extractJson } from "../src/lib/ai/structured"
import { z } from "zod"

const schema = z.object({
  intent: z.string().min(3),
  goals: z.array(z.string()).min(1).max(8),
  constraints: z.array(z.string()).max(10),
  requiredCapabilities: z.array(z.string()).max(12),
  risks: z.array(z.string()).max(8),
  successCriteria: z.array(z.string()).min(1).max(6),
  failureCriteria: z.array(z.string()).max(6),
  estimatedComplexity: z.enum(["LOW", "MEDIUM", "HIGH"]),
  estimatedSteps: z.number().int().min(1).max(12),
  language: z.string().min(2).max(5),
  clarificationNeeded: z.boolean(),
})

const SYSTEM_PROMPT = `Tu es le moteur d'analyse de prompts de GEN3IA. Renvoie un JSON avec EXACTEMENT ces clés :
intent (string), goals (string[]), constraints (string[]), requiredCapabilities (string[]), risks (string[]), successCriteria (string[]), failureCriteria (string[]), estimatedComplexity ("LOW"|"MEDIUM"|"HIGH"), estimatedSteps (int), language (string), clarificationNeeded (bool).
Tous les champs sont OBLIGATOIRES — utilise [] si aucune valeur.`

const prompt = "Calcule 17*23+4 et cherche la date de lancement d'Ariane 6, puis résume en un paragraphe."

const r = await chat({
  messages: [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: `Demande : "${prompt}"\n\nRenvoie le JSON.` },
  ],
  json: true,
  maxTokens: 1500,
  temperature: 0.3,
})
console.log("=== BRUT ===")
console.log(r.content)
console.log("\n=== PARSÉ ===")
try {
  const parsed = extractJson(r.content)
  console.log(JSON.stringify(parsed, null, 2).slice(0, 1500))
  const check = schema.safeParse(parsed)
  console.log("\n=== VALIDATION ===", check.success ? "OK" : JSON.stringify(check.error.issues, null, 2).slice(0, 800))
} catch (e) {
  console.error("extraction échouée :", e)
}
