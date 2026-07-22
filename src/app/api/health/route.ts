import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const checks: Record<string, { status: string; error?: string }> = {};
  let globalStatus = "healthy";

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = { status: "connected" };
  } catch (error) {
    checks.database = { status: "error", error: String(error) };
    globalStatus = "degraded";
  }

  const memUsage = process.memoryUsage();
  const memPercent = Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100);
  if (memPercent > 90) {
    checks.memory = { status: "warning", error: `Heap ${memPercent}% used` };
    globalStatus = "degraded";
  } else {
    checks.memory = { status: "ok" };
  }

  return NextResponse.json({
    status: globalStatus,
    version: "1.0.0",
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    checks,
  });
}