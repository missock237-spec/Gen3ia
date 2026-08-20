import { NextRequest, NextResponse } from "next/server";
import { dashboardService } from "@/lib/dashboard";

export const dynamic = "force-dynamic";
export async function GET(request) {
  try {
    const s = new URL(request.url).searchParams;
    const userId = s.get("userId");
    const hours = parseInt(s.get("hours") || "24");
    if (!userId) return NextResponse.json({ error: "userId requis" }, { status: 400 });
    return NextResponse.json(await dashboardService.getRealtimeStats(userId, hours));
  } catch (e) {
    return NextResponse.json({ error: "Erreur" }, { status: 500 });
  }
}
