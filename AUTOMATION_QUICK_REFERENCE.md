# Gen3ia Automation System - Quick Reference

## Import All Systems

```typescript
import { automationMonitor } from '@/lib/automation/monitor';
import { resilienceEngine } from '@/lib/automation/resilience';
import { versioningEngine } from '@/lib/automation/versioning';
import { executionCache } from '@/lib/automation/caching';
import { webhookRetryEngine } from '@/lib/automation/webhook-retry';
import { n8nSyncEngine } from '@/lib/automation/n8n-sync';
import { abTestingEngine } from '@/lib/automation/ab-testing';
```

---

## Phase 1: Monitoring

### Start Tracking
```typescript
const state = automationMonitor.startExecution(
  'exec_123',
  'auto_456',
  'user_789'
);
// Returns: ExecutionState { status: 'queued', ... }
```

### Record Step
```typescript
automationMonitor.recordStep('exec_123', {
  stepId: 'step_1',
  blockId: 'block_1',
  blockLabel: 'Send Email',
  blockType: 'send_email',
  status: 'success',
  startedAt: new Date(),
  completedAt: new Date(),
  durationMs: 250,
  output: { messageId: 'msg_123' }
});
```

### Complete Execution
```typescript
automationMonitor.completeExecution('exec_123', result, error);
```

### Get Metrics
```typescript
const metrics = automationMonitor.getMetrics('auto_456');
// Returns: { totalRuns, successCount, failureCount, successRate, avgDuration, p50, p99 }
```

### Get Running Executions
```typescript
const running = automationMonitor.getRunningExecutions('user_789');
// Returns: ExecutionState[]
```

---

## Phase 2: Resilience

### Execute with Retry
```typescript
const result = await resilienceEngine.executeWithRetry(
  'block_1',
  async () => {
    return await executeBlock();
  },
  {
    maxRetries: 3,
    delays: [100, 500, 2000]
  }
);
```

### Execute with Fallback
```typescript
const result = await resilienceEngine.executeWithFallback(
  'block_1',
  async () => executeBlock(),
  { userId: 'user_789' }
);
```

### Register Fallback Handler
```typescript
resilienceEngine.registerFallback('block_1', async (error, context) => {
  return { fallbackValue: 'default' };
});
```

### Check Circuit Breaker
```typescript
const status = resilienceEngine.getStatus('block_1');
// Returns: { state: 'closed'|'open'|'half-open', failures, lastFailureTime }
```

### Reset Circuit Breaker
```typescript
resilienceEngine.reset('block_1');
resilienceEngine.resetAll();
```

---

## Phase 3: Versioning

### Create Version
```typescript
const version = await versioningEngine.createVersion(
  'workflow_123',
  canvas,
  'user_789',
  {
    label: 'Add email step',
    description: 'Added email notification',
    bump: 'minor' // 'major' | 'minor' | 'patch'
  }
);
// Returns: WorkflowVersion { version: '1.1.0', ... }
```

### List Versions
```typescript
const versions = await versioningEngine.listVersions('workflow_123', 50);
// Returns: WorkflowVersion[]
```

### Compare Versions
```typescript
const diff = await versioningEngine.compareVersions(
  'workflow_123',
  '1.0.0',
  '1.1.0'
);
// Returns: { added: [], removed: [], modified: [], summary: '...' }
```

### Rollback
```typescript
const newVersion = await versioningEngine.rollback(
  'workflow_123',
  '1.0.0',
  'user_789'
);
// Creates new version based on 1.0.0
```

### Deploy Version
```typescript
await versioningEngine.deployVersion(
  'workflow_123',
  '1.1.0',
  'user_789'
);
```

---

## Phase 6: Caching

### Configure Block Cache
```typescript
executionCache.configureBlock('block_1', {
  ttlSeconds: 600,
  enabled: true,
  keyPrefix: 'user_789'
});
```

### Get from Cache
```typescript
const cached = executionCache.get('block_1', { userId: 'user_789' });
// Returns: T | null
```

