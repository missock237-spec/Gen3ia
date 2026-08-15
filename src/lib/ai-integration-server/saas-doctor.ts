/**
 * SaaS Doctor — Genova AI Integration Server
 * Diagnostic system with SSRF protection
 */

import { chatCompletion, type AIMessage } from '@/lib/ai-router';
import { createLogger } from '@/lib/logger';
import { getIntegrationRegistry } from '@/lib/integration-engine/registry';
import { db } from '@/lib/db';
import { safeFetch, validateUrl } from '@/lib/ssrf-protect';

const log = createLogger('saas-doctor');

export type DiagnosticSeverity = 'critical' | 'warning' | 'info' | 'healthy';

export interface DiagnosticCheck {
  id: string;
  name: string;
  category: 'database' | 'api' | 'auth' | 'integration' | 'config' | 'performance' | 'security';
  severity: DiagnosticSeverity;
  message: string;
  details?: string;
  fix?: string;
  autoFixAvailable: boolean;
  checkedAt: Date;
  durationMs: number;
}

export interface DiagnosticReport {
  timestamp: Date;
  overallHealth: number;
  status: 'healthy' | 'degraded' | 'unhealthy' | 'critical';
  checks: DiagnosticCheck[];
  summary: { total: number; healthy: number; warnings: number; critical: number };
  aiRecommendations: string[];
  autoFixesApplied: string[];
}

async function checkDatabaseConnection(): Promise<DiagnosticCheck> {
  const start = Date.now();
  try {
// @ts-ignore — type narrowing pending, see refactor ticket
    await db.$queryRaw`SELECT 1`;
    return { id: 'db-connection', name: 'Database Connection', category: 'database', severity: 'healthy', message: 'PostgreSQL connection active', checkedAt: new Date(), durationMs: Date.now() - start, autoFixAvailable: false };
  } catch (error) {
    return { id: 'db-connection', name: 'Database Connection', category: 'database', severity: 'critical', message: 'PostgreSQL connection failed', details: error instanceof Error ? error.message : 'Unknown', fix: 'Check DATABASE_URL in .env', autoFixAvailable: false, checkedAt: new Date(), durationMs: Date.now() - start };
  }
}

async function checkDatabaseSchema(): Promise<DiagnosticCheck> {
  const start = Date.now();
  try {
// @ts-ignore — type narrowing pending, see refactor ticket
    const tableCount = await db.$queryRaw`SELECT count(*)::int as count FROM information_schema.tables WHERE table_schema = 'public'`;
    const count = Array.isArray(tableCount) ? (tableCount[0] as { count: number }).count : 0;
    if (count >= 20) return { id: 'db-schema', name: 'Database Schema', category: 'database', severity: 'healthy', message: `Schema has ${count} tables`, checkedAt: new Date(), durationMs: Date.now() - start, autoFixAvailable: false };
    return { id: 'db-schema', name: 'Database Schema', category: 'database', severity: 'warning', message: `Only ${count} tables found`, fix: 'Run: npx prisma db push', autoFixAvailable: false, checkedAt: new Date(), durationMs: Date.now() - start };
  } catch (error) {
    return { id: 'db-schema', name: 'Database Schema', category: 'database', severity: 'critical', message: 'Cannot verify schema', details: error instanceof Error ? error.message : 'Unknown', autoFixAvailable: false, checkedAt: new Date(), durationMs: Date.now() - start };
  }
}

