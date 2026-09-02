/* Debug : inspecte la réponse brute du planner. */
import { chat } from "../src/lib/ai"
import { extractJson } from "../src/lib/ai/structured"

const analysis = {
  intent: "Calculer et rechercher puis synthétiser",
  goals: ["Calculer 17*23+4", "Trouver la date de lancement d'Ariane 6", "Synthétiser en un paragraphe"],
  constraints: ["Réponse en français"],
  requiredCapabilities: ["calculator", "web_search"],
  risks: ["Information erronée"],
  successCriteria: ["Calcul correct", "Date exacte", "Paragraphe cohérent"],
  failureCriteria: ["Calcul faux"],
  estimatedComplexity: "LOW",
  estimatedSteps: 3,
  language: "fr",
  clarificationNeeded: false,
}

const SYSTEM = `Tu es le planificateur de GEN3IA. Pour toute demande, tu produis EXACTEMENT 5 plans nommés A, B, C, D, E, chacun avec une STRATÉGIE différente (directe, approfondie, économique, robuste, créative).

Squelette STRICT :
{"plans":[{"id":"A","name":"...","strategy":"...","steps":[{"title":"...","detail":"...","tool":"web_search"}],"requiredTools":["..."],"risks":["..."],"estimatedCostCredits":2,"successProbability":0.8,"rationale":"...","requiresHumanConfirmation":false}, ... B, C, D, E]}

Outils valides : web_search, page_reader, calculator, code_runner, knowledge_search, memory_recall, http_fetch, datetime.`

const r = await chat({
  messages: [
    { role: "system", content: SYSTEM },
    {
      role: "user",
      content:
        `Demande :\n"""\nCalcule 17*23+4 et cherche la date de lancement d'Ariane 6.\n"""\n\nAnalyse : ${JSON.stringify(analysis)}\n\nProduis les 5 plans (A-E) en JSON.`,
    },
  ],
  json: true,
  maxTokens: 4500,
  temperature: 0.5,
  taskType: "PLANNING",
})
console.log("=== BRUT (2000 premiers caractères) ===")
console.log(r.content.slice(0, 2000))
console.log("\n=== LONGUEUR ===", r.content.length, "| tokens:", r.tokensIn, "/", r.tokensOut)
try {
  const parsed = extractJson(r.content)
  console.log("=== TYPE ===", Array.isArray(parsed) ? "ARRAY" : typeof parsed, "| clés :", Array.isArray(parsed) ? parsed.length : Object.keys(parsed as Record<string, unknown>))
} catch (e) {
  console.error("extraction échouée :", e)
}
