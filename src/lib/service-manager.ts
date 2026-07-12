/**
 * Genova Service Manager — Production-Ready Microservice Orchestrator
 *
 * Manages the lifecycle of all Genova microservices as child processes
 * of the Next.js server. Provides health monitoring, auto-restart with
 * exponential backoff, graceful shutdown, dependency-ordered startup,
 * and an event-driven API for the rest of the application.
 */

import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { createLogger } from '@/lib/logger';

// ============================================================
// Types
// ============================================================

export type ServiceStatus =
  | 'stopped'
  | 'starting'
  | 'running'
  | 'degraded'
  | 'stopping'
  | 'crashed'
  | 'failed';

export interface ServiceManagerEvents {
  'service:status': (event: ServiceStatusEvent) => void;
  'service:health': (event: ServiceHealthEvent) => void;
  'service:log': (event: ServiceLogEvent) => void;
  'manager:ready': () => void;
  'manager:shutdown': () => void;
  'manager:error': (error: Error) => void;
}

export interface ServiceStatusEvent {
  serviceId: string;
  previousStatus: ServiceStatus;
  newStatus: ServiceStatus;
  timestamp: Date;
  details?: string;
}

export interface ServiceHealthEvent {
  serviceId: string;
  healthy: boolean;
  responseTimeMs: number;
  timestamp: Date;
  error?: string;
  data?: unknown;
}

export interface ServiceLogEvent {
  serviceId: string;
  stream: 'stdout' | 'stderr';
  data: string;
  timestamp: Date;
}

export interface ServiceDefinition {
  id: string;
  name: string;
  command: string;
  args: string[];
  cwd: string;
  port: number;
  healthPath: string;
  env?: Record<string, string>;
  dependsOn?: string[];
  autoRestart: boolean;
  maxRestarts: number;
  restartWindowMs: number;
  restartDelayMs: number;
  maxRestartDelayMs: number;
  startupGraceMs: number;
  healthCheckIntervalMs: number;
  healthCheckTimeoutMs: number;
  shutdownTimeoutMs: number;
  startStaggerMs: number;
  category?: string;
  description?: string;
  icon?: string;
}

export interface ServiceRuntime {
  definition: ServiceDefinition;
  process: ChildProcess | null;
  status: ServiceStatus;
  pid: number | undefined;
  startedAt: Date | null;
  lastHealthCheckAt: Date | null;
  lastHealthyAt: Date | null;
  restartCount: number;
  restartTimestamps: Date[];
  lastExitCode: number | null;
  lastExitSignal: string | null;
  lastError: string | null;
  uptimeMs: number;
  currentBackoffMs: number;
}

export interface ServiceManagerSnapshot {
  services: ServiceSummary[];
  totalServices: number;
  healthyCount: number;
  degradedCount: number;
  stoppedCount: number;
  failedCount: number;
  timestamp: Date;
}

export interface ServiceSummary {
  id: string;
  name: string;
  status: ServiceStatus;
  pid: number | undefined;
  port: number;
  uptimeMs: number;
  restartCount: number;
  lastHealthCheckAt: Date | null;
  lastHealthyAt: Date | null;
  lastError: string | null;
  category?: string;
  description?: string;
  icon?: string;
}

// ============================================================
// Constants
// ============================================================

const BASE_DIR = process.cwd();
const LOG_DIR = path.join(BASE_DIR, 'logs', 'services');

const DEFAULT_SERVICE_OPTIONS: Pick<
  ServiceDefinition,
  | 'autoRestart'
  | 'maxRestarts'
  | 'restartWindowMs'
  | 'restartDelayMs'
  | 'maxRestartDelayMs'
  | 'startupGraceMs'
  | 'healthCheckIntervalMs'
  | 'healthCheckTimeoutMs'
  | 'shutdownTimeoutMs'
  | 'startStaggerMs'
  | 'dependsOn'
