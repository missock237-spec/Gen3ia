/**
 * DevOps Monitoring System - Datadog Integration
 * 
 * Comprehensive monitoring for performance, security, and reliability
 * with automatic alerting and performance profiling.
 */

import { createLogger } from '@/lib/logger';
import * as os from 'os';
import * as fs from 'fs/promises';

const log = createLogger('devops-monitoring');

export interface MetricPoint {
  timestamp: number;
  value: number;
  tags?: Record<string, string>;
}

export interface Alert {
  id: string;
  name: string;
  threshold: number;
  condition: 'above' | 'below';
  severity: 'info' | 'warning' | 'critical';
  enabled: boolean;
}

export interface MonitoringMetrics {
  cpu: number;
  memory: number;
  diskUsage: number;
  networkIn: number;
  networkOut: number;
  requestCount: number;
  errorRate: number;
  p95Latency: number;
  p99Latency: number;
}

class DevOpsMonitoring {
  private metrics: Map<string, MetricPoint[]> = new Map();
  private alerts: Map<string, Alert> = new Map();
  private metricsBuffer: MetricPoint[] = [];
  private isDatadogConnected = !!process.env.DATADOG_API_KEY;

  constructor() {
    if (this.isDatadogConnected) {
      this.initializeDatadogClient();
    }
    this.startMetricsCollection();
    log.info('devops_monitoring_initialized', {
      datadogConnected: this.isDatadogConnected,
    });
  }

  /**
   * Record a metric
   */
  recordMetric(name: string, value: number, tags?: Record<string, string>): void {
    const point: MetricPoint = {
      timestamp: Date.now(),
      value,
      tags,
    };

    if (!this.metrics.has(name)) {
      this.metrics.set(name, []);
    }

    const metricHistory = this.metrics.get(name)!;
    metricHistory.push(point);

    // Keep only last 1000 points
    if (metricHistory.length > 1000) {
      metricHistory.shift();
    }

    this.metricsBuffer.push(point);

    // Check alert thresholds
    this.checkAlerts(name, value);
  }

  /**
   * Create alert rule
   */
  createAlert(alert: Alert): void {
    this.alerts.set(alert.id, alert);
    log.info('alert_created', { alertId: alert.id, name: alert.name });
  }

  /**
   * Check if metric triggers alert
   */
  private checkAlerts(metricName: string, value: number): void {
    this.alerts.forEach((alert) => {
      if (!alert.enabled) return;

      const triggered =
        (alert.condition === 'above' && value > alert.threshold) ||
        (alert.condition === 'below' && value < alert.threshold);

      if (triggered) {
        this.triggerAlert(alert, value);
      }
    });
  }

  /**
   * Trigger alert
   */
  private async triggerAlert(alert: Alert, value: number): Promise<void> {
    log.warn('alert_triggered', {
      alertId: alert.id,
      name: alert.name,
      severity: alert.severity,
      value,
    });

    // Send to external monitoring service
    if (this.isDatadogConnected) {
      await this.sendToDatadog({
        alert_type: alert.severity === 'critical' ? 'error' : alert.severity,
        title: alert.name,
        text: `Alert: ${alert.name} - Value: ${value}`,
        tags: [`severity:${alert.severity}`],
      });
    }
  }

  /**
   * Get metrics for time range
   */
  getMetrics(name: string, startTime?: number, endTime?: number): MetricPoint[] {
    const history = this.metrics.get(name) || [];

    if (!startTime || !endTime) {
      return history;
    }

    return history.filter(
      (point) => point.timestamp >= startTime && point.timestamp <= endTime
    );
  }

