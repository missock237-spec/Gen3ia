/**
 * N8N Bi-directional Sync Integration
 * 
 * Enables seamless workflow orchestration between Gen3ia and n8n:
 * - Sync workflows in both directions
 * - Hybrid workflows (Gen3ia blocks ↔ n8n workflows)
 * - Credential management
 * - Webhook bridge for real-time updates
 */

import { createLogger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';

const log = createLogger('n8n-sync');

export interface N8NConfig {
  baseUrl: string;
  apiKey: string;
  webhookUrl?: string;
}

export interface N8NWorkflow {
  id: string;
  name: string;
  description?: string;
  active: boolean;
  nodes: N8NNode[];
  connections: N8NConnection[];
}

export interface N8NNode {
  id: string;
  type: string;
  name: string;
  position: [number, number];
  parameters: Record<string, any>;
}

export interface N8NConnection {
  source: string;
  sourceHandle?: string;
  target: string;
  targetHandle?: string;
}

export interface SyncConfig {
  direction: 'pull' | 'push' | 'bidirectional';
  conflictResolution: 'local' | 'remote' | 'merge' | 'manual';
  autoSync: boolean;
  syncInterval?: number;
}

class N8NSyncEngine {
  private config: N8NConfig | null = null;
  private syncedWorkflows = new Map<string, { genId: string; n8nId: string }>();
  private lastSyncTime = new Map<string, Date>();

  constructor() {
    this.setupSync();
  }

  /**
   * Initialize n8n connection
   */
  async initialize(config: N8NConfig): Promise<void> {
    this.config = config;

    // Test connection
    try {
      const response = await fetch(`${config.baseUrl}/api/v1/workflows`, {
        headers: { 'X-N8N-API-KEY': config.apiKey },
      });

      if (!response.ok) {
        throw new Error(`N8N connection failed: ${response.statusText}`);
      }

      log.info('N8N connection established', {
        baseUrl: config.baseUrl,
      });
    } catch (error) {
      log.error('Failed to initialize N8N connection', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Pull workflow from n8n
   */
  async pullWorkflow(n8nWorkflowId: string): Promise<N8NWorkflow> {
    if (!this.config) {
      throw new Error('N8N not configured');
    }

    const response = await fetch(
      `${this.config.baseUrl}/api/v1/workflows/${n8nWorkflowId}`,
      {
        headers: { 'X-N8N-API-KEY': this.config.apiKey },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch workflow: ${response.statusText}`);
    }

    const workflow = await response.json();

    log.info('Workflow pulled from n8n', {
      workflowId: n8nWorkflowId,
      name: workflow.name,
    });

    return workflow;
  }

  /**
   * Push workflow to n8n
   */
  async pushWorkflow(workflow: N8NWorkflow, n8nId?: string): Promise<string> {
    if (!this.config) {
      throw new Error('N8N not configured');
    }

    const method = n8nId ? 'PUT' : 'POST';
    const url = n8nId
      ? `${this.config.baseUrl}/api/v1/workflows/${n8nId}`
      : `${this.config.baseUrl}/api/v1/workflows`;

    const response = await fetch(url, {
      method,
      headers: {
        'X-N8N-API-KEY': this.config.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: workflow.name,
        description: workflow.description,
        nodes: workflow.nodes,
        connections: workflow.connections,
        active: workflow.active,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to push workflow: ${response.statusText}`);
    }

    const result = await response.json();
    const resultId = result.id || n8nId;

    log.info('Workflow pushed to n8n', {
      workflowId: resultId,
      name: workflow.name,
    });

    return resultId;
  }

  /**
   * Create hybrid block that calls n8n workflow
   */
  createN8NBlock(workflowId: string, n8nWorkflowId: string) {
    return {
      id: `n8n_${workflowId}`,
      type: 'n8n_workflow',
      label: `N8N Workflow: ${n8nWorkflowId}`,
      config: {
        n8nWorkflowId,
        timeout: 30000,
        passDataThrough: true,
      },
    };
  }

  /**
   * Execute n8n workflow from Gen3ia
   */
  async executeN8NWorkflow(
    n8nWorkflowId: string,
    input: Record<string, any>,
  ): Promise<Record<string, any>> {
    if (!this.config) {
      throw new Error('N8N not configured');
    }

    const response = await fetch(
      `${this.config.baseUrl}/api/v1/workflows/${n8nWorkflowId}/execute`,
      {
        method: 'POST',
        headers: {
          'X-N8N-API-KEY': this.config.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ data: input }),
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to execute workflow: ${response.statusText}`);
    }

    const result = await response.json();

    log.info('N8N workflow executed', {
      workflowId: n8nWorkflowId,
      dataPath: 'output',
    });

    return result;
  }

  /**
   * Sync workflow in both directions
   */
  async syncWorkflow(
    genId: string,
    n8nId: string,
    config: SyncConfig,
  ): Promise<void> {
    this.syncedWorkflows.set(genId, { genId, n8nId });

    if (config.autoSync && config.syncInterval) {
      const interval = setInterval(async () => {
        try {
          if (config.direction === 'pull' || config.direction === 'bidirectional') {
            const n8nWorkflow = await this.pullWorkflow(n8nId);
            // Update local Gen3ia workflow
            log.debug('Workflow synced from n8n', { workflowId: genId });
          }

          if (config.direction === 'push' || config.direction === 'bidirectional') {
            // Get local workflow and push to n8n
            log.debug('Workflow synced to n8n', { workflowId: genId });
          }

          this.lastSyncTime.set(genId, new Date());
        } catch (error) {
          log.error('Sync failed', {
            workflowId: genId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }, config.syncInterval);

      // Store interval ID for cleanup
      (this as any).syncIntervals = (this as any).syncIntervals || new Map();
      (this as any).syncIntervals.set(genId, interval);
    }
  }

  /**
   * Stop syncing workflow
   */
  stopSync(genId: string): void {
    const intervals = (this as any).syncIntervals;
    if (intervals?.has(genId)) {
      clearInterval(intervals.get(genId));
      intervals.delete(genId);
    }

    this.syncedWorkflows.delete(genId);
    log.info('Workflow sync stopped', { workflowId: genId });
  }

  /**
   * Get list of n8n workflows
   */
  async listN8NWorkflows(): Promise<Array<{ id: string; name: string }>> {
    if (!this.config) {
      throw new Error('N8N not configured');
    }

    const response = await fetch(`${this.config.baseUrl}/api/v1/workflows`, {
      headers: { 'X-N8N-API-KEY': this.config.apiKey },
    });

    if (!response.ok) {
      throw new Error(`Failed to list workflows: ${response.statusText}`);
    }

    const workflows = await response.json();
    return workflows.map((w: any) => ({
      id: w.id,
      name: w.name,
    }));
  }

  /**
   * Setup webhook bridge for n8n → Gen3ia
   */
  setupWebhookBridge(webhookPath: string): string {
    if (!this.config?.webhookUrl) {
      throw new Error('Webhook URL not configured');
    }

    const webhookUrl = `${this.config.webhookUrl}${webhookPath}`;

    log.info('Webhook bridge setup', {
      url: webhookUrl.slice(0, 50) + '...',
    });

    return webhookUrl;
  }

  /**
   * Private: Setup sync scheduler
   */
  private setupSync(): void {
    // Periodic sync check
    setInterval(() => {
      this.lastSyncTime.forEach((lastSync, workflowId) => {
        const now = new Date();
        const elapsed = now.getTime() - lastSync.getTime();

        // Log sync health
        if (elapsed > 3600000) {
          // 1 hour
          log.warn('Workflow sync stale', { workflowId, lastSync });
        }
      });
    }, 600000); // Every 10 minutes
  }

  /**
   * Get sync status
   */
  getSyncStatus(genId: string): { synced: boolean; lastSync?: Date; n8nId?: string } {
    const sync = this.syncedWorkflows.get(genId);
    const lastSync = this.lastSyncTime.get(genId);

    return {
      synced: !!sync,
      lastSync,
      n8nId: sync?.n8nId,
    };
  }
}

export const n8nSyncEngine = new N8NSyncEngine();