### Set Cache
```typescript
executionCache.set('block_1', result, { userId: 'user_789' }, 600);
```

### Check Cache
```typescript
const hasCached = executionCache.has('block_1', { userId: 'user_789' });
// Returns: boolean
```

### Invalidate Cache
```typescript
executionCache.invalidate('block_1', { userId: 'user_789' });
executionCache.invalidateBlock('block_1');
executionCache.invalidateAll();
```

### Cache Stats
```typescript
const stats = executionCache.getStats();
// Returns: { hits, misses, hitRate, totalEntries, memoryUsageMB }
```

### Warm Cache
```typescript
executionCache.warmCache('block_1', [
  { input: { category: 'urgent' }, value: [...], ttlSeconds: 600 },
  { input: { category: 'standard' }, value: [...], ttlSeconds: 600 }
]);
```

---

## Phase 9: Webhook Retry

### Create Webhook Event
```typescript
const webhook = await webhookRetryEngine.createWebhookEvent(
  'https://example.com/webhook',
  'automation.completed',
  { automationId: 'auto_123', status: 'success' },
  secretKey
);
```

### Attempt Delivery
```typescript
const success = await webhookRetryEngine.attemptDelivery(webhook);
// Auto-retries on transient errors, dead letters on permanent
```

### Get Dead Letter Queue
```typescript
const dlq = webhookRetryEngine.getDeadLetterQueue(100);
// Returns: WebhookEvent[]
```

### Replay Webhook
```typescript
await webhookRetryEngine.replayWebhook('wh_123');
```

### Get Metrics
```typescript
const metrics = webhookRetryEngine.getMetrics();
// Returns: { totalEvents, successCount, failureCount, deadLetteredCount, successRate }
```

### Get Recent Deliveries
```typescript
const recent = webhookRetryEngine.getRecentDeliveries(50);
// Returns: WebhookEvent[]
```

---

## Phase 4: N8N Sync

### Initialize Connection
```typescript
await n8nSyncEngine.initialize({
  baseUrl: 'https://n8n.example.com',
  apiKey: 'xxx',
  webhookUrl: 'https://myapp.com/webhooks/n8n'
});
```

### Pull Workflow from N8N
```typescript
const workflow = await n8nSyncEngine.pullWorkflow('wf_n8n_123');
// Returns: N8NWorkflow
```

### Push Workflow to N8N
```typescript
const n8nId = await n8nSyncEngine.pushWorkflow(workflow);
```

### Execute N8N Workflow
```typescript
const result = await n8nSyncEngine.executeN8NWorkflow(
  'wf_n8n_123',
  { input: 'data' }
);
```

### Setup Sync
```typescript
await n8nSyncEngine.syncWorkflow('gen3ia_wf_123', 'n8n_wf_456', {
  direction: 'bidirectional',
  conflictResolution: 'merge',
  autoSync: true,
  syncInterval: 300000 // 5 minutes
});
```

### Stop Sync
```typescript
n8nSyncEngine.stopSync('gen3ia_wf_123');
```

### Create Hybrid Block
```typescript
const block = n8nSyncEngine.createN8NBlock('gen3ia_wf_123', 'n8n_wf_456');
// Embed this block in Gen3ia workflow
```

---

## Phase 7: A/B Testing

### Create Test
```typescript
const test = abTestingEngine.createTest(
  'auto_123',
  'v1.0.0',
  'v1.1.0',
  {
    name: 'Email notification test',
    description: 'Testing new email template',
    splitRatio: [50, 50]
  }
);
```

### Start Test
```typescript
abTestingEngine.startTest(test.id);
```

### Select Variant
```typescript
const variant = abTestingEngine.selectVariant(test.id);
// Returns: 'A' | 'B' (based on split ratio)
```

### Record Metrics
```typescript
abTestingEngine.recordMetrics(test.id, variant, {
  runs: 1,
  successCount: 1,
  failureCount: 0,
  averageDurationMs: 250,
  errorRate: 0
});
```

### Get Results
```typescript
const results = abTestingEngine.getResults(test.id);
// Returns: { test, statisticalSignificance, confidentWinner, recommendation }
```

