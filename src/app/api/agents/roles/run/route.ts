import { NextRequest, NextResponse } from "next/server";
import { roleSwarm } from "@/lib/roles";

export const dynamic = "force-dynamic";
export async function POST(request: NextRequest) {
  try {
    const { task, agents, userId } = await request.json();
    if (!task || !agents) return NextResponse.json({ error: "task et agents requis" }, { status: 400 });
    const mission = await roleSwarm.runMission(task, agents, userId || "api");
    return NextResponse.json({ mission, status: mission.status });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur" }, { status: 500 });
  }
}
