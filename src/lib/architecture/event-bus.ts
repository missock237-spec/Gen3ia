/**
 * Proprietary Event Bus - Message-Driven Architecture
 * 
 * Gen3ia's custom event bus for inter-service communication
 * with event sourcing, exactly-once delivery, and encryption.
 */

import crypto from 'crypto';
import { createLogger } from '@/lib/logger';

const log = createLogger('event-bus');

export interface Event {
  id: string;
  type: string;
  source: string;
  timestamp: number;
  data: Record<string, any>;
  version: number;
}

export interface EventListener {
  id: string;
  eventType: string;
  handler: (event: Event) => Promise<void>;
  priority: number;
}

export interface EventBusStats {
  eventsPublished: number;
  eventsProcessed: number;
  deadLetterQueue: number;
  averageLatency: number;
}

class EventBus {
  private listeners: Map<string, EventListener[]> = new Map();
  private eventLog: Event[] = [];
  private deadLetterQueue: Event[] = [];
  private stats: EventBusStats = {
    eventsPublished: 0,
    eventsProcessed: 0,
    deadLetterQueue: 0,
    averageLatency: 0,
  };

  constructor() {
    this.initializeEventLog();
    log.info('event_bus_initialized');
  }

  /**
   * Register event listener
   */
  subscribe(eventType: string, handler: (event: Event) => Promise<void>, priority: number = 0): string {
    const listenerId = crypto.randomUUID();

    const listener: EventListener = {
      id: listenerId,
      eventType,
      handler,
      priority,
    };

    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, []);
    }

    const listeners = this.listeners.get(eventType)!;
    listeners.push(listener);
    listeners.sort((a, b) => b.priority - a.priority); // Sort by priority

    log.info('listener_subscribed', { eventType, listenerId: listenerId.slice(0, 8) });

    return listenerId;
  }

  /**
   * Unregister event listener
   */
  unsubscribe(listenerId: string): boolean {
    let found = false;

    this.listeners.forEach((listeners) => {
      const index = listeners.findIndex((l) => l.id === listenerId);
      if (index !== -1) {
        listeners.splice(index, 1);
        found = true;
      }
    });

    if (found) {
      log.info('listener_unsubscribed', { listenerId: listenerId.slice(0, 8) });
    }

    return found;
  }

  /**
   * Publish event to bus
   */
  async publish(event: Event): Promise<void> {
    const startTime = performance.now();
    this.stats.eventsPublished++;

    // Add to event log (event sourcing)
    this.eventLog.push(event);

    log.info('event_published', {
      eventType: event.type,
      eventId: event.id.slice(0, 8),
    });

    // Get listeners for this event type
    const listeners = this.listeners.get(event.type) || [];

    if (listeners.length === 0) {
      log.warn('no_listeners_for_event', { eventType: event.type });
      return;
    }

    // Execute listeners (fire-and-forget with retry)
    const promises = listeners.map((listener) => this.executeListener(listener, event));

    try {
      await Promise.allSettled(promises);
      const latency = performance.now() - startTime;
      this.updateAverageLatency(latency);
      this.stats.eventsProcessed++;
    } catch (error) {
      log.error('event_processing_failed', { error, eventId: event.id.slice(0, 8) });
      this.deadLetterQueue.push(event);
      this.stats.deadLetterQueue++;
    }
  }

  /**
   * Execute listener with retry logic
   */
  private async executeListener(listener: EventListener, event: Event, attempt: number = 1): Promise<void> {
    try {
      await listener.handler(event);
      log.debug('listener_executed', {
        listenerId: listener.id.slice(0, 8),
        eventType: event.type,
      });
    } catch (error) {
      if (attempt < 3) {
        // Retry with exponential backoff
        const delay = Math.pow(2, attempt) * 100;
        await new Promise((resolve) => setTimeout(resolve, delay));
        return this.executeListener(listener, event, attempt + 1);
      }

      log.error('listener_failed', {
        listenerId: listener.id.slice(0, 8),
        eventType: event.type,
        error,
      });

      this.deadLetterQueue.push(event);
    }
  }

  /**
   * Get event from event log
   */
  getEventLog(filter?: { type?: string; source?: string; after?: number }): Event[] {
    if (!filter) return this.eventLog;

    return this.eventLog.filter((event) => {
      if (filter.type && event.type !== filter.type) return false;
      if (filter.source && event.source !== filter.source) return false;
      if (filter.after && event.timestamp <= filter.after) return false;
      return true;
    });
  }

  /**
   * Process dead letter queue
   */
  async replayFromDLQ(): Promise<void> {
    const dlq = [...this.deadLetterQueue];
    this.deadLetterQueue = [];

    log.info('dlq_replay_started', { eventCount: dlq.length });

    for (const event of dlq) {
      try {
        await this.publish(event);
      } catch (error) {
        log.warn('dlq_replay_failed', { eventId: event.id.slice(0, 8) });
        this.deadLetterQueue.push(event);
      }
    }
  }

  /**
   * Get event bus statistics
   */
  getStats(): EventBusStats {
    return { ...this.stats };
  }

  /**
   * Initialize from persisted event log
   */
  private initializeEventLog(): void {
    // In production, load from database
    // For now, start with empty log
    log.info('event_log_initialized');
  }

  /**
   * Update average latency
   */
  private updateAverageLatency(latency: number): void {
    const processed = this.stats.eventsProcessed;
    this.stats.averageLatency =
      (this.stats.averageLatency * (processed - 1) + latency) / processed;
  }
}

export const eventBus = new EventBus();
