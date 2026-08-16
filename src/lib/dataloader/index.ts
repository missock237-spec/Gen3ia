import { prisma } from "@/lib/db";

type BatchLoadFn<T> = (keys: readonly unknown[]) => Promise<T[]>;
type KeyFn<T> = (item: T) => unknown;

class DataLoader<T extends object> {
  private queue: Map<string, { keys: unknown[]; resolve: (value: (T | Error)[]) => void }> = new Map();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private batchLoadFn: BatchLoadFn<T>;
  private keyFn: KeyFn<T>;
  private options: { maxBatchSize: number; delayMs: number };

  constructor(batchLoadFn: BatchLoadFn<T>, keyFn: KeyFn<T>, options: { maxBatchSize?: number; delayMs?: number } = {}) {
    this.batchLoadFn = batchLoadFn;
    this.keyFn = keyFn;
    this.options = { maxBatchSize: options.maxBatchSize ?? 100, delayMs: options.delayMs ?? 10 };
  }

  async load(key: unknown): Promise<T | null> {
    return new Promise<T | null>((resolve) => {
      const batchKey = "_default";
      if (!this.queue.has(batchKey)) {
        this.queue.set(batchKey, { keys: [], resolve: () => {} });
      }
      const batch = this.queue.get(batchKey)!;
      batch.keys.push(key);
      const originalKey = key;
      this.queue.set(batchKey, {
        keys: batch.keys,
        resolve: (results: (T | Error)[]) => {
          const item = results.find((r) => !(r instanceof Error) && this.keyFn(r) === originalKey) as T | undefined;
          resolve(item ?? null);
        },
      });
      if (batch.keys.length >= this.options.maxBatchSize) this.flush();
      else this.scheduleFlush();
    });
  }

  private scheduleFlush(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), this.options.delayMs);
  }

  private async flush(): Promise<void> {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    const batch = this.queue.get("_default");
    if (!batch || batch.keys.length === 0) return;
    const keys = [...batch.keys];
    this.queue.delete("_default");
    try {
      const results = await this.batchLoadFn(keys);
      const resultMap = new Map<unknown, T>();
      for (const item of results) resultMap.set(this.keyFn(item), item);
      batch.resolve(keys.map((k) => resultMap.get(k) ?? new Error(`Not found: ${k}`)));
    } catch {
      batch.resolve(keys.map(() => new Error("Batch load failed")));
    }
  }
}

export const userLoader = new DataLoader(
  async (ids: readonly unknown[]) => prisma.user.findMany({ where: { id: { in: ids as string[] } }, select: { id: true, name: true, email: true, role: true, plan: true, avatar: true, createdAt: true } }) as Promise<object[]>,
  (user) => (user as { id: string }).id,
);

export const agentLoader = new DataLoader(
  async (ids: readonly unknown[]) => prisma.agent.findMany({ where: { id: { in: ids as string[] } }, include: { _count: { select: { tasks: true, memories: true, executions: true } } } }) as Promise<object[]>,
  (agent) => (agent as { id: string }).id,
);

export const agentActionLogLoader = new DataLoader(
  async (agentIds: readonly unknown[]) => prisma.agentActionLog.findMany({ where: { agentId: { in: agentIds as string[] } }, orderBy: { createdAt: "desc" }, take: 1000 }) as Promise<object[]>,
  (log) => (log as { agentId: string }).agentId,
);

export const workflowLoader = new DataLoader(
  async (ids: readonly unknown[]) => prisma.workflow.findMany({ where: { id: { in: ids as string[] } } }) as Promise<object[]>,
  (wf) => (wf as { id: string }).id,
);

export const sessionLoader = new DataLoader(
  async (userIds: readonly unknown[]) => prisma.session.findMany({ where: { userId: { in: userIds as string[] }, expiresAt: { gt: new Date() } } }) as Promise<object[]>,
  (session) => (session as { userId: string }).userId,
);

export { DataLoader };
