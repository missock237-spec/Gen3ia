import { NextRequest, NextResponse } from 'next/server';



// SSE (Server-Sent Events) pour le dashboard temps reel


export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get('userId');

  if (!userId) {
    return NextResponse.json({ error: 'userId requis' }, { status: 400 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      // Envoyer un evenement de connexion
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'connected', userId })}\n\n`));

      // Envoyer des evenements de test toutes les 10s (simulation)
      const interval = setInterval(() => {
        const events = [
          { type: 'llm_completion', data: { costUsd: Math.random() * 0.01 }, timestamp: new Date().toISOString() },
          { type: 'system_alert', data: { level: 'info', message: 'Système opérationnel' }, timestamp: new Date().toISOString() },
        ];
        const event = events[Math.floor(Math.random() * events.length)];
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch { clearInterval(interval); }
      }, 10000);

      // Cleanup à la déconnexion
      request.signal.addEventListener('abort', () => {
        clearInterval(interval);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
