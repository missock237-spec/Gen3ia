import { NextRequest, NextResponse } from "next/server";
import { swarmOrchestrator } from "@/lib/agent/swarm";

export async function POST(request: NextRequest) {
  try {
    const { task, agentIds, userId } = await request.json();
    if (!task || !agentIds || !userId) return NextResponse.json({ error: "task, agentIds et userId requis" }, { status: 400 });
    const results = await swarmOrchestrator.orchestrate(task, agentIds, userId);
    return NextResponse.json({ results, status: swarmOrchestrator.getStatus() });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur" }, { status: 500 });
  }
}