> = {
  autoRestart: true,
  maxRestarts: 10,
  restartWindowMs: 10 * 60 * 1000,
  restartDelayMs: 2000,
  maxRestartDelayMs: 60_000,
  startupGraceMs: 5000,
  healthCheckIntervalMs: 15_000,
  healthCheckTimeoutMs: 5000,
  shutdownTimeoutMs: 10_000,
  startStaggerMs: 2000,
  dependsOn: [],
};

// ============================================================
// Service Registry
// ============================================================

const SERVICE_REGISTRY: ServiceDefinition[] = [
  {
    ...DEFAULT_SERVICE_OPTIONS,
    id: 'pocketbase',
    name: 'PocketBase',
    description: 'Backend-as-a-Service with auth, DB, and file storage',
    category: 'database',
    icon: 'Database',
    command: path.join(BASE_DIR, 'services', 'pocketbase', 'pocketbase'),
    args: ['serve', '--http=0.0.0.0:8090'],
    cwd: path.join(BASE_DIR, 'services', 'pocketbase'),
    port: 8090,
    healthPath: '/api/health',
    dependsOn: [],
    startupGraceMs: 4000,
    maxRestarts: 5,
  },
  {
    ...DEFAULT_SERVICE_OPTIONS,
    id: 'baileys',
    name: 'Baileys WhatsApp',
    description: 'WhatsApp Web API for messaging and call automation',
    category: 'communication',
    icon: 'MessageCircle',
    command: 'node',
    args: ['server.js'],
    cwd: path.join(BASE_DIR, 'services', 'baileys'),
    port: 8186,
    healthPath: '/health',
    dependsOn: [],
    startupGraceMs: 6000,
    maxRestarts: 10,
  },
  {
    ...DEFAULT_SERVICE_OPTIONS,
    id: 'ruflo',
    name: 'Ruflo MCP',
    description: 'MCP protocol orchestrator for tool integration',
    category: 'infrastructure',
    icon: 'Plug',
    command: 'node',
    args: ['server.mjs'],
    cwd: path.join(BASE_DIR, 'services', 'ruflo'),
    port: 8190,
    healthPath: '/health',
    dependsOn: [],
    startupGraceMs: 5000,
  },
  {
    ...DEFAULT_SERVICE_OPTIONS,
    id: 'n8n',
    name: 'n8n Workflows',
    description: 'Workflow automation engine with visual editor',
    category: 'automation',
    icon: 'GitBranch',
    command: `${process.env.HOME || '/root'}/.npm-global/bin/n8n`,
    args: ['start'],
    cwd: path.join(BASE_DIR, 'services'),
    port: 5678,
    healthPath: '/healthz',
    env: {
      N8N_BASIC_AUTH_ACTIVE: 'true',
      N8N_BASIC_AUTH_USER: 'admin',
      N8N_BASIC_AUTH_PASSWORD: 'genova_admin',
      N8N_HOST: 'localhost',
      N8N_PORT: '5678',
      N8N_PROTOCOL: 'http',
      WEBHOOK_URL: 'http://localhost:5678/',
      GENERIC_TIMEZONE: 'Africa/Douala',
      TZ: 'Africa/Douala',
    },
    dependsOn: ['pocketbase'],
    startupGraceMs: 15_000,
    restartDelayMs: 5000,
    maxRestarts: 5,
  },
  {
    ...DEFAULT_SERVICE_OPTIONS,
    id: 'speechbrain',
    name: 'SpeechBrain ASR',
    description: 'Speech-to-text engine powered by SpeechBrain models',
    category: 'ai_ml',
    icon: 'Mic',
    command: 'python3',
    args: [path.join(BASE_DIR, 'services', 'speechbrain_api_server.py')],
    cwd: path.join(BASE_DIR, 'services'),
    port: 8187,
    healthPath: '/health',
    dependsOn: [],
    startupGraceMs: 20_000,
    restartDelayMs: 5000,
    maxRestarts: 5,
  },
];

// ============================================================
// ServiceManager Class
// ============================================================

const log = createLogger('service-manager');

