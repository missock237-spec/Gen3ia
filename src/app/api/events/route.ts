import { NextRequest } from 'next/server';
import { createLogger } from '@/lib/logger';

const log = createLogger('events');

interface SSEClient {
  id: string;
  userId: string;
  controller: ReadableStreamDefaultController;
  encoder: TextEncoder;
}

class EventManager {
  private clients: Map<string, SSEClient[]> = new Map();
  private encoder = new TextEncoder();

  addClient(client: SSEClient): void {
    const existing = this.clients.get(client.userId) || [];
    existing.push(client);
    this.clients.set(client.userId, existing);
    log.debug('SSE client connected', { userId: client.userId, clientId: client.id });
    this.sendToClient(client, { type: 'connected', data: { clientId: client.id, timestamp: new Date().toISOString() } });
  }

  removeClient(client: SSEClient): void {
    const existing = this.clients.get(client.userId) || [];
    const filtered = existing.filter(c => c.id !== client.id);
    if (filtered.length === 0) {
      this.clients.delete(client.userId);
    } else {
      this.clients.set(client.userId, filtered);
    }
    log.debug('SSE client disconnected', { userId: client.userId, clientId: client.id });
  }

  sendToClient(client: SSEClient, event: { type: string; data: unknown }): void {
    try {
      const payload = `event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`;
      client.controller.enqueue(client.encoder.encode(payload));
    } catch (err) {
      log.warn('SSE send failed (client disconnected)', { clientId: client.id, error: err instanceof Error ? err.message : String(err) });
      this.removeClient(client);
    }
  }

  broadcast(userId: string, type: string, data: unknown): void {
    const clients = this.clients.get(userId) || [];
    for (const client of clients) {
      this.sendToClient(client, { type, data });
    }
  }

  broadcastAll(type: string, data: unknown): void {
    for (const [, clients] of this.clients) {
      for (const client of clients) {
        this.sendToClient(client, { type, data });
      }
    }
  }

  getStats(): { totalClients: number; totalUsers: number } {
    let totalClients = 0;
    for (const [, clients] of this.clients) {
      totalClients += clients.length;
    }
    return { totalClients, totalUsers: this.clients.size };
  }
}

// Singleton global
const eventManager = new EventManager();

export function getEventManager(): EventManager {
  return eventManager;
}

// Fonction utilitaire pour broadcast depuis d'autres parties du code
export function notifyUser(userId: string, type: string, data: unknown): void {
  eventManager.broadcast(userId, type, data);
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId') || 'anonymous';

  const stream = new ReadableStream({
    start(controller) {
      const clientId = `sse_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      const client: SSEClient = {
        id: clientId,
        userId,
        controller,
        encoder: new TextEncoder(),
      };

      eventManager.addClient(client);

      // Envoi d'un keepalive toutes les 30 secondes
      const keepalive = setInterval(() => {
        try {
          const payload = `:keepalive\n\n`;
          controller.enqueue(new TextEncoder().encode(payload));
        } catch {
          clearInterval(keepalive);
        }
      }, 30_000);

      // Nettoyage a la fermeture
      request.signal.addEventListener('abort', () => {
        clearInterval(keepalive);
        eventManager.removeClient(client);
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

// Endpoint POST pour emettre un evenement (interne)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, type, data } = body;

    if (!type) {
      return new Response(JSON.stringify({ error: 'Le champ type est requis' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (userId) {
      eventManager.broadcast(userId, type, data || {});
    } else {
      eventManager.broadcastAll(type, data || {});
    }

    const stats = eventManager.getStats();

    return new Response(JSON.stringify({ success: true, clientsNotified: stats.totalClients }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Erreur interne' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// Endpoint stats
export async function PUT() {
  const stats = eventManager.getStats();
  return new Response(JSON.stringify({ success: true, ...stats }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