### Promote Winner
```typescript
abTestingEngine.promoteVariant(test.id, 'B');
```

### Pause/Resume
```typescript
abTestingEngine.pauseTest(test.id);
abTestingEngine.resumeTest(test.id);
```

---

## Common Patterns

### Full Stack Execution
```typescript
async function executeBlockWithFullStack(blockId, input, userId, automationId) {
  const execId = `exec_${Date.now()}`;
  const state = automationMonitor.startExecution(execId, automationId, userId);

  try {
    // Check cache
    let result = executionCache.get(blockId, input);
    
    if (!result) {
      // Execute with resilience
      result = await resilienceEngine.executeWithRetry(
        blockId,
        () => executeBlock(blockId, input),
        { maxRetries: 3 }
      );
      
      // Cache result
      executionCache.set(blockId, result, input, 300);
    }

    automationMonitor.recordStep(execId, {
      stepId: blockId,
      blockId,
      blockLabel: 'My Block',
      blockType: 'custom',
      status: 'success',
      startedAt: new Date(),
      completedAt: new Date(),
      output: result
    });

    automationMonitor.completeExecution(execId);
    return result;
  } catch (error) {
    automationMonitor.completeExecution(execId, null, error as Error);
    throw error;
  }
}
```

### A/B Testing Execution
```typescript
async function executeWithABTest(automationId, versionA, versionB, userId) {
  const test = abTestingEngine.createTest(automationId, versionA, versionB, {
    name: 'New workflow test'
  });
  
  abTestingEngine.startTest(test.id);
  const variant = abTestingEngine.selectVariant(test.id);
  const version = variant === 'A' ? versionA : versionB;
  
  // Execute with chosen version
  const startTime = Date.now();
  const result = await executeWorkflow(version);
  const duration = Date.now() - startTime;
  
  abTestingEngine.recordMetrics(test.id, variant, {
    runs: 1,
    successCount: result.success ? 1 : 0,
    failureCount: result.success ? 0 : 1,
    averageDurationMs: duration,
    errorRate: result.success ? 0 : 1
  });
  
  return result;
}
```

### Webhook with Retry
```typescript
async function sendWebhookWithRetry(endpoint, event, payload) {
  const webhook = await webhookRetryEngine.createWebhookEvent(
    endpoint,
    event,
    payload,
    process.env.WEBHOOK_SECRET!
  );
  
  const delivered = await webhookRetryEngine.attemptDelivery(webhook);
  
  if (!delivered) {
    // Will auto-retry, check DLQ later
    console.log('Webhook queued for retry');
  }
  
  return delivered;
}
```

---

## API Endpoints Quick Reference

```bash
# Get running automations
curl GET /api/automations/monitor

# Get specific execution
curl GET /api/automations/monitor?id=exec_123

# Get automation history
curl GET /api/automations/monitor?automation=auto_123

# Get webhook status
curl GET /api/automations/webhooks

# Get dead letter queue
curl GET /api/automations/webhooks?dlq=true

# Replay webhook
curl POST /api/automations/webhooks?action=replay \
  -d '{"webhookId": "wh_123"}'
```

---

## Environment Variables

```env
# Optional configuration
AUTOMATION_CACHE_TTL_SECONDS=300
AUTOMATION_CACHE_MAX_SIZE=1000
WEBHOOK_MAX_RETRIES=10
WEBHOOK_INITIAL_DELAY_MS=1000
N8N_BASE_URL=https://n8n.example.com
N8N_API_KEY=xxx
```

---

## Debug Logging

All systems use `createLogger`:

```typescript
// Enable debug logs in development
// Set LOG_LEVEL=debug in environment
```

Examples:
- `[automation-monitor] Execution started`
- `[workflow-resilience] Circuit breaker opened`
- `[execution-cache] Cache hit`
- `[webhook-retry] Webhook moved to dead letter queue`
- `[n8n-sync] Workflow synced from n8n`
- `[automation-ab-testing] A/B test created`
