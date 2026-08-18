// ============================================================
// Gen3ia Evolution Engine — Public API (barrel)
// ============================================================
// Single import surface for the rest of the app:
//   import { startEvolution, runEvolutionCycle, getEvolutionRecord } from '@/lib/evolution';
// ============================================================

export * from './types';
export * from './config';
export * from './memory';
export * from './cost-tracker';
export * from './concurrency';
export * from './sandbox';
export * from './git';
export * from './validation';
export * from './observation';
export * from './rca';
export * from './planner';
export * from './modifier';
export * from './evaluation';
export * from './safety';
export * from './self-improvement';
export {
  startEvolution,
  runEvolutionCycle,
  triggerRollback,
  recoverCrashedRuns,
} from './orchestrator';