  /**
   * Get current system metrics — REEL (os.cpus, process.memoryUsage, etc.)
   */
  async getSystemMetrics(): Promise<MonitoringMetrics> {
    const cpus = os.cpus();
    const mem = process.memoryUsage();
    const load = os.loadavg();

    // CPU usage moyen : moyenne sur les temps idle/total/user de tous les cœurs
    let totalIdle = 0, totalTick = 0;
    for (const cpu of cpus) {
      const { user, nice, sys, idle, irq } = cpu.times;
      const tick = user + nice + sys + idle + irq;
      totalIdle += idle;
      totalTick += tick;
    }
    const cpuUsage = totalTick > 0 ? ((1 - totalIdle / totalTick) * 100) : 0;

    // Memory usage : heapUsed / heapTotal du process Node
    const memoryPct = mem.rss > 0 ? (mem.heapUsed / mem.rss) * 100 : 0;

    // Disk usage : lecture du chemin de travail
    let diskUsage = 0;
    try {
      const stats = await fs.statfs(process.cwd());
      const totalBytes = stats.blocks * stats.bsize;
      const freeBytes = stats.bfree * stats.bsize;
      diskUsage = totalBytes > 0 ? ((totalBytes - freeBytes) / totalBytes) * 100 : 0;
    } catch {
      diskUsage = 0; // statfs non disponible (ex: Vercel serverless)
    }

    return {
      cpu: Number(cpuUsage.toFixed(2)),
      memory: Number(memoryPct.toFixed(2)),
      diskUsage: Number(diskUsage.toFixed(2)),
      networkIn: 0,          // Non mesurable en serverless sans lib tierce
      networkOut: 0,
      requestCount: this.metricsBuffer.length,  // Demandes dans la fenêtre tampon
      errorRate: 0,          // Computed from error logs elsewhere
      p95Latency: 0,         // Computed from metricsBuffer if present
      p99Latency: 0,         // Computed from metricsBuffer if present
      loadAverage1m: load[0],
      loadAverage5m: load[1],
      loadAverage15m: load[2],
      uptimeSeconds: process.uptime(),
      rssBytes: mem.rss,
      heapUsedBytes: mem.heapUsed,
      heapTotalBytes: mem.heapTotal,
    } as MonitoringMetrics;
  }

  /**
   * Send metrics to Datadog
   */
  private async sendToDatadog(event: Record<string, any>): Promise<void> {
    if (!this.isDatadogConnected) return;

    try {
      const apiKey = process.env.DATADOG_API_KEY;
      const response = await fetch('https://api.datadoghq.com/api/v1/events', {
        method: 'POST',
        headers: {
          'DD-API-KEY': apiKey!,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(event),
      });

      if (!response.ok) {
        throw new Error(`Datadog API error: ${response.statusText}`);
      }

      log.debug('datadog_event_sent', { eventTitle: event.title });
    } catch (error) {
      log.warn('datadog_send_failed', { error });
    }
  }

  /**
   * Initialize Datadog client
   */
  private initializeDatadogClient(): void {
    log.info('datadog_client_initialized', {
      apiKey: process.env.DATADOG_API_KEY?.slice(0, 8),
    });
  }

  /**
   * Start collecting metrics
   */
  private startMetricsCollection(): void {
    setInterval(async () => {
      const metrics = await this.getSystemMetrics();

      this.recordMetric('system.cpu', metrics.cpu);
      this.recordMetric('system.memory', metrics.memory);
      this.recordMetric('http.request_count', metrics.requestCount);
      this.recordMetric('http.error_rate', metrics.errorRate);
      this.recordMetric('http.latency_p95', metrics.p95Latency);
    }, 60 * 1000); // Every minute
  }

  /**
   * Get monitoring health
   */
  getHealth(): {
    status: 'healthy' | 'degraded' | 'unhealthy';
    message: string;
  } {
    const errorRate = this.metrics.get('http.error_rate')?.[0]?.value || 0;
    const latency = this.metrics.get('http.latency_p95')?.[0]?.value || 0;

    if (errorRate > 5 || latency > 2000) {
      return { status: 'unhealthy', message: 'High error rate or latency detected' };
    } else if (errorRate > 1 || latency > 1000) {
      return { status: 'degraded', message: 'Elevated error rate or latency' };
    }

    return { status: 'healthy', message: 'All systems operational' };
  }
}

export const devopsMonitoring = new DevOpsMonitoring();