async function checkGroqAPI(): Promise<DiagnosticCheck> {
  const start = Date.now();
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return { id: 'api-groq', name: 'Groq API', category: 'api', severity: 'warning', message: 'GROQ_API_KEY not configured', fix: 'Add GROQ_API_KEY to .env', autoFixAvailable: false, checkedAt: new Date(), durationMs: Date.now() - start };
  try {
    const res = await safeFetch('https://api.groq.com/openai/v1/models', {
      method: 'GET', headers: { Authorization: `Bearer ${apiKey}` },
    }, 'groq');
    if (res.ok) return { id: 'api-groq', name: 'Groq API', category: 'api', severity: 'healthy', message: 'Groq API accessible', checkedAt: new Date(), durationMs: Date.now() - start, autoFixAvailable: false };
    return { id: 'api-groq', name: 'Groq API', category: 'api', severity: 'critical', message: `Groq API status ${res.status}`, fix: 'Check GROQ_API_KEY', autoFixAvailable: false, checkedAt: new Date(), durationMs: Date.now() - start };
  } catch (error) {
    return { id: 'api-groq', name: 'Groq API', category: 'api', severity: 'warning', message: 'Cannot reach Groq API', details: error instanceof Error ? error.message : 'Network error', autoFixAvailable: false, checkedAt: new Date(), durationMs: Date.now() - start };
  }
}

async function checkOpenRouterAPI(): Promise<DiagnosticCheck> {
  const start = Date.now();
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return { id: 'api-openrouter', name: 'OpenRouter API', category: 'api', severity: 'warning', message: 'OPENROUTER_API_KEY not configured', fix: 'Add OPENROUTER_API_KEY to .env', autoFixAvailable: false, checkedAt: new Date(), durationMs: Date.now() - start };
  try {
    const res = await safeFetch('https://openrouter.ai/api/v1/models', {
      method: 'GET', headers: { Authorization: `Bearer ${apiKey}` },
    }, 'openrouter');
    if (res.ok) return { id: 'api-openrouter', name: 'OpenRouter API', category: 'api', severity: 'healthy', message: 'OpenRouter accessible', checkedAt: new Date(), durationMs: Date.now() - start, autoFixAvailable: false };
    return { id: 'api-openrouter', name: 'OpenRouter API', category: 'api', severity: 'critical', message: `OpenRouter status ${res.status}`, fix: 'Check OPENROUTER_API_KEY', autoFixAvailable: false, checkedAt: new Date(), durationMs: Date.now() - start };
  } catch (error) {
    return { id: 'api-openrouter', name: 'OpenRouter API', category: 'api', severity: 'warning', message: 'Cannot reach OpenRouter', details: error instanceof Error ? error.message : 'Network error', autoFixAvailable: false, checkedAt: new Date(), durationMs: Date.now() - start };
  }
}

async function checkQdrant(): Promise<DiagnosticCheck> {
  const start = Date.now();
  const qdrantUrl = process.env.QDRANT_URL || 'http://localhost:6333';
  try {
    // SSRF protection: QDRANT_URL ne doit pointer que vers localhost
    const validation = validateUrl(qdrantUrl, 'internal');
    if (!validation.safe) {
      return { id: 'service-qdrant', name: 'Qdrant Vector DB', category: 'integration', severity: 'warning', message: `QDRANT_URL invalide: ${validation.error}`, fix: 'QDRANT_URL doit pointer vers localhost', autoFixAvailable: false, checkedAt: new Date(), durationMs: Date.now() - start };
    }
    const headers: Record<string, string> = {};
    if (process.env.QDRANT_API_KEY) headers['api-key'] = process.env.QDRANT_API_KEY;
    const res = await safeFetch(`${qdrantUrl}/healthz`, { method: 'GET', headers }, 'internal');
    if (res.ok) return { id: 'service-qdrant', name: 'Qdrant Vector DB', category: 'integration', severity: 'healthy', message: 'Qdrant accessible', autoFixAvailable: false, checkedAt: new Date(), durationMs: Date.now() - start };
    return { id: 'service-qdrant', name: 'Qdrant Vector DB', category: 'integration', severity: 'warning', message: `Qdrant status ${res.status}`, fix: 'docker run -p 6333:6333 qdrant/qdrant', autoFixAvailable: false, checkedAt: new Date(), durationMs: Date.now() - start };
  } catch {
    const vectorStoreType = process.env.VECTOR_STORE_TYPE || 'sqlite';
    return { id: 'service-qdrant', name: 'Qdrant Vector DB', category: 'integration', severity: vectorStoreType === 'qdrant' ? 'warning' : 'info', message: 'Qdrant not reachable', fix: 'docker run -d --name qdrant -p 6333:6333 qdrant/qdrant', autoFixAvailable: false, checkedAt: new Date(), durationMs: Date.now() - start };
  }
}

