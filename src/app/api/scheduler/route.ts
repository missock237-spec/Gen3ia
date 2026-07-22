import { NextRequest, NextResponse } from "next/server";
import { agentScheduler } from "@/lib/scheduler";
export async function POST(request) {
  try { const body = await request.json(); return NextResponse.json(await agentScheduler.schedule(body), { status: 201 }); }
  catch (e) { return NextResponse.json({ error: e.message || "Erreur" }, { status: 500 }); }
}
export async function GET(request) {
  try {
    const userId = new URL(request.url).searchParams.get("userId");
    if (!userId) return NextResponse.json({ error: "userId requis" }, { status: 400 });
    return NextResponse.json({ tasks: await agentScheduler.listByUser(userId) });
  } catch (e) { return NextResponse.json({ error: e.message || "Erreur" }, { status: 500 }); }
}
export async function DELETE(request) {
  try {
    const taskId = new URL(request.url).searchParams.get("taskId");
    if (!taskId) return NextResponse.json({ error: "taskId requis" }, { status: 400 });
    await agentScheduler.unschedule(taskId);
    return NextResponse.json({ success: true });
  } catch (e) { return NextResponse.json({ error: e.message || "Erreur" }, { status: 500 }); }
}
