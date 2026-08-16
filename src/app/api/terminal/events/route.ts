// ============================================================
// SSE — Événements temps réel pour le Terminal
// ============================================================
import { NextRequest, NextResponse } from "next/server";





export const dynamic = "force-dynamic";
const clients = new Map<string, ReadableStreamController<Uint8Array>>();

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") || "anonymous";

  const stream = new ReadableStream({
    start(controller) {
      clients.set(token, controller);

      // Envoyer un message de connexion
      const encoder = new TextEncoder();
      controller.enqueue(encoder.encode("data: {\"type\":\"connected\",\"message\":\"Terminal temps reel connecte\"}\n\n"));

      // Nettoyer à la déconnexion
      request.signal.addEventListener("abort", () => {
        clients.delete(token);
      });
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

// Fonction utilitaire pour envoyer un événement à un client
// Utilisable depuis n'importe quelle route
// NOTE: Next.js route files can only export route handlers (GET/POST/etc).
// This helper is internal — callers should use the SSE stream directly.
function sendTerminalEvent(token: string, event: { type: string; data: string }) {
  const controller = clients.get(token);
  if (!controller) return false;

  try {
    const encoder = new TextEncoder();
    controller.enqueue(encoder.encode(`event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`));
    return true;
  } catch {
    clients.delete(token);
    return false;
  }
}
