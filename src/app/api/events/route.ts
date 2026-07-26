import { NextRequest } from 'next/server';
import { createLogger } from '@/lib/logger';
import { db } from '@/lib/db';

const log = createLogger('events-sse');

interface SSEEvent {
  type: 'llm_completion' | 'voice_call' | 'credit_deduction' | 'agent_execution' | 'image_generation' | 'system_alert';
  data: Record<string, unknown>;
  timestamp: string;
}

interface SSEClient {
  id: string;
  userId: string;
  controller: ReadableStreamDefaultController;
  filters?: string[];
}

const clients = new Map<string, SSEClient>();

function generateClientId(): string {
  return `sse_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function sendToClient(client: SSEClient, event: SSEEvent): void {
  try {
    const encoder = new TextEncoder();
    const message = `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
    client.controller.enqueue(encoder.encode(message));
  } catch (err) {
    log.warn('SSE send error, removing client', { clientId: client.id });
    clients.delete(client.id);
  }
}

export async function broadcastEvent(event: SSEEvent): Promise<void> {
  if (clients.size === 0) return;

  const timestamp = new Date().toISOString();
  const fullEvent = { ...event, timestamp };

  for (const [id, client] of clients) {
    if (client.filters && client.filters.length > 0) {
      if (!client.filters.includes(event.type)) continue;
    }
    sendToClient(client, fullEvent);
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId') || 'anonymous';
  const filtersParam = searchParams.get('filters');
  const filters = filtersParam ? filtersParam.split(',') : undefined;

  const clientId = generateClientId();

  const stream = new ReadableStream({
    start(controller) {
      const client: SSEClient = { id: clientId, userId, controller, filters };
      clients.set(clientId, client);

      log.info('SSE client connected', { clientId, userId, activeClients: clients.size });

      // Envoyer un événement de connexion initial
      const encoder = new TextEncoder();
      const initEvent = {
        type: 'connected',
        data: { clientId, message: 'Connexion SSE établie', activeClients: clients.size },
        timestamp: new Date().toISOString(),
      };
      controller.enqueue(encoder.encode(`event: connected\ndata: ${JSON.stringify(initEvent)}\n\n`));

      // Heartbeat toutes les 30s
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`:heartbeat\n\n`));
        } catch {
          clearInterval(heartbeat);
          clients.delete(clientId);
        }
      }, 30000);

      // Nettoyage à la déconnexion
      request.signal.addEventListener('abort', () => {
        clearInterval(heartbeat);
        clients.delete(clientId);
        log.info('SSE client disconnected', { clientId, remainingClients: clients.size });
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

/**
 * Hook pour tracker les événements depuis n'importe où dans l'app
 */
export async function trackEvent(
  type: SSEEvent['type'],
  data: Record<string, unknown>,
  options?: { async?: boolean }
): Promise<void> {
  const event: SSEEvent = {
    type,
    data,
    timestamp: new Date().toISOString(),
  };

  if (options?.async === false) {
    await broadcastEvent(event);
  } else {
    broadcastEvent(event).catch(err =>
      log.warn('Async broadcast failed', { error: err instanceof Error ? err.message : String(err) })
    );
  }
}