async function checkRuflo(): Promise<DiagnosticCheck> {
  const start = Date.now();
  const rufloUrl = process.env.RUFLO_MCP_URL || 'http://localhost:8190';
  try {
    const validation = validateUrl(rufloUrl, 'internal');
    if (!validation.safe) return { id: 'service-ruflo', name: 'Ruflo MCP Server', category: 'integration', severity: 'warning', message: `RUFLO_MCP_URL invalide: ${validation.error}`, autoFixAvailable: false, checkedAt: new Date(), durationMs: Date.now() - start };
    const res = await safeFetch(`${rufloUrl}/health`, { method: 'GET' }, 'internal');
    if (res.ok) return { id: 'service-ruflo', name: 'Ruflo MCP Server', category: 'integration', severity: 'healthy', message: 'Ruflo accessible', autoFixAvailable: false, checkedAt: new Date(), durationMs: Date.now() - start };
    return { id: 'service-ruflo', name: 'Ruflo MCP Server', category: 'integration', severity: 'info', message: `Ruflo status ${res.status}`, autoFixAvailable: false, checkedAt: new Date(), durationMs: Date.now() - start };
  } catch { return { id: 'service-ruflo', name: 'Ruflo MCP Server', category: 'integration', severity: 'info', message: 'Ruflo not reachable', autoFixAvailable: false, checkedAt: new Date(), durationMs: Date.now() - start }; }
}

async function generateAIRecommendations(checks: DiagnosticCheck[]): Promise<string[]> {
  const issues = checks.filter(c => c.severity !== 'healthy');
  if (issues.length === 0) return ['All systems healthy'];
  const messages: AIMessage[] = [
    { role: 'system', content: 'Diagnostic expert. Provide 3-5 concise recommendations.' },
    { role: 'user', content: `Issues:\n${issues.map(i => `[${i.severity.toUpperCase()}] ${i.name}: ${i.message}`).join('\n')}` },
  ];
  try {
    const result = await chatCompletion(messages, 'fast');
    return result.content.split('\n').filter(l => l.trim()).slice(0, 5);
  } catch { return issues.slice(0, 5).map(i => i.fix || `Fix: ${i.name}`); }
}

export async function runDiagnostics(): Promise<DiagnosticReport> {
  const startTime = Date.now();
  log.info('Running SaaS diagnostics...');
  const checks: DiagnosticCheck[] = [];
  const [dbConn, dbSchema, groq, openrouter, qdrant, ruflo] = await Promise.all([
    checkDatabaseConnection(), checkDatabaseSchema(), checkGroqAPI(), checkOpenRouterAPI(), checkQdrant(), checkRuflo(),
  ]);
  checks.push(dbConn, dbSchema, groq, openrouter, qdrant, ruflo);
  let healthScore = 100;
  for (const c of checks) {
    switch (c.severity) { case 'critical': healthScore -= 25; break; case 'warning': healthScore -= 10; break; case 'info': healthScore -= 2; break; }
  }
  healthScore = Math.max(0, Math.min(100, healthScore));
  const aiRecommendations = await generateAIRecommendations(checks);
  return {
    timestamp: new Date(), overallHealth: healthScore,
    status: healthScore >= 80 ? 'healthy' : healthScore >= 60 ? 'degraded' : healthScore >= 30 ? 'unhealthy' : 'critical',
    checks, summary: { total: checks.length, healthy: checks.filter(c => c.severity === 'healthy').length, warnings: checks.filter(c => c.severity === 'warning').length, critical: checks.filter(c => c.severity === 'critical').length },
    aiRecommendations, autoFixesApplied: [],
  };
}

export async function quickHealthCheck(): Promise<{ health: number; status: DiagnosticReport['status'] }> {
  const report = await runDiagnostics();
  return { health: report.overallHealth, status: report.status };
}
