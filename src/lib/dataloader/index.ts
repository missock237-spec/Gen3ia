import { prisma } from "@/lib/db";

class BatchLoader {
  constructor(batchFn, keyFn, options = {}) {
    this.batchFn = batchFn;
    this.keyFn = keyFn;
    this.queue = new Map();
    this.timer = null;
    this.options = { maxBatchSize: 100, delayMs: 10, ...options };
  }

  load(key) {
    return new Promise((resolve, reject) => {
      const batchKey = "default";
      if (!this.queue.has(batchKey)) { this.queue.set(batchKey, { keys: [], resolve: () => {}, reject: () => {} }); this.schedule(); }
      const batch = this.queue.get(batchKey);
      batch.keys.push(key);
      this.queue.set(batchKey, { keys: batch.keys, resolve: (results) => resolve(results.find(item => this.keyFn(item) === key)), reject });
    });
  }

  schedule() { if (this.timer) clearTimeout(this.timer); this.timer = setTimeout(() => this.flush(), this.options.delayMs); }

  async flush() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    for (const [, batch] of this.queue) {
      if (batch.keys.length === 0) continue;
      try { batch.resolve(await this.batchFn(batch.keys)); }
      catch (e) { batch.reject(e); }
    }
    this.queue.clear();
  }
}

export const userLoader = new BatchLoader(ids => prisma.user.findMany({ where: { id: { in: ids } } }), u => u.id);
export const agentLoader = new BatchLoader(ids => prisma.agent.findMany({ where: { id: { in: ids } }, include: { _count: { select: { tasks: true, memories: true, executions: true } } } }), a => a.id);
export const workflowLoader = new BatchLoader(ids => prisma.workflow.findMany({ where: { id: { in: ids } } }), w => w.id);

export { BatchLoader };