export class ServiceManager extends EventEmitter {
  private runtimes: Map<string, ServiceRuntime> = new Map();
  private healthCheckTimers: Map<string, ReturnType<typeof setInterval>> = new Map();
  private shutdownTimeouts: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private restartTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private startupGraceTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private _isShuttingDown = false;
  private _isInitialized = false;
  private globalHealthTimer: ReturnType<typeof setInterval> | null = null;

  // Singleton
  static #instance: ServiceManager | null = null;

  static getInstance(): ServiceManager {
    if (!ServiceManager.#instance) {
      ServiceManager.#instance = new ServiceManager();
    }
    return ServiceManager.#instance;
  }

  constructor() {
    super();
    try {
      fs.mkdirSync(LOG_DIR, { recursive: true });
    } catch {
      // May already exist or be in a read-only FS; best-effort
    }
  }

  // ----------------------------------------------------------
  // Initialization
  // ----------------------------------------------------------

  initialize(): void {
    if (this._isInitialized) return;
    this._isInitialized = true;

    for (const def of SERVICE_REGISTRY) {
      this.runtimes.set(def.id, this.createRuntime(def));
    }

    // Register process signal handlers for graceful shutdown
    const shutdown = () => this.stopAll().catch(() => process.exit(1)).finally(() => process.exit(0));
    process.once('SIGTERM', shutdown);
    process.once('SIGINT', shutdown);

    log.info('ServiceManager initialized', { serviceCount: this.runtimes.size });
  }

  private createRuntime(definition: ServiceDefinition): ServiceRuntime {
    return {
      definition,
      process: null,
      status: 'stopped',
      pid: undefined,
      startedAt: null,
      lastHealthCheckAt: null,
      lastHealthyAt: null,
      restartCount: 0,
      restartTimestamps: [],
      lastExitCode: null,
      lastExitSignal: null,
      lastError: null,
      uptimeMs: 0,
      currentBackoffMs: definition.restartDelayMs,
    };
  }

  // ----------------------------------------------------------
  // Start / Stop — All Services
  // ----------------------------------------------------------

  async startAll(): Promise<void> {
    this.initialize();
    const ordered = this.topologicalSort();
    log.info('Starting all services', { order: ordered.map((r) => r.definition.id) });

    for (const runtime of ordered) {
      if (this._isShuttingDown) break;
      await this.startService(runtime.definition.id);
      await this.sleep(runtime.definition.startStaggerMs);
    }

    this.emit('manager:ready');
    log.info('All services started');
  }

  async stopAll(): Promise<void> {
    this._isShuttingDown = true;
    log.info('Stopping all services');

    if (this.globalHealthTimer) {
      clearInterval(this.globalHealthTimer);
      this.globalHealthTimer = null;
    }

    const reversed = [...this.runtimes.values()].reverse();
    await Promise.all(reversed.map((r) => this.stopService(r.definition.id)));

    this.emit('manager:shutdown');
    log.info('All services stopped');
  }

  // ----------------------------------------------------------
  // Start / Stop — Individual Service
  // ----------------------------------------------------------

