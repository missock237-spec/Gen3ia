// ============================================================
// EXPORT — Export CSV des données
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") ?? "agents";
  const format = searchParams.get("format") ?? "csv";

  try {
    let data: Record<string, unknown>[] = [];

    switch (type) {
      case "agents":
        data = await prisma.agent.findMany({
          select: { id: true, name: true, type: true, status: true, createdAt: true },
        });
        break;

      case "executions":
        data = await prisma.agentExecution.findMany({
          select: { id: true, status: true, totalTokens: true, estimatedCost: true, createdAt: true },
          orderBy: { createdAt: "desc" },
          take: 1000,
        });
        break;

      case "users":
        data = await prisma.user.findMany({
          select: { id: true, email: true, name: true, plan: true, role: true, createdAt: true },
        });
        break;

      case "workflows":
        data = await prisma.workflow.findMany({
          select: { id: true, name: true, status: true, createdAt: true },
        });
        break;

      default:
        return NextResponse.json({ error: `Type "${type}" non supporté` }, { status: 400 });
    }

    if (format === "csv") {
      if (data.length === 0) {
        return new NextResponse("Aucune donnée", {
          headers: { "Content-Type": "text/csv", "Content-Disposition": `attachment; filename=${type}.csv` },
        });
      }

      const headers = Object.keys(data[0]!);
      const csvRows = [
        headers.join(","),
        ...data.map((row) => headers.map((h) => JSON.stringify(row[h] ?? "")).join(",")),
      ];

      return new NextResponse(csvRows.join("\n"), {
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename=${type}-${Date.now()}.csv`,
        },
      });
    }

    return NextResponse.json({ data, count: data.length });
  } catch (error) {
    console.error("Export error:", error);
    return NextResponse.json({ error: "Erreur lors de l'export" }, { status: 500 });
  }
}