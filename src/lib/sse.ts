/**
 * Server-Sent Events (SSE) pour le streaming des réponses des agents
 * Gère les connexions persistantes, la reconnexion automatique et le heartbeat
 */

import { randomBytes } from 'crypto';

export interface SSEConnection {
  id: string;
  userId: string;
  controller: ReadableStreamDefaultController;
  connectedAt: number;
  lastHeartbeat: number;
}

const connections = new Map<string, SSEConnection>();
const HEARTBEAT_INTERVAL = 15000; // 15 secondes
const CONNECTION_TIMEOUT = 60000; // 60 secondes sans heartbeat

export class SSEManager {
  private static instance: SSEManager;
  private heartbeatTimer: NodeJS.Timeout | null = null;

  private constructor() {
    this.startHeartbeat();
  }

  static getInstance(): SSEManager {
    if (!SSEManager.instance) {
      SSEManager.instance = new SSEManager();
    }
    return SSEManager.instance;
  }

  addConnection(userId: string, controller: ReadableStreamDefaultController): string {
    const id = `sse_${randomBytes(16).toString('hex')}`;
    const now = Date.now();

    connections.set(id, {
      id,
      userId,
      controller,
      connectedAt: now,
      lastHeartbeat: now,
    });

    // Envoyer l'ID de connexion
    this.sendToConnection(id, { type: 'connected', connectionId: id });

    return id;
  }

  removeConnection(id: string): void {
    connections.delete(id);
  }

  sendToConnection(connectionId: string, data: unknown): void {
    const conn = connections.get(connectionId);
    if (!conn) return;

    try {
      const message = `data: ${JSON.stringify(data)}\n\n`;
      const encoder = new TextEncoder();
      conn.controller.enqueue(encoder.encode(message));
      conn.lastHeartbeat = Date.now();
    } catch {
      this.removeConnection(connectionId);
    }
  }

  sendToUser(userId: string, data: unknown): void {
    const userConnections = Array.from(connections.values())
      .filter(c => c.userId === userId);

    for (const conn of userConnections) {
      this.sendToConnection(conn.id, data);
    }
  }

  broadcast(data: unknown): void {
    for (const conn of connections.values()) {
      this.sendToConnection(conn.id, data);
    }
  }

  getConnectionCount(): number {
    return connections.size;
  }

  getUserConnectionCount(userId: string): number {
    return Array.from(connections.values()).filter(c => c.userId === userId).length;
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      const now = Date.now();

      for (const [id, conn] of connections) {
        // Vérifier le timeout
        if (now - conn.lastHeartbeat > CONNECTION_TIMEOUT) {
          this.removeConnection(id);
          continue;
        }

        // Envoyer le heartbeat
        try {
          const message = `:heartbeat ${now}\n\n`;
          const encoder = new TextEncoder();
          conn.controller.enqueue(encoder.encode(message));
        } catch {
          this.removeConnection(id);
        }
      }
    }, HEARTBEAT_INTERVAL);
  }

  destroy(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }
    connections.clear();
  }
}

export function createSSEStream(userId: string): ReadableStream {
  return new ReadableStream({
    start(controller) {
      const manager = SSEManager.getInstance();
      const connectionId = manager.addConnection(userId, controller);

      // Headers SSE
      const encoder = new TextEncoder();
      controller.enqueue(encoder.encode('retry: 3000\n\n'));

      // Cleanup on close
      if (controller.signal) {
        controller.signal.addEventListener('abort', () => {
          manager.removeConnection(connectionId);
        });
      }
    },
    cancel() {
      // Nettoyage côté client
    },
  });
}

// Types d'événements SSE
export interface SSEAgentResponse {
  type: 'agent-response';
  conversationId: string;
  chunk: string;
  done: boolean;
  adDisplay?: boolean;
}

export interface SSECreditUpdate {
  type: 'credit-update';
  balance: number;
  change: number;
  reason: string;
}

export interface SSENotification {
  type: 'notification';
  id: string;
  title: string;
  message: string;
  severity: 'info' | 'warning' | 'success' | 'error';
}

export interface SSEAgentProgress {
  type: 'agent-progress';
  agentId: string;
  step: string;
  progress: number;
  status: 'running' | 'completed' | 'failed';
}