  async startService(id: string): Promise<boolean> {
    const runtime = this.runtimes.get(id);
    if (!runtime) {
      log.warn('Unknown service', { id });
      return false;
    }

    if (runtime.status === 'running' || runtime.status === 'starting') {
      log.debug('Service already running or starting', { id });
      return true;
    }

    // Wait for dependencies
    for (const depId of runtime.definition.dependsOn ?? []) {
      const dep = this.runtimes.get(depId);
      if (dep && dep.status !== 'running') {
        log.info('Waiting for dependency', { id, depId });
        const started = await this.startService(depId);
        if (!started) {
          log.error('Dependency failed to start', { id, depId });
          this.setStatus(runtime, 'failed', `Dependency ${depId} failed`);
          return false;
        }
      }
    }

    this.setStatus(runtime, 'starting');
    const def = runtime.definition;

    log.info('Starting service', { id, command: def.command, args: def.args });

    const env: NodeJS.ProcessEnv = {
      ...process.env,
      ...def.env,
      PORT: String(def.port),
    };

    let stdoutLog: fs.WriteStream | null = null;
    let stderrLog: fs.WriteStream | null = null;

    try {
      stdoutLog = fs.createWriteStream(path.join(LOG_DIR, `${id}.stdout.log`), { flags: 'a' });
      stderrLog = fs.createWriteStream(path.join(LOG_DIR, `${id}.stderr.log`), { flags: 'a' });
    } catch {
      // Log file creation failure is non-fatal
    }

    const child = spawn(def.command, def.args, {
      cwd: def.cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false,
    });

    runtime.process = child;
    runtime.pid = child.pid;
    runtime.startedAt = new Date();

    child.stdout?.on('data', (data: Buffer) => {
      const str = data.toString();
      stdoutLog?.write(str);
      this.emit('service:log', { serviceId: id, stream: 'stdout', data: str, timestamp: new Date() });
    });

    child.stderr?.on('data', (data: Buffer) => {
      const str = data.toString();
      stderrLog?.write(str);
      this.emit('service:log', { serviceId: id, stream: 'stderr', data: str, timestamp: new Date() });
    });

    child.on('exit', (code, signal) => {
      stdoutLog?.end();
      stderrLog?.end();
      runtime.lastExitCode = code;
      runtime.lastExitSignal = signal;
      runtime.process = null;
      runtime.pid = undefined;

      if (this._isShuttingDown || runtime.status === 'stopping') {
        this.setStatus(runtime, 'stopped');
        return;
      }

      log.warn('Service exited unexpectedly', { id, code, signal });
      this.setStatus(runtime, 'crashed', `Exit code ${code ?? signal}`);

      if (def.autoRestart) {
        this.scheduleRestart(runtime);
      } else {
        this.setStatus(runtime, 'failed');
      }
    });

    child.on('error', (err) => {
      runtime.lastError = err.message;
      log.error('Service process error', { id, error: err.message });
      this.setStatus(runtime, 'crashed', err.message);
      if (def.autoRestart && !this._isShuttingDown) {
        this.scheduleRestart(runtime);
      }
    });

    // Wait for startup grace period then begin health checks
    const graceTimer = setTimeout(() => {
      this.startupGraceTimers.delete(id);
      this.startHealthChecks(runtime);
    }, def.startupGraceMs);
    this.startupGraceTimers.set(id, graceTimer);

    return true;
  }

  async stopService(id: string, force = false): Promise<void> {
    const runtime = this.runtimes.get(id);
    if (!runtime || !runtime.process) return;

    this.clearTimers(id);
    this.setStatus(runtime, 'stopping');

    const child = runtime.process;
    log.info('Stopping service', { id, force });

    // SIGTERM first
    try { child.kill('SIGTERM'); } catch { /* process may already be dead */ }

    // SIGKILL escalation if needed
    const killTimer = setTimeout(() => {
      if (runtime.process) {
        log.warn('Service did not stop gracefully, sending SIGKILL', { id });
        try { child.kill('SIGKILL'); } catch { /* ignore */ }
      }
    }, force ? 0 : runtime.definition.shutdownTimeoutMs);
    this.shutdownTimeouts.set(id, killTimer);

    await new Promise<void>((resolve) => {
      const onExit = () => {
        clearTimeout(killTimer);
        this.shutdownTimeouts.delete(id);
        resolve();
      };
      if (!child.pid || child.exitCode !== null) {
        resolve();
      } else {
        child.once('exit', onExit);
      }
    });

    this.setStatus(runtime, 'stopped');
    log.info('Service stopped', { id });
  }

  async restartService(id: string): Promise<boolean> {
    await this.stopService(id);
    return this.startService(id);
  }

  // ----------------------------------------------------------
  // Health Checks
  // ----------------------------------------------------------

  private startHealthChecks(runtime: ServiceRuntime): void {
    const id = runtime.definition.id;
    this.clearHealthTimer(id);

    const timer = setInterval(async () => {
      await this.checkHealth(runtime);
    }, runtime.definition.healthCheckIntervalMs);

    this.healthCheckTimers.set(id, timer);

    // Run one check immediately
    this.checkHealth(runtime).catch(() => { /* handled inside */ });
  }

