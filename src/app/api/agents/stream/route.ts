import { NextRequest } from "next/server";
import { llmStreamer } from "@/lib/agent/stream-llm";
import { logger } from "@/lib/logger";




export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { message, userId } = body;

    if (!message || typeof message !== "string" || message.trim().length === 0) {
      return new Response(JSON.stringify({ error: "Message requis" }), { status: 400, headers: { "Content-Type": "application/json" } });
    }
    if (message.length > 4000) {
      return new Response(JSON.stringify({ error: "Message trop long (max 4000 caractères)" }), { status: 400, headers: { "Content-Type": "application/json" } });
    }

    const encoder = new TextEncoder();
    let isClosed = false;

    const stream = new ReadableStream({
      async start(controller) {
        const sendEvent = (event: Record<string, unknown>) => {
          if (isClosed) return;
          try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`)); } catch { isClosed = true; }
        };

        try {
          const config = { model: process.env.LLM_MODEL || "gpt-4o-mini", systemPrompt: `Tu es Genova, un assistant IA autonome intelligent. Réponds de façon concise et précise en français.` };
          for await (const event of llmStreamer.streamResponse(message, userId, config)) {
            if (isClosed) break;
            sendEvent(event);
            if (event.type === "error") break;
          }
        } catch (err) {
          logger.error("Stream error", { error: err });
          sendEvent({ type: "error", content: "Erreur lors du traitement de votre requête", timestamp: new Date().toISOString() });
        } finally {
          if (!isClosed) { try { controller.close(); } catch {} }
        }
      },
      cancel() { isClosed = true; },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (err) {
    logger.error("Stream route error", { error: err });
    return new Response(JSON.stringify({ error: "Erreur interne du serveur" }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}
