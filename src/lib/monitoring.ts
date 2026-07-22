import { prisma } from '@/lib/db';

class MetricsCollector {
  private buffer = [];
  private flushInterval = null;
  private readonly maxBufferSize = 100;

  constructor() {
    if (typeof window === 'undefined' && process.env.NODE_ENV === 'production') {
      this.flushInterval = setInterval(() => this.flush(), 60000);
    }
  }

  record(name, value, tags) {
    this.buffer.push({ name, value, tags, timestamp: Date.now() });
    if (this.buffer.length >= this.maxBufferSize) this.flush();
  }

  async flush() {
    if (this.buffer.length === 0) return;
    const metrics = [...this.buffer];
    this.buffer = [];
    try {
      await prisma.monitoringEvent.createMany({
        data: metrics.map(m => ({
          userId: m.tags?.userId || 'system',
          eventType: 'metric',
          source: 'backend',
          message: m.name,
          details: JSON.stringify({ value: m.value, tags: m.tags }),
          severity: 'info',
        })),
      });
    } catch { /* silent */ }
  }

  recordApiCall(endpoint, duration, status, userId) {
    this.record('api.duration', duration, { endpoint, status: String(status) });
    this.record('api.calls', 1, { endpoint, status: String(status) });
  }

  recordAgentAction(action, platform, success) {
    this.record('agent.action', 1, { action, platform, success: String(success) });
  }

  recordAuthEvent(type) {
    this.record('auth.event', 1, { type });
  }
}

export const metrics = new MetricsCollector();