  private async checkHealth(runtime: ServiceRuntime): Promise<boolean> {
    const id = runtime.definition.id;
    const def = runtime.definition;
    const start = Date.now();

    runtime.lastHealthCheckAt = new Date();

    if (!runtime.process || runtime.status === 'stopped' || runtime.status === 'stopping') {
      return false;
    }

    return new Promise<boolean>((resolve) => {
      const timeoutHandle = setTimeout(() => {
        req.destroy();
        const responseTimeMs = Date.now() - start;
        const prevStatus = runtime.status;
        runtime.status = 'degraded';
        this.emit('service:health', {
          serviceId: id,
          healthy: false,
          responseTimeMs,
          timestamp: new Date(),
          error: 'Health check timed out',
        });
        if (prevStatus === 'running') {
          this.setStatus(runtime, 'degraded', 'Health check timed out');
        }
        resolve(false);
      }, def.healthCheckTimeoutMs);

      const req = http.get(
        { hostname: 'localhost', port: def.port, path: def.healthPath, timeout: def.healthCheckTimeoutMs },
        (res) => {
          clearTimeout(timeoutHandle);
          const responseTimeMs = Date.now() - start;
          const healthy = res.statusCode !== undefined && res.statusCode >= 200 && res.statusCode < 400;

          res.resume(); // drain response body

          runtime.lastHealthCheckAt = new Date();
          if (healthy) runtime.lastHealthyAt = new Date();

          this.emit('service:health', {
            serviceId: id,
            healthy,
            responseTimeMs,
            timestamp: new Date(),
          });

          if (healthy && runtime.status !== 'running') {
            this.setStatus(runtime, 'running');
          } else if (!healthy && runtime.status === 'running') {
            this.setStatus(runtime, 'degraded', `Health check returned ${res.statusCode}`);
          }

          resolve(healthy);
        }
      );

      req.on('error', (err) => {
        clearTimeout(timeoutHandle);
        const responseTimeMs = Date.now() - start;
        this.emit('service:health', {
          serviceId: id,
          healthy: false,
          responseTimeMs,
          timestamp: new Date(),
          error: err.message,
        });
        if (runtime.status === 'running') {
          this.setStatus(runtime, 'degraded', err.message);
        }
        resolve(false);
      });
    });
  }

  // ----------------------------------------------------------
  // Restart Scheduling
  // ----------------------------------------------------------

  private scheduleRestart(runtime: ServiceRuntime): void {
    const id = runtime.definition.id;
    const def = runtime.definition;
    const now = Date.now();

    // Prune old restart timestamps outside the window
    runtime.restartTimestamps = runtime.restartTimestamps.filter(
      (ts) => now - ts.getTime() < def.restartWindowMs
    );

    if (runtime.restartTimestamps.length >= def.maxRestarts) {
      log.error('Service exceeded max restarts, marking failed', { id });
      this.setStatus(runtime, 'failed', 'Max restart budget exhausted');
      return;
    }

    const backoff = Math.min(runtime.currentBackoffMs, def.maxRestartDelayMs);
    const jitter = Math.random() * 500;
    const delay = backoff + jitter;

    // Exponential backoff for next attempt
    runtime.currentBackoffMs = Math.min(runtime.currentBackoffMs * 2, def.maxRestartDelayMs);

    log.info('Scheduling service restart', { id, delayMs: Math.round(delay), restartCount: runtime.restartCount + 1 });

    const timer = setTimeout(async () => {
      this.restartTimers.delete(id);
      if (this._isShuttingDown) return;

      runtime.restartCount++;
      runtime.restartTimestamps.push(new Date());

      await this.startService(id);
    }, delay);

    this.restartTimers.set(id, timer);
  }

  // ----------------------------------------------------------
  // Topology
  // ----------------------------------------------------------

