import { db } from "@/lib/db"
import { chat } from "@/lib/ai"
import { creditsForTokens } from "@/lib/ai/router"
import { chargeCredits } from "@/lib/credits/ledger"
import { searchKnowledge } from "@/lib/rag/retriever"
import { recallMemories } from "@/lib/memory/store"
import type { Agent, User } from "@prisma/client"

/**
 * Chat d'agent — inférence directe (mode conversation) avec injection
 * du prompt système de l'agent, de la base de connaissances (RAG) et
 * de la mémoire. Chaque échange est débité du Credit Ledger.
 */

export interface AgentChatMessage {
  role: "user" | "assistant"
  content: string
}

export async function agentChat(
  user: User,
  agent: Agent,
  message: string,
  history: AgentChatMessage[] = []
): Promise<{ answer: string; tokensIn: number; tokensOut: number; credits: number; latencyMs: number }> {
  // Contexte RAG propre à l'agent.
  let knowledge = ""
  try {
    const hits = await searchKnowledge(user.id, message, 3)
    if (hits.length > 0) {
      knowledge = hits.map((h) => `[${h.title}] ${h.text.slice(0, 700)}`).join("\n\n")
    }
  } catch {
    /* pas de connaissances */
  }

  const memories = await recallMemories(user.id, { agentId: agent.id, query: message, limit: 4 })
  const memoryBlock = memories.length
    ? `Mémoire pertinente :\n- ${memories.map((m) => m.content).join("\n- ")}`
    : ""

  const systemParts: string[] = []
  if (agent.systemPrompt) {
    systemParts.push(agent.systemPrompt)
  } else {
    systemParts.push(
      `Tu es ${agent.name}, un agent IA de la plateforme GEN3IA. Réponds de façon précise, utile et structurée, en français.`
    )
  }
  if (agent.description) systemParts.push(`Mission : ${agent.description}`)
  if (knowledge) systemParts.push(`Base de connaissances :\n${knowledge.slice(0, 2500)}`)
  if (memoryBlock) systemParts.push(memoryBlock)

  const trimmedHistory = history.slice(-10).map((h) => ({
    role: h.role,
    content: h.content.slice(0, 4000),
  }))

  const result = await chat({
    messages: [
      { role: "system", content: systemParts.join("\n\n") },
      ...trimmedHistory,
      { role: "user", content: message.slice(0, 8000) },
    ],
    provider: agent.provider === "auto" ? undefined : agent.provider,
    temperature: agent.temperature,
    maxTokens: agent.maxTokens,
    taskType: "CHAT",
  })

  const credits = Math.max(0.01, creditsForTokens(result.provider, result.model, result.tokensIn, result.tokensOut))
  await chargeCredits(user.id, credits, {
    type: "TASK_EXECUTION",
    description: `Chat agent « ${agent.name} » — ${result.tokensIn}/${result.tokensOut} tokens`,
    refType: "agent",
    refId: agent.id,
  })

  return {
    answer: result.content,
    tokensIn: result.tokensIn,
    tokensOut: result.tokensOut,
    credits: Math.round(credits * 1000) / 1000,
    latencyMs: result.latencyMs,
  }
}

/** Slug lisible pour un agent (publication / endpoint public). */
export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "agent"
  )
}

export async function uniqueSlug(name: string): Promise<string> {
  const base = slugify(name)
  let slug = base
  let suffix = 1
   
  while (true) {
    const exists = await db.agent.findUnique({ where: { slug }, select: { id: true } })
    if (!exists) return slug
    slug = `${base}-${suffix++}`
    if (suffix > 100) return `${base}-${Date.now()}`
  }
}
