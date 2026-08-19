// ============================================================
// SSE STREAM — Streaming temps réel des réponses de l'agent
// ============================================================
// Affiche la réflexion de l'agent en temps réel :
//   🧠 Penser → ⚡ Agir → 👀 Observer
// Utilise le Server-Sent Events (Edge) pour une latence minimale.
// ============================================================

import { logger } from "./logger";

export type SSEEventType =
  | "agent.thinking"
  | "agent.action"
  | "agent.observation"
  | "agent.error"
  | "agent.complete"
  | "supervisor.decision";

export interface SSEEvent {
  event: SSEEventType;
  data: Record<string, unknown>;
  timestamp: string;
}

/**
 * Crée un transform stream pour le format SSE.
 */
function createSSEStream(): TransformStream<SSEEvent, Uint8Array> {
  const encoder = new TextEncoder();

  return new TransformStream({
    transform(event, controller) {
      const lines = [
        `event: ${event.event}`,
        `data: ${JSON.stringify(event.data)}`,
        `timestamp: ${event.timestamp}`,
        "",
        "",
      ];
      controller.enqueue(encoder.encode(lines.join("\n")));
    },
  });
}

/**
 * Génère une réponse SSE complète pour une exécution d'agent.
 * À utiliser dans une route Next.js App Router avec streaming.
 */
export async function streamAgentExecution(
  agentId: string,
  sessionId: string,
  input: string,
  signal?: AbortSignal,
): Promise<Response> {
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  const send = (event: SSEEventType, data: Record<string, unknown>) => {
    if (signal?.aborted) return;
    const lines = [
      `event: ${event}`,
      `data: ${JSON.stringify(data)}`,
      "",
      "",
    ];
    writer.write(encoder.encode(lines.join("\n")));
  };

  // Exécution asynchrone
  const execution = (async () => {
    try {
      send("agent.thinking", {
        agentId,
        sessionId,
        input: input.slice(0, 200),
        step: 0,
        message: "Initialisation de l'agent...",
      });

      // Simulation des étapes ReAct — REMPLACER par la vraie boucle
      const steps = [
        { thought: "Analyse de la requête...", action: "search_knowledge", observation: "Contexte trouvé dans la base" },
        { thought: "Génération de la réponse...", action: "llm_call", observation: "Réponse générée" },
        { thought: "Validation de la réponse...", action: "check_quality", observation: "Qualité OK" },
      ];

      for (let i = 0; i < steps.length; i++) {
        const step = steps[i]!;

        // Penser
        send("agent.thinking", {
          agentId,
          sessionId,
          step: i + 1,
          totalSteps: steps.length,
          message: step.thought,
        });
        await new Promise((resolve) => setTimeout(resolve, 500));

        // Agir
        send("agent.action", {
          agentId,
          sessionId,
          step: i + 1,
          action: step.action,
          message: `Action: ${step.action}`,
        });
        await new Promise((resolve) => setTimeout(resolve, 300));

        // Observer
        send("agent.observation", {
          agentId,
          sessionId,
          step: i + 1,
          observation: step.observation,
          message: `Observation: ${step.observation}`,
        });

        await new Promise((resolve) => setTimeout(resolve, 200));
      }

      // Complété
      send("agent.complete", {
        agentId,
        sessionId,
        steps: steps.length,
        message: "Agent a terminé son exécution",
      });

    } catch (error) {
      send("agent.error", {
        agentId,
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
      logger.error("sse_stream_error", { agentId, sessionId, error: String(error) });
    } finally {
      await writer.close();
    }
  })();

  execution.catch((err) => {
    logger.error("sse_execution_crashed", { agentId, sessionId, error: String(err) });
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

/**
 * Helper pour envoyer un événement SSE simple.
 */
export function sendSSEEvent(writer: WritableStreamDefaultWriter<Uint8Array>, event: SSEEventType, data: Record<string, unknown>): void {
  const encoder = new TextEncoder();
  const lines = [
    `event: ${event}`,
    `data: ${JSON.stringify(data)}`,
    "",
    "",
  ];
  writer.write(encoder.encode(lines.join("\n"))).catch(() => {});
}

export default streamAgentExecution;