  private topologicalSort(): ServiceRuntime[] {
    const runtimes = [...this.runtimes.values()];
    const visited = new Set<string>();
    const result: ServiceRuntime[] = [];

    const visit = (runtime: ServiceRuntime) => {
      if (visited.has(runtime.definition.id)) return;
      visited.add(runtime.definition.id);
      for (const depId of runtime.definition.dependsOn ?? []) {
        const dep = this.runtimes.get(depId);
        if (dep) visit(dep);
      }
      result.push(runtime);
    };

    for (const r of runtimes) visit(r);
    return result;
  }

  // ----------------------------------------------------------
  // State Helpers
  // ----------------------------------------------------------

  private setStatus(runtime: ServiceRuntime, newStatus: ServiceStatus, details?: string): void {
    const previousStatus = runtime.status;
    if (previousStatus === newStatus) return;

    runtime.status = newStatus;

    if (newStatus === 'running' && runtime.startedAt) {
      // Reset backoff on successful start
      runtime.currentBackoffMs = runtime.definition.restartDelayMs;
    }

    if (runtime.startedAt && newStatus === 'stopped') {
      runtime.uptimeMs = Date.now() - runtime.startedAt.getTime();
    }

    this.emit('service:status', {
      serviceId: runtime.definition.id,
      previousStatus,
      newStatus,
      timestamp: new Date(),
      details,
    });

    log.info('Service status changed', {
      id: runtime.definition.id,
      previousStatus,
      newStatus,
      details,
    });
  }

  private clearTimers(id: string): void {
    this.clearHealthTimer(id);

    const restartTimer = this.restartTimers.get(id);
    if (restartTimer) { clearTimeout(restartTimer); this.restartTimers.delete(id); }

    const graceTimer = this.startupGraceTimers.get(id);
    if (graceTimer) { clearTimeout(graceTimer); this.startupGraceTimers.delete(id); }

    const shutdownTimer = this.shutdownTimeouts.get(id);
    if (shutdownTimer) { clearTimeout(shutdownTimer); this.shutdownTimeouts.delete(id); }
  }

  private clearHealthTimer(id: string): void {
    const timer = this.healthCheckTimers.get(id);
    if (timer) { clearInterval(timer); this.healthCheckTimers.delete(id); }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }

  // ----------------------------------------------------------
  // Public API
  // ----------------------------------------------------------

  getRuntime(id: string): ServiceRuntime | undefined {
    return this.runtimes.get(id);
  }

  getAllRuntimes(): ServiceRuntime[] {
    return [...this.runtimes.values()];
  }

  getSnapshot(): ServiceManagerSnapshot {
    const services: ServiceSummary[] = [...this.runtimes.values()].map((r) => ({
      id: r.definition.id,
      name: r.definition.name,
      status: r.status,
      pid: r.pid,
      port: r.definition.port,
      uptimeMs: r.startedAt && r.status === 'running'
        ? Date.now() - r.startedAt.getTime()
        : r.uptimeMs,
      restartCount: r.restartCount,
      lastHealthCheckAt: r.lastHealthCheckAt,
      lastHealthyAt: r.lastHealthyAt,
      lastError: r.lastError,
      category: r.definition.category,
      description: r.definition.description,
      icon: r.definition.icon,
    }));

    const healthyCount = services.filter((s) => s.status === 'running').length;
    const degradedCount = services.filter((s) => s.status === 'degraded').length;
    const stoppedCount = services.filter((s) => s.status === 'stopped' || s.status === 'crashed').length;
    const failedCount = services.filter((s) => s.status === 'failed').length;

    return {
      services,
      totalServices: services.length,
      healthyCount,
      degradedCount,
      stoppedCount,
      failedCount,
      timestamp: new Date(),
    };
  }

  isReady(): boolean {
    return [...this.runtimes.values()].some((r) => r.status === 'running');
  }
}

// ============================================================
// Module-level accessor
// ============================================================

/** Get or create the global ServiceManager singleton */
export function getServiceManager(): ServiceManager {
  return ServiceManager.getInstance();
}
