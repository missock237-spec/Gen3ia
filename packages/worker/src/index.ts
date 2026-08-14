import { createLogger } from '@gen3ia/core';
import './auto-worker.js';
const log = createLogger('worker-entry');
log.info('worker_started', { pid: process.pid, node: process.version });
process.on('SIGTERM', () => { log.info('worker_shutdown'); process.exit(0); });
process.on('SIGINT', () => { log.info('worker_shutdown'); process.exit(0); });
process.on('uncaughtException', (e) => { log.error('worker_uncaught', { error: e.message }); process.exit(1); });
process.on('unhandledRejection', (r) => { log.error('worker_unhandled_rejection', { reason: String(r) }); });
