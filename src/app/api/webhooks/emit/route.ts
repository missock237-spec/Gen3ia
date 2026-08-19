import { NextRequest, NextResponse } from "next/server";
import { emitAgentEvent } from "@/lib/webhooks/emit";

export const dynamic = "force-dynamic";
export async function POST(request) {
  try { const { eventType, userId, data } = await request.json(); await emitAgentEvent(eventType, userId, data || {}); return NextResponse.json({ success: true }); }
// @ts-ignore — type narrowing pending, see refactor ticket
  catch (e) { return NextResponse.json({ error: e.message || "Erreur" }, { status: 500 }); }
}
