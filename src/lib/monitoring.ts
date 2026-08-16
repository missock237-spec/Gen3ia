// ============================================================
// Gen3ia — Collecteur de métriques (buffer → Prisma)
// FIX : import correct de `prisma` depuis './prisma' (db.ts exporte `db`, pas `prisma`).
// ============================================================
import { prisma } from './prisma';

interface MetricEntry {
  name: string;
  value: number;
  tags?: Record<string, unknown>;
  timestamp: number;
}

class MetricsCollector {
  private buffer: MetricEntry[] = [];
  private flushInterval: ReturnType<typeof setInterval> | null = null;
  private readonly maxBufferSize = 100;

  constructor() {
    if (typeof window === 'undefined' && process.env.NODE_ENV === 'production') {
      this.flushInterval = setInterval(() => this.flush(), 60000);
    }
  }

  record(name: string, value: number, tags?: Record<string, unknown>) {
    this.buffer.push({ name, value, tags, timestamp: Date.now() });
    if (this.buffer.length >= this.maxBufferSize) void this.flush();
  }

  async flush() {
    if (this.buffer.length === 0) return;
    const entries = [...this.buffer];
    this.buffer = [];
    try {
      await prisma.monitoringEvent.createMany({
        data: entries.map(m => ({
          userId: (m.tags?.userId as string) || 'system',
          eventType: 'metric',
          source: 'backend',
          message: m.name,
          details: JSON.stringify({ value: m.value, tags: m.tags }),
          severity: 'info',
        })),
      });
    } catch { /* silent */ }
  }

  recordApiCall(endpoint: string, duration: number, status: number, userId?: string) {
    this.record('api.duration', duration, { endpoint, status: String(status), ...(userId ? { userId } : {}) });
    this.record('api.calls', 1, { endpoint, status: String(status), ...(userId ? { userId } : {}) });
  }

  recordAgentAction(action: string, platform: string, success: boolean) {
    this.record('agent.action', 1, { action, platform, success: String(success) });
  }

  recordAuthEvent(type: string) {
    this.record('auth.event', 1, { type });
  }
}

export const metrics = new MetricsCollector();
