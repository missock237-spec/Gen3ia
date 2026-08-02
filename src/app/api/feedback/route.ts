import { NextRequest, NextResponse } from "next/server";
import { feedbackLoop } from "@/lib/feedback";
import { emitFeedbackReceived } from "@/lib/webhooks/emit";





export const dynamic = "force-dynamic";
export async function POST(request) {
  try {
    const body = await request.json();
    const result = await feedbackLoop.submit(body);
    await emitFeedbackReceived(body.agentId, body.userId, body.rating).catch(() => {});
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur" }, { status: 500 });
  }
}

export async function GET(request) {
  try {
    const agentId = new URL(request.url).searchParams.get("agentId");
    if (!agentId) return NextResponse.json({ error: "agentId requis" }, { status: 400 });
    return NextResponse.json(await feedbackLoop.getAgentStats(agentId));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur" }, { status: 500 });
  }
}
