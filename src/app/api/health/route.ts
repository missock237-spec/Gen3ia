// ============================================================
// GET /api/health — État du service
// ============================================================
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const start = Date.now();
  const checks: Record<string, { status: string; latency?: number; error?: string }> = {};

  // Check PostgreSQL
  try {
    const dbStart = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    checks.database = { status: "ok", latency: Date.now() - dbStart };
  } catch (error) {
    checks.database = { status: "error", error: String(error) };
  }

  // Check Redis
  if (process.env.REDIS_URL) {
    try {
      const { Redis } = await import("ioredis");
      const redis = new Redis(process.env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 });
      const redisStart = Date.now();
      await redis.ping();
      await redis.quit();
      checks.redis = { status: "ok", latency: Date.now() - redisStart };
    } catch (error) {
      checks.redis = { status: "error", error: String(error) };
    }
  } else {
    checks.redis = { status: "disabled" };
  }

  // Check SebPay
  checks.sebpay = process.env.SEBPAY_API_KEY ? { status: "configured" } : { status: "not_configured" };

  // Stats
  let stats = {};
  try {
    const [users, agents, executions] = await Promise.all([
      prisma.user.count(),
      prisma.agent.count(),
      prisma.agentExecution.count(),
    ]);
    stats = { users, agents, executions };
  } catch {
    // Ignorer
  }

  const allOk = Object.values(checks).every(
    (c) => c.status === "ok" || c.status === "disabled" || c.status === "configured" || c.status === "not_configured",
  );

  return NextResponse.json({
    status: allOk ? "healthy" : "degraded",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
    checks,
    stats,
    responseTime: Date.now() - start,
  });
}